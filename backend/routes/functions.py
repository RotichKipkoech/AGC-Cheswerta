"""Admin-users dispatcher — mounted at both legacy and new paths.

POST /api/functions/admin-users
POST /api/admin/users

Payload: { action: "list"|"create"|"update"|"delete", ...fields }
"""
import uuid
from flask import Blueprint, request, jsonify
from extensions import db
from models import User, Profile, UserRole, APP_ROLES
from security import require_role, log_audit

bp = Blueprint("functions", __name__)
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


def _handle():
    body = request.get_json(silent=True) or {}
    action = (body.get("action") or "").strip()

    try:
        # ── list ──────────────────────────────────────────────────────────────
        if action == "list":
            users = User.query.order_by(User.created_at.desc()).all()
            return jsonify({"users": [_serialize(u) for u in users]})

        # ── create ────────────────────────────────────────────────────────────
        if action == "create":
            full_name = (body.get("full_name") or "").strip()
            username = (body.get("username") or "").strip().lower()
            phone = (body.get("phone") or "").strip() or None
            role = (body.get("role") or "ministry_leader").strip()
            password = (body.get("password") or "")

            if not full_name:
                return jsonify({"error": "full_name is required"}), 400
            if not username:
                return jsonify({"error": "username is required"}), 400
            if role not in APP_ROLES:
                return jsonify({"error": f"Invalid role '{role}'. Must be one of: {', '.join(APP_ROLES)}"}), 400
            if not password or len(password) < 8:
                return jsonify({"error": "Password must be at least 8 characters"}), 400
            if User.query.filter_by(username=username).first():
                return jsonify({"error": f"Username '{username}' is already taken"}), 409

            email = f"{username}@{SYNTHETIC_DOMAIN}"
            user = User(username=username, email=email)
            user.set_password(password)
            db.session.add(user)
            db.session.flush()

            db.session.add(Profile(
                user_id=user.id, full_name=full_name,
                email=email, username=username, phone=phone, is_active=True,
            ))
            db.session.add(UserRole(user_id=user.id, role=role))
            db.session.commit()
            log_audit("users", "INSERT", record_id=user.id, new=_serialize(user))
            return jsonify({"ok": True, "user_id": str(user.id), "data": {"user_id": str(user.id)}}), 201

        # ── update ────────────────────────────────────────────────────────────
        if action == "update":
            raw_id = body.get("user_id")
            if not raw_id:
                return jsonify({"error": "user_id required"}), 400
            try:
                uid = str(uuid.UUID(str(raw_id)))
            except ValueError:
                return jsonify({"error": "Invalid user_id format"}), 400

            user = User.query.get(uid)
            if not user:
                return jsonify({"error": "User not found"}), 404

            old = _serialize(user)

            if body.get("full_name") and user.profile:
                user.profile.full_name = body["full_name"].strip()
            if body.get("phone") is not None and user.profile:
                user.profile.phone = (body["phone"] or "").strip() or None
            if body.get("username"):
                new_u = body["username"].strip().lower()
                if new_u != user.username:
                    if User.query.filter(User.username == new_u, User.id != uid).first():
                        return jsonify({"error": f"Username '{new_u}' is already taken"}), 409
                    user.username = new_u
                    user.email = f"{new_u}@{SYNTHETIC_DOMAIN}"
                    if user.profile:
                        user.profile.username = new_u
                        user.profile.email = user.email
            if body.get("password"):
                pw = body["password"]
                if len(pw) < 8:
                    return jsonify({"error": "Password must be at least 8 characters"}), 400
                user.set_password(pw)
            if body.get("is_active") is not None:
                user.is_active = bool(body["is_active"])
                if user.profile:
                    user.profile.is_active = user.is_active
            if body.get("role"):
                r = body["role"].strip()
                if r not in APP_ROLES:
                    return jsonify({"error": f"Invalid role '{r}'"}), 400
                UserRole.query.filter_by(user_id=uid).delete()
                db.session.add(UserRole(user_id=uid, role=r))

            db.session.commit()
            log_audit("users", "UPDATE", record_id=uid, old=old, new=_serialize(user))
            return jsonify({"ok": True, "data": {"ok": True}})

        # ── delete ────────────────────────────────────────────────────────────
        if action == "delete":
            raw_id = body.get("user_id")
            if not raw_id:
                return jsonify({"error": "user_id required"}), 400
            try:
                uid = str(uuid.UUID(str(raw_id)))
            except ValueError:
                return jsonify({"error": "Invalid user_id format"}), 400

            user = User.query.get(uid)
            if not user:
                return jsonify({"error": "User not found"}), 404

            old = _serialize(user)
            db.session.delete(user)
            db.session.commit()
            log_audit("users", "DELETE", record_id=uid, old=old)
            return jsonify({"ok": True, "data": {"ok": True}})

        return jsonify({"error": f"Unknown action '{action}'. Use: list, create, update, delete"}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# Mount at both paths — admin can use either
@bp.post("/api/functions/admin-users")
@require_role("admin", "super_admin")       # ← admin CAN create users
def admin_users_legacy():
    return _handle()


@bp.post("/api/admin/users")
@require_role("admin", "super_admin")       # ← admin CAN create users
def admin_users():
    return _handle()
