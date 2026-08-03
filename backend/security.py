"""Auth/role helpers, lockout check, audit logging."""
from datetime import timedelta
from functools import wraps
from flask import jsonify, request, current_app
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from sqlalchemy import func
from extensions import db
from models import User, UserRole, AuditLog, LoginAttempt, AccountLock
from timezone_utils import nairobi_now


def has_role(user_id, *roles) -> bool:
    if not user_id:
        return False
    q = UserRole.query.filter(UserRole.user_id == user_id, UserRole.role.in_(roles))
    return db.session.query(q.exists()).scalar()


def is_super_admin(user_id) -> bool:
    return has_role(user_id, "super_admin")


def current_user() -> User | None:
    uid = get_jwt_identity()
    if not uid:
        return None
    return User.query.get(uid)


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        return fn(*args, **kwargs)
    return wrapper


def require_role(*roles):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            uid = get_jwt_identity()
            if not has_role(uid, *roles):
                return jsonify({"error": "Forbidden"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return deco


# ──────────────────────────────────────────────
# Lockout
# ──────────────────────────────────────────────

def check_account_locked(identifier: str):
    """Return (locked: bool, retry_after_seconds: int, reason: str|None)."""
    ident = identifier.lower()
    # Manual lock
    lock = AccountLock.query.filter(func.lower(AccountLock.identifier) == ident).first()
    if lock and (lock.locked_until is None or lock.locked_until > nairobi_now()):
        retry = int((lock.locked_until - nairobi_now()).total_seconds()) if lock.locked_until else 999999
        return True, max(0, retry), lock.reason or "Account blocked by administrator"

    # Rate-based lock
    window = current_app.config["LOGIN_WINDOW_MINUTES"]
    max_attempts = current_app.config["LOGIN_MAX_ATTEMPTS"]
    since = nairobi_now() - timedelta(minutes=window)

    last_success = (
        LoginAttempt.query.filter(
            func.lower(LoginAttempt.identifier) == ident,
            LoginAttempt.success.is_(True),
            LoginAttempt.attempted_at >= since,
        ).order_by(LoginAttempt.attempted_at.desc()).first()
    )
    fail_q = LoginAttempt.query.filter(
        func.lower(LoginAttempt.identifier) == ident,
        LoginAttempt.success.is_(False),
        LoginAttempt.attempted_at >= (last_success.attempted_at if last_success else since),
    )
    fails = fail_q.order_by(LoginAttempt.attempted_at.asc()).all()
    if len(fails) >= max_attempts:
        oldest = fails[0].attempted_at
        retry = int((oldest + timedelta(minutes=window) - nairobi_now()).total_seconds())
        return True, max(0, retry), "Too many failed login attempts"
    return False, 0, None


def record_login_attempt(identifier: str, success: bool) -> None:
    db.session.add(LoginAttempt(
        identifier=identifier.lower(),
        success=success,
        ip_address=request.remote_addr,
        user_agent=(request.headers.get("User-Agent") or "")[:500],
    ))
    db.session.commit()


# ──────────────────────────────────────────────
# Audit
# ──────────────────────────────────────────────

def log_audit(table: str, action: str, record_id=None, old=None, new=None, actor: User | None = None) -> None:
    actor = actor or current_user()
    db.session.add(AuditLog(
        table_name=table,
        action=action,
        record_id=str(record_id) if record_id is not None else None,
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        old_data=old,
        new_data=new,
    ))
    db.session.commit()