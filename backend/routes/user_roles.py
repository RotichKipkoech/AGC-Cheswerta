"""User-roles routes: GET /api/user-roles, PUT /api/user-roles/:user_id"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db
from models import User, UserRole
from security import require_role as require_roles, log_audit

VALID_ROLES = {"super_admin", "admin", "pastor", "secretary", "treasurer", "ministry_leader", "lay_leader"}

bp = Blueprint("user_roles", __name__, url_prefix="/api/user-roles")


@bp.get("")
@jwt_required()
@require_roles("super_admin", "admin", "pastor", "secretary")
def list_roles():
    rows = UserRole.query.all()
    return jsonify({"data": [{"user_id": str(r.user_id), "role": r.role} for r in rows]})


@bp.put("/<user_id>")
@jwt_required()
@require_roles("super_admin", "admin")
def set_role(user_id):
    data = request.get_json(silent=True) or {}
    new_role = data.get("role", "").strip()
    if new_role not in VALID_ROLES:
        return jsonify({"error": f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}"}), 400

    target = User.query.get(user_id)
    if not target:
        return jsonify({"error": "User not found"}), 404

    # Prevent non-super-admins from assigning super_admin
    actor_uid = get_jwt_identity()
    actor = User.query.get(actor_uid)
    actor_role_row = UserRole.query.filter_by(user_id=actor_uid).first()
    if new_role == "super_admin" and (not actor_role_row or actor_role_row.role != "super_admin"):
        return jsonify({"error": "Only super admins can assign the super_admin role"}), 403

    # Also prevent demoting another super_admin unless you are one
    existing = UserRole.query.filter_by(user_id=user_id).first()
    if existing and existing.role == "super_admin" and (not actor_role_row or actor_role_row.role != "super_admin"):
        return jsonify({"error": "Only super admins can change a super_admin's role"}), 403

    old_role = existing.role if existing else None
    if existing:
        existing.role = new_role
    else:
        db.session.add(UserRole(user_id=user_id, role=new_role))

    db.session.commit()
    log_audit("user_roles", "UPDATE", record_id=user_id,
              old={"role": old_role}, new={"role": new_role}, actor=actor)
    return jsonify({"data": {"user_id": str(user_id), "role": new_role}})