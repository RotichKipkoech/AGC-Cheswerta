"""Module toggles.

GET /api/modules          — list all (any authenticated user)
PUT /api/modules/<key>    — toggle enabled / update (admin OR super_admin)
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from extensions import db
from models import Module
from security import require_auth, require_role, log_audit

bp = Blueprint("modules", __name__, url_prefix="/api/modules")


@bp.get("")
@require_auth
def list_modules():
    items = Module.query.order_by(Module.sort_order.asc()).all()
    return jsonify({"data": [m.to_dict() for m in items], "modules": [m.to_dict() for m in items]})


@bp.put("/<key>")
@require_role("admin", "super_admin")   # ← was super_admin only
def update_module(key):
    m = Module.query.get_or_404(key)
    data = request.get_json(silent=True) or {}
    old = m.to_dict()
    for f in ("label", "description", "enabled", "sort_order"):
        if f in data:
            setattr(m, f, data[f])
    m.updated_by = get_jwt_identity()
    db.session.commit()
    log_audit("modules", "UPDATE", record_id=m.key, old=old, new=m.to_dict())
    return jsonify({"data": m.to_dict(), **m.to_dict()})
