"""Admin user management — list / create / update / delete users + role."""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from extensions import db
from models import User, Profile, UserRole, APP_ROLES
from security import require_role, log_audit
from deletion_approval import register_deletable, request_or_delete

bp = Blueprint("users", __name__, url_prefix="/api/users")

SYNTHETIC_DOMAIN = "agc.local"


def _serialize(u: User):
    role = UserRole.query.filter_by(user_id=u.id).first()
    p = u.profile
    return {
        "user_id": str(u.id),
        "username": u.username,
        "email": u.email,
        "full_name": p.full_name if p else "",
        "phone": p.phone if p else None,
        "is_active": u.is_active,
        "role": role.role if role else None,
        "created_at": u.created_at.isoformat(),
    }


register_deletable("users", User, label_field=lambda u: (u.profile.full_name if u.profile else u.username))


@bp.get("")
@require_role("admin", "super_admin")
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify({"users": [_serialize(u) for u in users]})


@bp.post("")
@require_role("admin", "super_admin")
def create_user():
    data = request.get_json(silent=True) or {}
    full_name = (data.get("full_name") or "").strip()
    username = (data.get("username") or "").strip().lower()
    phone = data.get("phone")
    role = data.get("role")
    password = data.get("password") or ""

    if not full_name or not username or not role or not password:
        return jsonify({"error": "Missing required fields"}), 400
    if role not in APP_ROLES:
        return jsonify({"error": "Invalid role"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken"}), 409

    email = f"{username}@{SYNTHETIC_DOMAIN}"
    user = User(username=username, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    db.session.add(Profile(user_id=user.id, full_name=full_name, email=email,
                           username=username, phone=phone))
    db.session.add(UserRole(user_id=user.id, role=role))
    db.session.commit()
    log_audit("users", "INSERT", record_id=user.id, new=_serialize(user))
    return jsonify({"user_id": str(user.id)}), 201


@bp.put("/<uuid:user_id>")
@require_role("admin", "super_admin")
def update_user(user_id):
    user = User.query.get_or_404(str(user_id))
    data = request.get_json(silent=True) or {}
    old = _serialize(user)

    if "full_name" in data and user.profile:
        user.profile.full_name = data["full_name"]
    if "phone" in data and user.profile:
        user.profile.phone = data["phone"]
    if "username" in data:
        new_u = data["username"].strip().lower()
        user.username = new_u
        user.email = f"{new_u}@{SYNTHETIC_DOMAIN}"
        if user.profile:
            user.profile.username = new_u
            user.profile.email = user.email
    if data.get("password"):
        if len(data["password"]) < 8:
            return jsonify({"error": "Password too short"}), 400
        user.set_password(data["password"])
    if "is_active" in data:
        user.is_active = bool(data["is_active"])

    if data.get("role"):
        if data["role"] not in APP_ROLES:
            return jsonify({"error": "Invalid role"}), 400
        UserRole.query.filter_by(user_id=user.id).delete()
        db.session.add(UserRole(user_id=user.id, role=data["role"]))

    db.session.commit()
    log_audit("users", "UPDATE", record_id=user.id, old=old, new=_serialize(user))
    return jsonify({"ok": True})


@bp.delete("/<uuid:user_id>")
@require_role("admin", "super_admin")
def delete_user(user_id):
    caller_id = get_jwt_identity()
    if str(user_id) == caller_id:
        return jsonify({"error": "You cannot delete your own account"}), 400
    user = User.query.get_or_404(str(user_id))
    body = request.get_json(silent=True) or {}
    # Snapshot explicitly via _serialize() — it includes role/profile fields
    # that User.to_dict() alone doesn't.
    result = request_or_delete("users", user, reason=body.get("reason"), snapshot=_serialize(user))
    if result["immediate"]:
        return jsonify({"ok": True, "deleted": True})
    return jsonify({"pending": True, "message": "Deletion requires admin approval.",
                     "request": result["pending"].to_dict()}), 202