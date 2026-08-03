import logging
import traceback
from extensions import db
from models import SmsLog

log = logging.getLogger(__name__)

MAX_SMS_LOGS = 300


def _trim_old_logs(keep: int = MAX_SMS_LOGS) -> int:
    """
    Delete the oldest SmsLog rows beyond `keep` most recent. Returns the
    number deleted. Never raises — a trim failure shouldn't take down the
    SMS send it's piggybacking on.
    """
    try:
        total = SmsLog.query.count()
        if total <= keep:
            return 0
        excess = total - keep
        oldest = (
            SmsLog.query
            .order_by(SmsLog.created_at.asc())
            .limit(excess)
            .all()
        )
        old_ids = [row.id for row in oldest]
        if not old_ids:
            return 0
        deleted = SmsLog.query.filter(SmsLog.id.in_(old_ids)).delete(synchronize_session=False)
        db.session.commit()
        if deleted:
            log.info("sms_logger: trimmed %d old SmsLog row(s), keeping most recent %d", deleted, keep)
        return deleted
    except Exception:
        db.session.rollback()
        log.warning("sms_logger: trim failed", exc_info=True)
        return 0


def log_sms(
    *,
    event_type: str,
    phone: str,
    message: str,
    provider: str | None = None,
    status: str,
    recipient_name: str | None = None,
    error_detail: str | None = None,
    sent_by: str | None = None,
) -> None:
    """Insert one SmsLog row, then trim to MAX_SMS_LOGS. Never raises — but
    logs loudly on failure."""
    try:
        entry = SmsLog(
            event_type=event_type,
            recipient_phone=phone or "unknown",
            recipient_name=recipient_name,
            message=message[:2000] if message else "",   # guard against huge messages
            provider=provider,
            status=status,
            error_detail=error_detail[:500] if error_detail else None,
            sent_by=sent_by,
        )
        db.session.add(entry)
        db.session.commit()
        log.info("sms_logger: wrote SmsLog row (event=%s, status=%s, phone=%s)",
                 event_type, status, phone)
    except Exception as exc:
        db.session.rollback()
        # Loud failure — print AND log, so it shows up even if logging isn't
        # configured to a visible handler. This is the #1 place to look if
        # SMS Logs appears empty despite SMS actually being sent.
        print(f"[sms_logger] FAILED TO WRITE SmsLog ROW: {exc}")
        print(traceback.format_exc())
        log.error("sms_logger: failed to write SmsLog row: %s", exc, exc_info=True)
        return

    _trim_old_logs()