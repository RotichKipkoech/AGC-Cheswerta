"""System settings (key/JSON value).

GET  /api/settings          — list all (any authenticated user)
PUT  /api/settings/<key>    — upsert (admin OR super_admin)
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from extensions import db
from models import SystemSetting
from security import require_auth, require_role, log_audit
from copy import deepcopy


bp = Blueprint("settings", __name__, url_prefix="/api/settings")


@bp.get("")
@require_auth
def list_settings():
    items = []

    for s in SystemSetting.query.all():
        item = s.to_dict()

        # Hide sensitive integration secrets
        if item["key"] == "integrations":
            value = deepcopy(item.get("value") or {})

            sms = value.get("sms", {})
            if sms.get("api_key"):
                sms["api_key_masked"] = f"••••{sms['api_key'][-4:]}"
                sms.pop("api_key", None)

            email = value.get("email", {})
            if email.get("api_key"):
                email["api_key_masked"] = "••••"
                email.pop("api_key", None)

            mpesa = value.get("mpesa", {})
            if mpesa.get("passkey"):
                mpesa["passkey_masked"] = "••••"
                mpesa.pop("passkey", None)

            value["sms"] = sms
            value["email"] = email
            value["mpesa"] = mpesa

            item["value"] = value

        items.append(item)

    return jsonify({
        "data": items,
        "settings": items
    })


@bp.put("/<key>")
@require_role("admin", "super_admin")
def upsert_setting(key):
    data = request.get_json(silent=True) or {}
    if "value" not in data:
        return jsonify({"error": "value required"}), 400

    value = data["value"]

    # Handle SMS integration securely
    if key == "integrations":
        sms = value.get("sms", {})

        # Keep the real API key if frontend sends the masked version
        existing = SystemSetting.query.get(key)
        if existing:
            existing_sms = (existing.value or {}).get("sms", {})
            if sms.get("api_key") in (None, "", sms.get("api_key_masked")):
                sms["api_key"] = existing_sms.get("api_key")

        # Update masked version
        if sms.get("api_key"):
            sms["api_key_masked"] = "••••" + sms["api_key"][-4:]
        else:
            sms["api_key_masked"] = ""

        value["sms"] = sms

    s = SystemSetting.query.get(key)
    old = s.to_dict() if s else None

    if not s:
        s = SystemSetting(
            key=key,
            value=value,
            description=data.get("description")
        )
        db.session.add(s)
    else:
        s.value = value
        if "description" in data:
            s.description = data["description"]

    s.updated_by = get_jwt_identity()
    db.session.commit()

    log_audit(
        "system_settings",
        "UPDATE" if old else "INSERT",
        record_id=s.key,
        old=old,
        new=s.to_dict()
    )

    # Never return secrets to frontend
    response = s.to_dict()

    if key == "integrations":
        response["value"]["sms"].pop("api_key", None)

    return jsonify({
        "data": response,
        **response
    })