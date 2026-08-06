"""Auth routes: login, logout, me, change-password, update-email, forgot/reset-password."""
import random, string
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from sqlalchemy import func, or_
from extensions import db, bcrypt
from models import User, Profile, UserRole, SystemSetting
from security import check_account_locked, record_login_attempt, log_audit, require_auth
from welcome_sms import _normalise_phone, _dispatch as _sms_dispatch
from sms_logger import log_sms
from timezone_utils import nairobi_now

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("username") or data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not identifier or not password:
        return jsonify({"error": "Username and password required"}), 400

    locked, retry_after, reason = check_account_locked(identifier)
    if locked:
        return jsonify({"error": reason, "retry_after_seconds": retry_after, "locked": True}), 423

    user = User.query.filter(
        or_(func.lower(User.username) == identifier, func.lower(User.email) == identifier)
    ).first()

    if not user or not user.is_active or not user.check_password(password):
        record_login_attempt(identifier, False)
        return jsonify({"error": "Invalid username or password"}), 401

    record_login_attempt(identifier, True)
    role_row = UserRole.query.filter_by(user_id=user.id).first()
    token = create_access_token(identity=str(user.id))
    log_audit("auth_events", "INSERT", record_id=user.id,
              new={"event": "sign_in", "at": nairobi_now().isoformat()}, actor=user)

    return jsonify({
        "token": token,
        "user": user.to_dict(),
        "profile": user.profile.to_dict() if user.profile else None,
        "role": role_row.role if role_row else None,
    })


@bp.post("/logout")
@jwt_required()
def logout():
    uid = get_jwt_identity()
    user = User.query.get(uid)
    if user:
        log_audit("auth_events", "DELETE", record_id=user.id,
                  new={"event": "sign_out", "at": nairobi_now().isoformat()}, actor=user)
    return jsonify({"ok": True})


@bp.get("/me")
@jwt_required()
def me():
    uid = get_jwt_identity()
    user = User.query.get(uid)
    if not user:
        return jsonify({"error": "Not found"}), 404
    role_row = UserRole.query.filter_by(user_id=user.id).first()
    return jsonify({
        "user": user.to_dict(),
        "profile": user.profile.to_dict() if user.profile else None,
        "role": role_row.role if role_row else None,
    })


