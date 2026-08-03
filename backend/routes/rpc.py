"""RPC dispatcher.

POST /api/rpc/is_account_locked
POST /api/rpc/get_email_by_username
POST /api/rpc/test_sms
"""
import json, urllib.request, urllib.parse, base64
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from security import check_account_locked
from models import User, SystemSetting

bp = Blueprint("rpc", __name__, url_prefix="/api/rpc")


@bp.post("/is_account_locked")
def is_account_locked():
    body = request.get_json(silent=True) or {}
    ident = (body.get("_identifier") or "").strip().lower()
    if not ident:
        return jsonify({"data": [], "error": None})
    locked, retry, reason = check_account_locked(ident)
    return jsonify({"data": [{"locked": locked, "retry_after_seconds": retry, "fail_count": 0, "reason": reason}], "error": None})


@bp.post("/get_email_by_username")
def get_email_by_username():
    body = request.get_json(silent=True) or {}
    u = User.query.filter_by(username=(body.get("_username") or "").strip().lower()).first()
    return jsonify({"data": u.email if u else None, "error": None})


@bp.post("/test_sms")
@jwt_required()
def test_sms():
    body = request.get_json(silent=True) or {}
    phone = (body.get("phone") or "").strip()
    if not phone:
        return jsonify({"error": "phone number required"}), 400

    setting = SystemSetting.query.get("integrations")
    if not setting or not setting.value:
        return jsonify({"error": "No SMS integration configured. Save your SMS settings first."}), 400

    sms = setting.value.get("sms") or {}
    provider = (sms.get("provider") or "none").lower()
    api_key  = sms.get("api_key") or ""
    sender   = sms.get("sender_id") or "AGC"
    username = sms.get("username") or ""
    url      = sms.get("url") or ""
    msg      = "AGC Cheswerta  — test message. Your SMS integration is working!"

    if provider == "none" or not provider:
        return jsonify({"error": "No SMS provider configured. Choose Africa's Talking, Twilio, or Custom."}), 400

    try:
        if provider == "africastalking":
            endpoint = url or "https://api.africastalking.com/version1/messaging"
            is_sandbox = (username or "").lower() == "sandbox"
            if is_sandbox:
                endpoint = "https://api.sandbox.africastalking.com/version1/messaging"
            payload = urllib.parse.urlencode({
                "username": username or "sandbox",
                "to": phone,
                "message": msg,
                "from": sender,
            }).encode()
            req = urllib.request.Request(endpoint, data=payload, method="POST")
            req.add_header("apiKey", api_key)
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
            req.add_header("Accept", "application/json")
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    raw = resp.read().decode("utf-8", errors="replace")
            except urllib.error.HTTPError as e:
                raw = e.read().decode("utf-8", errors="replace")
                return jsonify({"error": f"Africa's Talking error: {raw[:300]}"}), 502
            try:
                result = json.loads(raw)
            except Exception:
                return jsonify({"error": f"Unexpected response: {raw[:300]}"}), 502
            sms_res = result.get("SMSMessageData", {})
            recipients = sms_res.get("Recipients", [])
            if recipients and recipients[0].get("statusCode") == 101:
                return jsonify({"ok": True, "message": f"Test SMS sent to {phone} via Africa's Talking", "detail": result})
            return jsonify({"ok": True, "message": "Sent (check recipient status)", "detail": result})

        elif provider == "twilio":
            account_sid = username
            auth_token  = api_key
            endpoint = url or f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
            payload = urllib.parse.urlencode({"To": phone, "From": sender, "Body": msg}).encode()
            creds = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
            req = urllib.request.Request(endpoint, data=payload, method="POST")
            req.add_header("Authorization", f"Basic {creds}")
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    result = json.loads(resp.read())
            except urllib.error.HTTPError as e:
                raw = e.read().decode("utf-8", errors="replace")
                return jsonify({"error": f"Twilio error: {raw[:300]}"}), 502
            return jsonify({"ok": True, "message": f"Test SMS sent via Twilio (SID: {result.get('sid', '?')})", "detail": result})

        elif provider == "custom":
            if not url:
                return jsonify({"error": "Custom provider requires a URL. Add it in the SMS URL field."}), 400
            payload = json.dumps({"to": phone, "message": msg, "from": sender, "api_key": api_key}).encode()
            req = urllib.request.Request(url, data=payload, method="POST")
            req.add_header("Content-Type", "application/json")
            if api_key:
                req.add_header("Authorization", f"Bearer {api_key}")
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    raw = resp.read().decode("utf-8", errors="replace")
                    try:
                        result = json.loads(raw)
                    except Exception:
                        result = {"response": raw[:300]}
            except urllib.error.HTTPError as e:
                raw = e.read().decode("utf-8", errors="replace")
                return jsonify({"error": f"Custom provider error: {raw[:300]}"}), 502
            return jsonify({"ok": True, "message": "Test SMS sent via custom provider", "detail": result})

        elif provider == "talksasa":
            endpoint = url or "https://bulksms.talksasa.com/api/v3/sms/send"
            payload = json.dumps({
                "recipient": phone,
                "sender_id": sender,
                "message": msg,
            }).encode()
            req = urllib.request.Request(endpoint, data=payload, method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("Authorization", f"Bearer {api_key}")
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    raw = resp.read().decode("utf-8", errors="replace")
            except urllib.error.HTTPError as e:
                raw = e.read().decode("utf-8", errors="replace")
                return jsonify({"error": f"TalkSasa error: {raw[:300]}"}), 502
            try:
                result = json.loads(raw)
            except Exception:
                return jsonify({"error": f"Unexpected response: {raw[:300]}"}), 502
            # Success: {"status": "success"} OR {"data": {"status": "queued"|"sent"}}
            top_status = result.get("status")
            data_status = (result.get("data") or {}).get("status", "")
            if top_status == "success" or data_status in ("queued", "sent"):
                return jsonify({"ok": True, "message": f"Test SMS sent to {phone} via TalkSasa", "detail": result})
            return jsonify({"error": f"TalkSasa: {result.get('message') or result.get('error') or raw[:200]}"}), 502

        elif provider == "textsms":
            endpoint = url or "https://sms.textsms.co.ke/api/services/sendsms/"
            partner_id = sms.get("partner_id") or ""
            payload = json.dumps({
                "partnerID":   partner_id,
                "apikey":      api_key,
                "mobile":      phone,
                "message":     msg,
                "shortcode":   sender,
                "pass_type":   "plain",
            }).encode()
            req = urllib.request.Request(endpoint, data=payload, method="POST")
            req.add_header("Content-Type", "application/json")
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    raw = resp.read().decode("utf-8", errors="replace")
            except urllib.error.HTTPError as e:
                raw = e.read().decode("utf-8", errors="replace")
                return jsonify({"error": f"TextSMS error: {raw[:300]}"}), 502
            try:
                result = json.loads(raw)
            except Exception:
                return jsonify({"error": f"Unexpected response: {raw[:300]}"}), 502
            # TextSMS returns {"responses": [{"response-code": 200, ...}]}
            # or {"error": "..."} on failure
            if result.get("error"):
                return jsonify({"error": f"TextSMS: {result['error']}"}), 502
            responses = result.get("responses", [])
            code = (responses[0].get("response-code") if responses else None)
            if code == 200 or result.get("status") == "success":
                return jsonify({"ok": True, "message": f"Test SMS sent to {phone} via TextSMS", "detail": result})
            return jsonify({"error": f"TextSMS: {result}"}), 502

        return jsonify({"error": f"Unknown provider '{provider}'"}), 400

    except Exception as e:
        return jsonify({"error": f"SMS send failed: {str(e)}"}), 502