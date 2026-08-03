"""Manual account locking (admin/super_admin). Super admin accounts cannot be locked."""
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func, or_
from extensions import db
from models import AccountLock, User, UserRole
from security import require_role, log_audit, is_super_admin

bp = Blueprint("account_locks", __name__, url_prefix="/api/account-locks")


def _resolve_user(identifier: str) -> User | None:
    ident = identifier.lower()
    return User.query.filter(
        or_(func.lower(User.username) == ident, func.lower(User.email) == ident)
    ).first()


@bp.get("")
@require_role("admin", "super_admin")
def list_locks():
    items = AccountLock.query.order_by(AccountLock.created_at.desc()).all()
    return jsonify({"locks": [l.to_dict() for l in items]})


@bp.post("")
@require_role("admin", "super_admin")
def create_lock():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or "").strip().lower()
    if not identifier:
        return jsonify({"error": "identifier required"}), 400

    target = _resolve_user(identifier)
    if target and is_super_admin(target.id):
        return jsonify({"error": "Super admin accounts cannot be locked"}), 403

    until = data.get("locked_until")
    lock = AccountLock.query.filter(func.lower(AccountLock.identifier) == identifier).first()
    if not lock:
        lock = AccountLock(identifier=identifier)
        db.session.add(lock)
    lock.locked_until = datetime.fromisoformat(until) if until else None
    lock.reason = data.get("reason", "Account blocked by administrator")
    lock.locked_by = get_jwt_identity()
    db.session.commit()
    log_audit("account_locks", "INSERT", record_id=lock.id, new=lock.to_dict())
    return jsonify(lock.to_dict()), 201


@bp.delete("/<identifier>")
@require_role("admin", "super_admin")
def unlock(identifier):
    lock = AccountLock.query.filter(func.lower(AccountLock.identifier) == identifier.lower()).first()
    if not lock:
        return jsonify({"ok": True})
    old = lock.to_dict()
    db.session.delete(lock)
    db.session.commit()
    log_audit("account_locks", "DELETE", record_id=identifier, old=old)
    return jsonify({"ok": True})