@bp.post("/change-password")
@jwt_required()
def change_password():
    """Allow a logged-in user to change their own password (requires current password)."""
    uid = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password", "")
    new_password = data.get("password", "")

    if not new_password or len(new_password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    user = User.query.get(uid)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not user.check_password(current_password):
        return jsonify({"error": "Current password is incorrect"}), 403

    user.set_password(new_password)
    db.session.commit()
    log_audit("users", "UPDATE", record_id=user.id,
              new={"event": "password_changed", "at": nairobi_now().isoformat()},
              actor=user)
    return jsonify({"ok": True})


@bp.post("/update-email")
@jwt_required()
def update_email():
    """Allow a logged-in user to update their email address."""
    uid = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    new_email = (data.get("email") or "").strip().lower()

    if not new_email or "@" not in new_email:
        return jsonify({"error": "Valid email required"}), 400

    user = User.query.get(uid)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Check uniqueness (ignore synthetic domain emails of other users)
    existing = User.query.filter(
        func.lower(User.email) == new_email,
        User.id != user.id
    ).first()
    if existing:
        return jsonify({"error": "Email already in use"}), 409

    old_email = user.email
    user.email = new_email
    if user.profile:
        user.profile.email = new_email
    db.session.commit()
    log_audit("users", "UPDATE", record_id=user.id,
              old={"email": old_email},
              new={"email": new_email, "at": nairobi_now().isoformat()},
              actor=user)
    return jsonify({"ok": True})


# ─────────────────────────────────────────────────────────────
#  OTP password reset helpers
# ─────────────────────────────────────────────────────────────

OTP_TTL_MINUTES = 5

def _generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def _send_otp_sms(phone: str, otp: str) -> tuple[bool, str, str, str]:
    """Send OTP via the configured SMS provider.
    Delegates to welcome_sms._dispatch so all provider logic lives in one place.
    Returns (ok, error_message, provider_name, normalised_phone).
    """
    setting = SystemSetting.query.get("integrations")
    if not setting or not setting.value:
        return False, "No SMS integration configured.", "", phone
    sms = setting.value.get("sms") or {}
    provider = (sms.get("provider") or "none").lower()
    if provider == "none":
        return False, "No SMS provider configured.", "", phone

    msg = (
        f"Your AGC password reset code is: {otp}. "
        f"It expires in {OTP_TTL_MINUTES} minutes. Do not share it."
    )
    normalised = _normalise_phone(phone)
    try:
        _sms_dispatch(sms, normalised, msg)
        return True, "", provider, normalised
    except Exception as e:
        return False, str(e), provider, normalised


@bp.post("/forgot-password")
def forgot_password():
    """
    Step 1 — user enters their username.
    Looks up their profile phone, generates a 6-digit OTP,
    stores it in SystemSetting (keyed per-user), and sends it via SMS.
    Returns a masked phone so the frontend can show "sent to ***1234".
    """
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    if not username:
        return jsonify({"error": "Username is required"}), 400

    user = User.query.filter(func.lower(User.username) == username).first()

    # Always return success to avoid username enumeration
    if not user or not user.profile or not user.profile.phone:
        return jsonify({
            "ok": True,
            "masked_phone": None,
            "message": "If this account exists and has a phone number, an OTP has been sent.",
        })

    otp = _generate_otp()
    expires_at = (nairobi_now() + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()

    # Store OTP in SystemSetting under key "otp_reset:<user_id>"
    key = f"otp_reset:{user.id}"
    record = SystemSetting.query.get(key)
    if record:
        record.value = {"otp": otp, "expires_at": expires_at}
    else:
        db.session.add(SystemSetting(key=key, value={"otp": otp, "expires_at": expires_at}))
    db.session.commit()

    ok, err, provider, normalised = _send_otp_sms(user.profile.phone, otp)

    # Build OTP message for logging (same as _send_otp_sms builds internally)
    otp_msg = (f"Your AGC password reset code is: {otp}. "
               f"It expires in {OTP_TTL_MINUTES} minutes. Do not share it.")

    if not ok:
        log_sms(event_type="otp_reset", phone=normalised or user.profile.phone,
                message=otp_msg, provider=provider or None,
                status="failed" if provider else "no_provider",
                recipient_name=user.username, error_detail=err)
        return jsonify({"error": f"Could not send OTP: {err}"}), 502

    log_sms(event_type="otp_reset", phone=normalised,
            message=otp_msg, provider=provider,
            status="sent", recipient_name=user.username)

    # Mask phone: show last 4 digits only, e.g. "+254***7890"
    phone = user.profile.phone
    masked = phone[:-4].replace(phone[:-4], "*" * len(phone[:-4])) + phone[-4:] if len(phone) > 4 else "****"

    log_audit("auth_events", "INSERT", record_id=user.id,
              new={"event": "otp_requested", "at": nairobi_now().isoformat()}, actor=user)
    return jsonify({"ok": True, "masked_phone": masked,
                    "message": f"OTP sent to {masked}."})


@bp.post("/verify-otp")
def verify_otp():
    """
    Step 2 — user submits username + OTP.
    Returns a short-lived reset_token (JWT) if correct.
    """
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    otp      = (data.get("otp") or "").strip()

    if not username or not otp:
        return jsonify({"error": "Username and OTP are required"}), 400

    user = User.query.filter(func.lower(User.username) == username).first()
    if not user:
        return jsonify({"error": "Invalid OTP"}), 400

    key = f"otp_reset:{user.id}"
    record = SystemSetting.query.get(key)
    if not record or not record.value:
        return jsonify({"error": "No OTP requested or it has expired"}), 400

    stored_otp   = record.value.get("otp", "")
    expires_at   = record.value.get("expires_at", "")

    try:
        if datetime.fromisoformat(expires_at) < nairobi_now():
            db.session.delete(record)
            db.session.commit()
            return jsonify({"error": "OTP has expired. Please request a new one."}), 400
    except Exception:
        return jsonify({"error": "Invalid OTP record"}), 400

    if otp != stored_otp:
        return jsonify({"error": "Invalid OTP"}), 400

    # OTP is correct — delete it so it can't be reused
    db.session.delete(record)
    db.session.commit()

    # Issue a short-lived (15 min) reset token with a special claim
    reset_token = create_access_token(
        identity=str(user.id),
        expires_delta=timedelta(minutes=15),
        additional_claims={"purpose": "password_reset"},
    )
    return jsonify({"ok": True, "reset_token": reset_token})


@bp.post("/reset-password")
def reset_password():
    """
    Step 3 — user submits new password with the reset_token from step 2.
    No JWT middleware — we validate the token manually to check its purpose claim.
    """
    from flask_jwt_extended import decode_token
    data = request.get_json(silent=True) or {}
    reset_token  = (data.get("reset_token") or "").strip()
    new_password = data.get("password") or ""

    if not reset_token or not new_password:
        return jsonify({"error": "reset_token and password are required"}), 400
    if len(new_password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    try:
        decoded = decode_token(reset_token)
    except Exception:
        return jsonify({"error": "Invalid or expired reset token"}), 400

    if decoded.get("purpose") != "password_reset":
        return jsonify({"error": "Invalid reset token"}), 400

    uid = decoded.get("sub")
    user = User.query.get(uid)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.set_password(new_password)
    db.session.commit()
    log_audit("users", "UPDATE", record_id=user.id,
              new={"event": "password_reset_via_otp", "at": nairobi_now().isoformat()},
              actor=user)
    return jsonify({"ok": True, "message": "Password updated successfully."})