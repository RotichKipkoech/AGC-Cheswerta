"""System settings (key/JSON value).

GET  /api/settings          — list all (any authenticated user)
PUT  /api/settings/<key>    — upsert (admin OR super_admin)
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from extensions import db
from models import SystemSetting
from security import require_auth, require_role, log_audit

bp = Blueprint("settings", __name__, url_prefix="/api/settings")


@bp.get("")
@require_auth
def list_settings():
    items = SystemSetting.query.all()
    return jsonify({"data": [s.to_dict() for s in items], "settings": [s.to_dict() for s in items]})


@bp.put("/<key>")
@require_role("admin", "super_admin")   # ← was super_admin only; now admin can also save
def upsert_setting(key):
    data = request.get_json(silent=True) or {}
    if "value" not in data:
        return jsonify({"error": "value required"}), 400

    s = SystemSetting.query.get(key)
    old = s.to_dict() if s else None
    if not s:
        s = SystemSetting(key=key, value=data["value"],
                          description=data.get("description"))
        db.session.add(s)
    else:
        s.value = data["value"]
        if "description" in data:
            s.description = data["description"]

    s.updated_by = get_jwt_identity()
    db.session.commit()
    log_audit("system_settings", "UPDATE" if old else "INSERT",
              record_id=s.key, old=old, new=s.to_dict())
    return jsonify({"data": s.to_dict(), **s.to_dict()})
