"""Profile routes: GET/PATCH /api/profiles/me, GET /api/profiles, PATCH /api/profiles/:id"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db
from models import User, Profile, UserRole
from security import require_role as require_roles, log_audit

bp = Blueprint("profiles", __name__, url_prefix="/api/profiles")

ALLOWED_FIELDS = {"full_name", "phone", "avatar_url", "email"}


def _profile_dict(user: User):
    p = user.profile
    role_row = UserRole.query.filter_by(user_id=user.id).first()
    return {
        "user_id": str(user.id),
        "username": user.username,
        "full_name": p.full_name if p else None,
        "email": p.email if p else user.email,
        "phone": p.phone if p else None,
        "avatar_url": p.avatar_url if p else None,
        "is_active": user.is_active,
        "created_at": p.created_at.isoformat() if p and p.created_at else None,
        "role": role_row.role if role_row else None,
    }


@bp.get("/me")
@jwt_required()
def get_me():
    uid = get_jwt_identity()
    user = User.query.get(uid)
    if not user:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"data": _profile_dict(user)})


@bp.patch("/me")
@jwt_required()
def update_me():
    uid = get_jwt_identity()
    user = User.query.get(uid)
    if not user:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(silent=True) or {}
    patch = {k: v for k, v in data.items() if k in ALLOWED_FIELDS}

    if not user.profile:
        user.profile = Profile(user_id=user.id)
        db.session.add(user.profile)

    for k, v in patch.items():
        setattr(user.profile, k, v)

    db.session.commit()
    log_audit("profiles", "UPDATE", record_id=user.id, new=patch, actor=user)
    return jsonify({"data": _profile_dict(user)})


@bp.get("")
@jwt_required()
@require_roles("super_admin", "admin", "secretary", "pastor", "lay_leader")
def list_profiles():
    users = User.query.order_by(User.id).all()
    return jsonify({"data": [_profile_dict(u) for u in users]})


@bp.patch("/<user_id>")
@jwt_required()
@require_roles("super_admin", "admin")
def update_profile(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    patch = {k: v for k, v in data.items() if k in ALLOWED_FIELDS}

    if not user.profile:
        user.profile = Profile(user_id=user.id)
        db.session.add(user.profile)

    for k, v in patch.items():
        setattr(user.profile, k, v)

    db.session.commit()
    current_uid = get_jwt_identity()
    actor = User.query.get(current_uid)
    log_audit("profiles", "UPDATE", record_id=user.id, new=patch, actor=actor)
    return jsonify({"data": _profile_dict(user)})