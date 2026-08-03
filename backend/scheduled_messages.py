"""
scheduled_messages.py — automatic SMS jobs:

  • Thursday Fellowship follow-up  — runs every Thursday at 7:00 PM.
    Thanks members for today's fellowship and announces next week's
    venue/speaker/programmer, pulled from the FellowshipSchedule entry
    dated exactly 7 days from today.

  • Sunday welcome                 — runs every Sunday at 8:00 AM.
    Simple welcome message to every active member.

Both jobs:
  - Only message active members who have a phone number on file.
  - Are safe to run from multiple worker processes: each job first
    attempts to atomically "claim" today's run by inserting a row into
    SystemSetting (whose `key` column is a primary key) — if another
    process already claimed it today, this insert fails and we skip,
    so members never get duplicated SMS even under gunicorn multi-worker
    deployments. `force=True` (used by the manual "Send Now" test
    buttons) still attempts the claim first, but proceeds anyway even
    if the claim fails, so testing always works on demand.
  - Log every send attempt to SmsLog via log_sms(), exactly like
    welcome/OTP/broadcast messages, so they show up in SMS Logs.
"""
import logging
from datetime import timedelta
from extensions import db
from models import Member, FellowshipSchedule, SystemSetting, SmsLog
from welcome_sms import _dispatch as _sms_dispatch, _normalise_phone as _norm_phone
from sms_logger import log_sms
from timezone_utils import nairobi_now, nairobi_today

log = logging.getLogger(__name__)


def _get_sms_cfg():
    setting = SystemSetting.query.get("integrations")
    if not setting or not setting.value:
        return None
    sms = setting.value.get("sms") or {}
    if (sms.get("provider") or "none").lower() == "none":
        return None
    return sms


def _claim_daily_lock(event_type: str) -> bool:
    """
    Atomically claim the right to run today's job for this event_type.
    Returns True if THIS call claimed it (proceed), False if another
    process already claimed it today (skip). Relies on SystemSetting.key
    being a primary key — a duplicate insert raises and rolls back.
    """
    lock_key = f"sched_lock:{event_type}:{nairobi_today().isoformat()}"
    try:
        db.session.add(SystemSetting(key=lock_key, value={"claimed_at": nairobi_now().isoformat()}))
        db.session.commit()
        return True
    except Exception:
        db.session.rollback()
        return False


def _active_members_with_phone():
    return Member.query.filter(
        Member.status == "active",
        Member.phone.isnot(None),
        Member.phone != "",
    ).all()


def _first_name(full_name: str) -> str:
    return (full_name or "").strip().split()[0].capitalize() if full_name else "Member"


def _personalise(full_name: str, body: str) -> str:
    first = _first_name(full_name)
    return f"Dear {first}, {body} - CheswertaAGC"


def send_thursday_followup(force: bool = False) -> dict:
    """Thank members for today's fellowship + announce next week's details."""
    event_type = "fellowship_reminder"
    claimed = _claim_daily_lock(event_type)
    if not claimed and not force:
        return {"ok": True, "skipped": True, "reason": "Already sent today"}

    next_date = nairobi_today() + timedelta(days=7)
    entry = FellowshipSchedule.query.filter_by(fellowship_date=next_date).first()
    if not entry:
        log.warning("Thursday follow-up skipped: no FellowshipSchedule entry for %s", next_date)
        return {"ok": False, "skipped": True,
                "reason": f"No fellowship details set for {next_date.isoformat()} yet"}

    sms = _get_sms_cfg()
    if not sms:
        return {"ok": False, "skipped": True, "reason": "No SMS provider configured"}

    provider = (sms.get("provider") or "none").lower()
    body = (
        f"thank you for attending today's Thursday Fellowship "
        f"Next week's fellowship will be on {next_date.strftime('%A, %d %B')} "
        f"at {entry.venue}, Speaker: {entry.speaker}, "
        f"Programmer: {entry.programmer}. Please keep time, God bless you"
    )

    sent, failed = 0, 0
    for m in _active_members_with_phone():
        msg = _personalise(m.full_name, body)
        phone = _norm_phone(m.phone)
        try:
            _sms_dispatch(sms, phone, msg)
            log_sms(event_type=event_type, phone=phone, message=msg, provider=provider,
                    status="sent", recipient_name=m.full_name)
            sent += 1
        except Exception as exc:
            log_sms(event_type=event_type, phone=phone, message=msg, provider=provider,
                    status="failed", recipient_name=m.full_name, error_detail=str(exc))
            failed += 1

    entry.reminder_sent_at = nairobi_now()
    db.session.commit()

    log.info("Thursday follow-up: %d sent, %d failed (next fellowship %s)", sent, failed, next_date)
    return {"ok": True, "sent": sent, "failed": failed, "next_date": next_date.isoformat()}


