"""SMS Logs — read-only view for admins/super_admins, with retry + delete."""
from datetime import datetime
from flask import Blueprint, request, jsonify
from extensions import db
from models import SmsLog, SystemSetting
from security import require_role, require_auth
from welcome_sms import _dispatch as _sms_dispatch, _normalise_phone as _norm_phone

bp = Blueprint("sms_logs", __name__, url_prefix="/api/sms-logs")


def _parse_date(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v)).date()
    except Exception:
        return None


@bp.get("")
@require_role("admin", "super_admin")
def list_sms_logs():
    """
    GET /api/sms-logs
    Query params:
      status      — filter by status  (sent|queued|failed|no_provider|no_phone)
      event_type  — filter by type    (welcome|otp_reset|broadcast)
      date_from   — ISO date string
      date_to     — ISO date string
      page        — 1-indexed page number (default 1)
      per_page    — rows per page (default 20, max 100)
    """
    q = SmsLog.query

    if s := request.args.get("status"):
        q = q.filter(SmsLog.status == s)
    if et := request.args.get("event_type"):
        q = q.filter(SmsLog.event_type == et)
    if df := _parse_date(request.args.get("date_from")):
        q = q.filter(SmsLog.created_at >= datetime.combine(df, datetime.min.time()))
    if dt := _parse_date(request.args.get("date_to")):
        q = q.filter(SmsLog.created_at <= datetime.combine(dt, datetime.max.time()))

    page     = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", 20)), 1), 100)

    total_filtered = q.count()
    items = (
        q.order_by(SmsLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    total_pages = max(-(-total_filtered // per_page), 1)  # ceil div

    # Summary counts for dashboard strip (unfiltered, system-wide)
    total       = SmsLog.query.count()
    sent        = SmsLog.query.filter(SmsLog.status.in_(["sent", "queued"])).count()
    failed      = SmsLog.query.filter(SmsLog.status == "failed").count()
    no_provider = SmsLog.query.filter(SmsLog.status == "no_provider").count()

    return jsonify({
        "logs": [l.to_dict() for l in items],
        "returned": len(items),
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total_filtered,
            "total_pages": total_pages,
        },
        "summary": {
            "total":       total,
            "sent":        sent,
            "failed":      failed,
            "no_provider": no_provider,
        },
    })


@bp.post("/<uuid:log_id>/retry")
@require_role("admin", "super_admin")
def retry_sms_log(log_id):
    """
    Re-attempt sending a failed (or no_provider) SMS log entry using its
    original phone/message. On success, the SAME row is updated in place
    (status flips to 'sent', error_detail cleared) so history stays clean
    rather than duplicating entries.
    """
    entry = SmsLog.query.get_or_404(str(log_id))

    if entry.status not in ("failed", "no_provider", "no_phone"):
        return jsonify({"error": f"Only failed entries can be retried (this one is '{entry.status}')"}), 400

    if not (entry.recipient_phone or "").strip() or entry.recipient_phone == "unknown":
        return jsonify({"error": "This entry has no phone number on record — cannot retry."}), 400

    setting = SystemSetting.query.get("integrations")
    if not setting or not setting.value:
        return jsonify({"error": "No SMS integration configured."}), 400
    sms = setting.value.get("sms") or {}
    provider = (sms.get("provider") or "none").lower()
    if provider == "none":
        return jsonify({"error": "No SMS provider configured."}), 400

    normalised = _norm_phone(entry.recipient_phone)
    try:
        _sms_dispatch(sms, normalised, entry.message or "")
    except Exception as exc:
        entry.error_detail = str(exc)[:500]
        entry.status = "failed"
        entry.provider = provider
        db.session.commit()
        return jsonify({"ok": False, "error": str(exc), "log": entry.to_dict()}), 502

    entry.status = "sent"
    entry.provider = provider
    entry.recipient_phone = normalised
    entry.error_detail = None
    db.session.commit()
    return jsonify({"ok": True, "log": entry.to_dict()})


@bp.post("/retry-failed")
@require_role("admin", "super_admin")
def retry_all_failed():
    """Retry every currently-failed entry in one go. Returns a tally."""
    failed_entries = SmsLog.query.filter(SmsLog.status == "failed").all()
    if not failed_entries:
        return jsonify({"ok": True, "retried": 0, "succeeded": 0, "failed": 0})

    setting = SystemSetting.query.get("integrations")
    if not setting or not setting.value:
        return jsonify({"error": "No SMS integration configured."}), 400
    sms = setting.value.get("sms") or {}
    provider = (sms.get("provider") or "none").lower()
    if provider == "none":
        return jsonify({"error": "No SMS provider configured."}), 400

    succeeded = 0
    still_failed = 0
    for entry in failed_entries:
        if not (entry.recipient_phone or "").strip() or entry.recipient_phone == "unknown":
            still_failed += 1
            continue
        normalised = _norm_phone(entry.recipient_phone)
        try:
            _sms_dispatch(sms, normalised, entry.message or "")
            entry.status = "sent"
            entry.provider = provider
            entry.recipient_phone = normalised
            entry.error_detail = None
            succeeded += 1
        except Exception as exc:
            entry.error_detail = str(exc)[:500]
            entry.provider = provider
            still_failed += 1

    db.session.commit()
    return jsonify({"ok": True, "retried": len(failed_entries), "succeeded": succeeded, "failed": still_failed})


@bp.delete("/<uuid:log_id>")
@require_role("super_admin")
def delete_sms_log(log_id):
    """DELETE a single log entry (super_admin only)."""
    entry = SmsLog.query.get_or_404(str(log_id))
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"ok": True})


@bp.delete("")
@require_role("super_admin")
def clear_sms_logs():
    """DELETE all SMS logs (super_admin only)."""
    count = SmsLog.query.delete()
    db.session.commit()
    return jsonify({"ok": True, "deleted": count})