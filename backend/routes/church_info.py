"""
Church identification info — district, local church name, code.

Used to auto-fill the Monthly District Report header in Reports.tsx
instead of hardcoded placeholder values. Stored in SystemSetting under
the key "church_info", consistent with how other site-wide settings
(app_branding, integrations, security_policy, etc.) are stored.
"""
from flask import Blueprint, request, jsonify
from extensions import db
from models import SystemSetting
from security import require_auth, require_role

bp = Blueprint("church_info", __name__, url_prefix="/api/church-info")

_DEFAULTS = {"district": "", "local_church": "", "code": ""}


@bp.get("")
@require_auth
def get_church_info():
    setting = SystemSetting.query.get("church_info")
    if not setting or not setting.value:
        return jsonify(_DEFAULTS)
    v = setting.value
    return jsonify({
        "district": v.get("district", ""),
        "local_church": v.get("local_church", ""),
        "code": v.get("code", ""),
    })


@bp.put("")
@require_role("admin", "super_admin", "treasurer", "secretary", "pastor")
def update_church_info():
    data = request.get_json(silent=True) or {}
    value = {
        "district": (data.get("district") or "").strip(),
        "local_church": (data.get("local_church") or "").strip(),
        "code": (data.get("code") or "").strip(),
    }
    setting = SystemSetting.query.get("church_info")
    if setting:
        setting.value = value
    else:
        db.session.add(SystemSetting(key="church_info", value=value))
    db.session.commit()
    return jsonify(value)