def send_thursday_reminder(force: bool = False) -> dict:
    """
    Thursday 1:00 PM reminder — sent on the day of fellowship itself.
    Tells members the venue and asks them to arrive by 3:00 PM.
    Pulls today's FellowshipSchedule entry (if any); if none exists,
    skips gracefully rather than sending a blank message.
    """
    event_type = "fellowship_day_reminder"
    claimed = _claim_daily_lock(event_type)
    if not claimed and not force:
        return {"ok": True, "skipped": True, "reason": "Already sent today"}

    today = nairobi_today()
    entry = FellowshipSchedule.query.filter_by(fellowship_date=today).first()
    if not entry:
        log.info("Thursday day-reminder skipped: no FellowshipSchedule entry for %s", today)
        return {"ok": False, "skipped": True,
                "reason": f"No fellowship details set for today ({today.isoformat()})"}

    sms = _get_sms_cfg()
    if not sms:
        return {"ok": False, "skipped": True, "reason": "No SMS provider configured"}

    provider = (sms.get("provider") or "none").lower()
    body = (
        f"Today's Thursday Fellowship will be held at {entry.venue}. "
        f"Please arrive by 3:00 PM. Speaker: {entry.speaker}. "
        f"See you there. God bless you"
    )

    sent, failed = 0, 0
    for m in _active_members_with_phone():
        msg = _personalise(m.full_name, body)
        phone = _norm_phone(m.phone)
        try:
            _sms_dispatch(sms, phone, msg)
            log_sms(event_type=event_type, phone=phone, message=msg, provider=provider,
                    status="sent", recipient_name=m.full_name)
            sent += 1
        except Exception as exc:
            log_sms(event_type=event_type, phone=phone, message=msg, provider=provider,
                    status="failed", recipient_name=m.full_name, error_detail=str(exc))
            failed += 1

    log.info("Thursday day-reminder: %d sent, %d failed (venue: %s)", sent, failed, entry.venue)
    return {"ok": True, "sent": sent, "failed": failed, "venue": entry.venue}


def send_sunday_welcome(force: bool = False) -> dict:
    """Simple Sunday-morning welcome message to all active members."""
    event_type = "sunday_welcome"
    claimed = _claim_daily_lock(event_type)
    if not claimed and not force:
        return {"ok": True, "skipped": True, "reason": "Already sent today"}

    sms = _get_sms_cfg()
    if not sms:
        return {"ok": False, "skipped": True, "reason": "No SMS provider configured"}

    provider = (sms.get("provider") or "none").lower()
    body = "Welcome to today's service, starting at 10:00 AM. We are glad to have you with us, God bless you"

    sent, failed = 0, 0
    for m in _active_members_with_phone():
        msg = _personalise(m.full_name, body)
        phone = _norm_phone(m.phone)
        try:
            _sms_dispatch(sms, phone, msg)
            log_sms(event_type=event_type, phone=phone, message=msg, provider=provider,
                    status="sent", recipient_name=m.full_name)
            sent += 1
        except Exception as exc:
            log_sms(event_type=event_type, phone=phone, message=msg, provider=provider,
                    status="failed", recipient_name=m.full_name, error_detail=str(exc))
            failed += 1

    log.info("Sunday welcome: %d sent, %d failed", sent, failed)
    return {"ok": True, "sent": sent, "failed": failed}