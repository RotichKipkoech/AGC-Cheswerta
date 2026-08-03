"""Feature flag toggles."""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from extensions import db
from models import FeatureFlag
from security import require_auth, require_role, log_audit

bp = Blueprint("feature_flags", __name__, url_prefix="/api/feature-flags")


@bp.get("")
@require_auth
def list_flags():
    items = FeatureFlag.query.order_by(FeatureFlag.label.asc()).all()
    return jsonify({"flags": [f.to_dict() for f in items]})


@bp.put("/<key>")
@require_role("super_admin")
def update_flag(key):
    f = FeatureFlag.query.get_or_404(key)
    data = request.get_json(silent=True) or {}
    old = f.to_dict()
    if "enabled" in data:
        f.enabled = bool(data["enabled"])
    if "label" in data:
        f.label = data["label"]
    if "description" in data:
        f.description = data["description"]
    f.updated_by = get_jwt_identity()
    db.session.commit()
    log_audit("feature_flags", "UPDATE", record_id=f.key, old=old, new=f.to_dict())
    return jsonify(f.to_dict())
