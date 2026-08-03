"""
scheduler.py — background jobs for CheswertaAGC CMS.

Jobs:
  sunday_welcome          – Sunday  08:30 EAT → welcome SMS to all active members
  fellowship_reminder     – Thursday 19:00 EAT → thank + announce next week's fellowship
  retry_failed_welcome    – every 10 min → retries welcome SMSes that failed on registration
  trim_sms_logs           – hourly → keeps SMS Logs capped at the most recent 300 rows

Usage (in app.py / create_app):

    from scheduler import init_scheduler

    # Guard against Flask reloader double-starting the scheduler:
    import os
    if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        init_scheduler(app)

Requires:  pip install apscheduler
"""

import logging
from datetime import timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None
TZ = "Africa/Nairobi"


def init_scheduler(app) -> BackgroundScheduler:
    global _scheduler

    # Prevent double-init (e.g. gunicorn multi-worker or Flask reloader)
    if _scheduler and _scheduler.running:
        return _scheduler

    _scheduler = BackgroundScheduler(timezone=TZ, daemon=True)

    # ── 1. Sunday welcome: 08:30 EAT every Sunday ────────────────────────────
    _scheduler.add_job(
        func=lambda: _run_sunday_welcome(app),
        trigger=CronTrigger(day_of_week="sun", hour=8, minute=30, timezone=TZ),
        id="sunday_welcome",
        name="Sunday welcome SMS (08:30 EAT)",
        replace_existing=True,
        misfire_grace_time=300,   # fire if up to 5 min late (e.g. server restart)
    )

    # ── 2. Thursday fellowship follow-up: 19:00 EAT every Thursday ───────────
    _scheduler.add_job(
        func=lambda: _run_thursday_followup(app),
        trigger=CronTrigger(day_of_week="thu", hour=19, minute=0, timezone=TZ),
        id="fellowship_reminder",
        name="Thursday fellowship follow-up SMS (19:00 EAT)",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # ── 3. Thursday day-reminder: 13:00 EAT every Thursday ──────────────────
    _scheduler.add_job(
        func=lambda: _run_thursday_reminder(app),
        trigger=CronTrigger(day_of_week="thu", hour=13, minute=0, timezone=TZ),
        id="fellowship_day_reminder",
        name="Thursday day reminder SMS — venue & 3 PM arrival (13:00 EAT)",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # ── 4. Retry failed welcome SMSes: every 10 minutes ──────────────────────
    _scheduler.add_job(
        func=lambda: _retry_welcome_sms_job(app),
        trigger=IntervalTrigger(minutes=10),
        id="retry_welcome_sms",
        name="Retry failed welcome SMSes (every 10 min)",
        replace_existing=True,
        misfire_grace_time=60,
    )

    # ── 5. Trim SMS Logs: hourly ─────────────────────────────────────────────
    # Belt-and-braces alongside the per-insert trim in sms_logger.log_sms():
    # that one fires on every new SMS event, this one guarantees the table
    # gets pulled back to MAX_SMS_LOGS even during a quiet stretch with no
    # new sends — including shrinking an already-oversized table the first
    # time this runs after you deploy the change.
    _scheduler.add_job(
        func=lambda: _run_trim_sms_logs(app),
        trigger=IntervalTrigger(hours=1),
        id="trim_sms_logs",
        name="Trim SMS Logs to most recent 300 rows (hourly)",
        replace_existing=True,
        misfire_grace_time=300,
    )

    _scheduler.start()
    log.info(
        "Scheduler started — "
        "sunday_welcome @ Sun 08:30 EAT | "
        "fellowship_day_reminder @ Thu 13:00 EAT | "
        "fellowship_reminder @ Thu 19:00 EAT | "
        "retry_welcome_sms every 10 min | "
        "trim_sms_logs hourly"
    )
    return _scheduler


def get_scheduler() -> BackgroundScheduler | None:
    """Return the running scheduler instance (useful for admin status checks)."""
    return _scheduler


# ── job wrappers ──────────────────────────────────────────────────────────────
# Each wrapper pushes a Flask app context so models / db / config are available.

def _run_sunday_welcome(app):
    with app.app_context():
        try:
            from scheduled_messages import send_sunday_welcome
            result = send_sunday_welcome()
            log.info("sunday_welcome result: %s", result)
        except Exception:
            log.exception("sunday_welcome job crashed")


def _run_thursday_followup(app):
    with app.app_context():
        try:
            from scheduled_messages import send_thursday_followup
            result = send_thursday_followup()
            log.info("fellowship_reminder result: %s", result)
        except Exception:
            log.exception("fellowship_reminder job crashed")


def _run_thursday_reminder(app):
    with app.app_context():
        try:
            from scheduled_messages import send_thursday_reminder
            result = send_thursday_reminder()
            log.info("fellowship_day_reminder result: %s", result)
        except Exception:
            log.exception("fellowship_day_reminder job crashed")


def _retry_welcome_sms_job(app):
    """
    Scans audit_logs for member INSERT entries whose sms_status starts with
    'failed:' and are less than 24 h old, then retries each one once.
    Updates the audit log entry on success.
    """
    with app.app_context():
        try:
            from extensions import db
            from models import Member, AuditLog
            from welcome_sms import send_welcome_sms
            from timezone_utils import nairobi_now

            cutoff = nairobi_now() - timedelta(hours=24)

            candidates = (
                AuditLog.query
                .filter(
                    AuditLog.table_name == "members",
                    AuditLog.action == "INSERT",
                    AuditLog.created_at >= cutoff,
                )
                .all()
            )

            retried = 0
            for entry in candidates:
                new_data = entry.new_data or {}
                sms_status = new_data.get("sms_status", "")
                if not (isinstance(sms_status, str) and sms_status.startswith("failed:")):
                    continue

                member_id = entry.record_id
                member = Member.query.get(str(member_id)) if member_id else None
                if not member or not member.phone:
                    continue

                log.info("Retrying welcome SMS for %s (%s)", member.full_name, member.phone)
                new_status = send_welcome_sms(member)

                # Update the audit log entry with the new status
                updated = dict(new_data)
                updated["sms_status"] = new_status
                updated["sms_retried_at"] = nairobi_now().isoformat()
                entry.new_data = updated
                db.session.commit()
                retried += 1

                if new_status in ("sent", "queued"):
                    log.info("Retry succeeded for %s", member.full_name)
                else:
                    log.warning("Retry still failed for %s: %s", member.full_name, new_status)

            if retried:
                log.info("retry_welcome_sms: processed %d candidate(s)", retried)

        except Exception as exc:
            log.exception("retry_welcome_sms job crashed: %s", exc)


def _run_trim_sms_logs(app):
    with app.app_context():
        try:
            from sms_logger import _trim_old_logs
            deleted = _trim_old_logs()
            if deleted:
                log.info("trim_sms_logs: removed %d old row(s)", deleted)
        except Exception:
            log.exception("trim_sms_logs job crashed")