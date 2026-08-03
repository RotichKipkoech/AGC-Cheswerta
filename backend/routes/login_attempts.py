"""Login attempt routes — used by CPanel security tab.

GET    /api/login-attempts                  list recent attempts
DELETE /api/login-attempts/<identifier>     clear attempts + lock for that user
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func
from extensions import db
from models import LoginAttempt, AccountLock
from security import require_role

bp = Blueprint("login_attempts", __name__, url_prefix="/api/login-attempts")


@bp.get("")
@jwt_required()
@require_role("super_admin", "admin")
def list_attempts():
    limit = min(int(request.args.get("limit", 500)), 1000)
    rows = (LoginAttempt.query
            .order_by(LoginAttempt.attempted_at.desc())
            .limit(limit).all())
    return jsonify({"data": [r.to_dict() for r in rows]})


@bp.get("/locked")
@jwt_required()
@require_role("super_admin", "admin")
def list_locked():
    """
    GET /api/login-attempts/locked?max_attempts=3&window_minutes=5

    Returns every identifier that has >= max_attempts failures in the last
    window_minutes minutes, PLUS every active manual lock.
    """
    max_attempts = int(request.args.get("max_attempts", 3))
    window_minutes = int(request.args.get("window_minutes", 5))

    from datetime import datetime, timedelta
    since = datetime.utcnow() - timedelta(minutes=window_minutes)

    # --- automatic locks (failed attempts) ---
    rows = (db.session.query(
                LoginAttempt.identifier,
                func.count(LoginAttempt.id).label("fail_count"),
                func.min(LoginAttempt.attempted_at).label("oldest")
            )
            .filter(LoginAttempt.success == False,  # noqa: E712
                    LoginAttempt.attempted_at >= since)
            .group_by(LoginAttempt.identifier)
            .having(func.count(LoginAttempt.id) >= max_attempts)
            .all())

    window_secs = window_minutes * 60
    result = []
    auto_keys = set()

    for r in rows:
        elapsed = (datetime.utcnow() - r.oldest).total_seconds()
        retry_after = max(0, int(window_secs - elapsed))
        if retry_after <= 0:
            continue
        auto_keys.add(r.identifier.lower())
        result.append({
            "identifier": r.identifier,
            "source": "attempts",
            "fail_count": r.fail_count,
            "retry_after_seconds": retry_after,
            "reason": None,
        })

    # --- manual locks ---
    manual_locks = AccountLock.query.all()
    now = datetime.utcnow()
    for lock in manual_locks:
        if lock.identifier.lower() in auto_keys:
            continue  # already included above
        if lock.locked_until and lock.locked_until <= now:
            continue  # expired
        retry_after = 0
        if lock.locked_until:
            retry_after = max(0, int((lock.locked_until - now).total_seconds()))
        result.append({
            "identifier": lock.identifier,
            "source": "manual",
            "fail_count": 0,
            "retry_after_seconds": retry_after,
            "reason": lock.reason,
        })

    return jsonify({"data": result})


@bp.delete("/<path:identifier>")
@jwt_required()
@require_role("super_admin", "admin")
def clear_attempts(identifier):
    """
    DELETE /api/login-attempts/<identifier>
    Clears all failed attempts + any manual lock → unlocks the account.
    """
    identifier = identifier.strip().lower()

    attempts_deleted = (LoginAttempt.query
                        .filter(func.lower(LoginAttempt.identifier) == identifier)
                        .delete(synchronize_session=False))

    locks_deleted = (AccountLock.query
                     .filter(func.lower(AccountLock.identifier) == identifier)
                     .delete(synchronize_session=False))

    db.session.commit()
    return jsonify({
        "ok": True,
        "identifier": identifier,
        "attempts_deleted": attempts_deleted,
        "locks_deleted": locks_deleted,
    })
