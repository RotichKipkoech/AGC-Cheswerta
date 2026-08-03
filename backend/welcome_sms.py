import json, urllib.request, urllib.parse, base64, logging
from models import Department, SystemSetting
from sms_logger import log_sms

log = logging.getLogger(__name__)


# ─── phone normalisation ──────────────────────────────────────────────────────

def _normalise_phone(raw: str) -> str:
    """Normalise any KE phone format → 2547XXXXXXXX."""
    p = (raw or "").strip().replace(" ", "").replace("-", "")
    if p.startswith("+"):
        p = p[1:]
    if p.startswith("07") and len(p) == 10:
        p = "254" + p[1:]
    elif p.startswith("7") and len(p) == 9:
        p = "254" + p
    return p


# ─── message builder ──────────────────────────────────────────────────────────

def _build_message(member) -> str:
    first = (member.full_name or "").strip().split()[0].capitalize() or "Member"
    dept  = (member.department or "").strip()

    # Look up leader from departments table
    leader = None
    if dept:
        row = Department.query.filter(
            Department.name.ilike(dept)
        ).first()
        if row and row.leader_name:
            leader = row.leader_name.strip()

    if dept and leader:
        body = (
            f"Dear {first}, Welcome to CheswertaAGC! "
            f"You have been added to the {dept} ministry led by {leader}. "
            f"God bless you. - CheswertaAGC"
        )
    elif dept:
        body = (
            f"Dear {first}, Welcome to CheswertaAGC! "
            f"You have been added to the {dept} ministry. "
            f"God bless you. - CheswertaAGC"
        )
    else:
        body = (
            f"Dear {first}, Welcome to CheswertaAGC! "
            f"We are glad to have you with us. God bless you. - CheswertaAGC"
        )

    return body


# ─── provider dispatch ────────────────────────────────────────────────────────

def _dispatch(sms: dict, phone: str, message: str) -> str:
    """Send via the configured provider. Returns 'sent'/'queued' or raises."""
    provider = (sms.get("provider") or "none").lower()
    api_key  = sms.get("api_key") or ""
    sender   = sms.get("sender_id") or "AGC"
    username = sms.get("username") or ""
    url        = sms.get("url") or ""
    partner_id = sms.get("partner_id") or ""   # TextSMS only

    if provider == "talksasa":
        endpoint = url or "https://bulksms.talksasa.com/api/v3/sms/send"
        payload  = json.dumps({"recipient": phone, "sender_id": sender, "message": message}).encode()
        req      = urllib.request.Request(endpoint, data=payload, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Authorization", f"Bearer {api_key}")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            raise RuntimeError(e.read().decode("utf-8", errors="replace")[:200])
        result     = json.loads(raw)
        top_status = result.get("status")
        data_status = (result.get("data") or {}).get("status", "")
        if top_status == "success" or data_status in ("queued", "sent"):
            return "queued" if data_status == "queued" else "sent"
        raise RuntimeError(result.get("message") or result.get("error") or raw[:200])

    elif provider == "africastalking":
        endpoint = url or "https://api.africastalking.com/version1/messaging"
        if (username or "").lower() == "sandbox":
            endpoint = "https://api.sandbox.africastalking.com/version1/messaging"
        payload = urllib.parse.urlencode({
            "username": username or "sandbox",
            "to": phone, "message": message, "from": sender,
        }).encode()
        req = urllib.request.Request(endpoint, data=payload, method="POST")
        req.add_header("apiKey", api_key)
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        req.add_header("Accept", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            raise RuntimeError(e.read().decode("utf-8", errors="replace")[:200])
        recipients = result.get("SMSMessageData", {}).get("Recipients", [])
        if recipients and recipients[0].get("statusCode") in (101, 102):
            return "sent"
        raise RuntimeError(str(result)[:200])

    elif provider == "twilio":
        account_sid = username
        endpoint    = url or f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        payload     = urllib.parse.urlencode({"To": phone, "From": sender, "Body": message}).encode()
        creds       = base64.b64encode(f"{account_sid}:{api_key}".encode()).decode()
        req         = urllib.request.Request(endpoint, data=payload, method="POST")
        req.add_header("Authorization", f"Basic {creds}")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            raise RuntimeError(e.read().decode("utf-8", errors="replace")[:200])
        if result.get("sid"):
            return "sent"
        raise RuntimeError(result.get("message", str(result))[:200])

    elif provider == "custom":
        if not url:
            raise RuntimeError("Custom provider URL not set")
        payload = json.dumps({"to": phone, "message": message, "from": sender, "api_key": api_key}).encode()
        req     = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Content-Type", "application/json")
        if api_key:
            req.add_header("Authorization", f"Bearer {api_key}")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp.read()
            return "sent"
        except urllib.error.HTTPError as e:
            raise RuntimeError(e.read().decode("utf-8", errors="replace")[:200])

    elif provider == "textsms":
        endpoint   = url or "https://sms.textsms.co.ke/api/services/sendsms/"
        partner_id = sms.get("partner_id") or ""
        payload    = json.dumps({
            "partnerID": partner_id,
            "apikey":    api_key,
            "mobile":    phone,
            "message":   message,
            "shortcode": sender,
            "pass_type": "plain",
        }).encode()
        req = urllib.request.Request(endpoint, data=payload, method="POST")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            raise RuntimeError(e.read().decode("utf-8", errors="replace")[:200])
        result    = json.loads(raw)
        if result.get("error"):
            raise RuntimeError(result["error"])
        responses = result.get("responses", [])
        code      = responses[0].get("response-code") if responses else None
        if code == 200 or result.get("status") == "success":
            return "sent"
        raise RuntimeError(str(result)[:200])

    raise RuntimeError(f"Unknown provider: {provider}")


# ─── public entry point ───────────────────────────────────────────────────────

def send_welcome_sms(member) -> str:
    """
    Called right after a new member is committed to the DB.
    Returns a status string — never raises.
    """
    if not (member.phone or "").strip():
        log_sms(event_type="welcome", phone="", message="", status="no_phone",
                recipient_name=member.full_name)
        return "no_phone"

    setting = SystemSetting.query.get("integrations")
    if not setting or not setting.value:
        log_sms(event_type="welcome", phone=member.phone, message="",
                status="no_provider", recipient_name=member.full_name)
        return "no_provider"

    sms = setting.value.get("sms") or {}
    provider = (sms.get("provider") or "none").lower()
    if provider == "none":
        log_sms(event_type="welcome", phone=member.phone, message="",
                provider=None, status="no_provider", recipient_name=member.full_name)
        return "no_provider"

    phone   = _normalise_phone(member.phone)
    message = _build_message(member)

    try:
        status = _dispatch(sms, phone, message)
        log.info("Welcome SMS %s → %s (%s)", status, phone, member.full_name)
        log_sms(event_type="welcome", phone=phone, message=message,
                provider=provider, status=status, recipient_name=member.full_name)
        return status
    except Exception as exc:
        reason = str(exc)[:120]
        log.warning("Welcome SMS failed for %s (%s): %s", member.full_name, phone, reason)
        log_sms(event_type="welcome", phone=phone, message=message,
                provider=provider, status="failed",
                recipient_name=member.full_name, error_detail=reason)
        return f"failed:{reason}"