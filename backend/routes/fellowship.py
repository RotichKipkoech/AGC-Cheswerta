"""Fellowship Schedule — set next week's Thursday Fellowship venue/speaker/programmer."""
from datetime import date, datetime, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from extensions import db
from models import FellowshipSchedule
from security import require_auth, require_role, log_audit
from permissions import require_module_role
from deletion_approval import register_deletable, request_or_delete
from timezone_utils import nairobi_today

bp = Blueprint("fellowship", __name__, url_prefix="/api/fellowship")

register_deletable("fellowship_schedules", FellowshipSchedule,
                    label_field=lambda s: f"{s.fellowship_date.isoformat()} · {s.venue}")



def _parse_date(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v)).date()
    except Exception:
        return None


def _next_thursday(from_date=None) -> date:
    """Date of the upcoming Thursday. If today IS Thursday, returns next week's."""
    d = from_date or nairobi_today()
    days_ahead = (3 - d.weekday()) % 7  # Monday=0 ... Thursday=3
    if days_ahead == 0:
        days_ahead = 7
    return d + timedelta(days=days_ahead)


@bp.get("")
@require_auth
def list_schedules():
    """History, newest first."""
    items = FellowshipSchedule.query.order_by(FellowshipSchedule.fellowship_date.desc()).all()
    return jsonify({"schedules": [s.to_dict() for s in items], "total": len(items)})


@bp.get("/next")
@require_auth
def get_next():
    """The entry for the very next Thursday (today counts if today IS Thursday)."""
    today = nairobi_today()
    target = today if today.weekday() == 3 else _next_thursday(today)
    entry = FellowshipSchedule.query.filter_by(fellowship_date=target).first()
    return jsonify({"schedule": entry.to_dict() if entry else None, "target_date": target.isoformat()})


@bp.get("/by-date")
@require_auth
def get_by_date():
    """
    Look up the fellowship schedule entry for a specific date.
    Used by the Attendance page to show venue/speaker/programmer
    inline when recording a Thursday Fellowship service.
    """
    d = _parse_date(request.args.get("date"))
    if not d:
        return jsonify({"error": "date is required (YYYY-MM-DD)"}), 400
    entry = FellowshipSchedule.query.filter_by(fellowship_date=d).first()
    return jsonify({"schedule": entry.to_dict() if entry else None})


@bp.post("")
@require_module_role("attendance")
def create_or_update_schedule():
    """
    Upsert by fellowship_date — if an entry already exists for that date,
    update it instead of erroring, since this form is reused week over
    week without the caller needing to know an existing ID.
    """
    data = request.get_json(silent=True) or {}
    fellowship_date = _parse_date(data.get("fellowship_date")) or _next_thursday()
    venue = (data.get("venue") or "").strip()
    speaker = (data.get("speaker") or "").strip()
    programmer = (data.get("programmer") or "").strip()

    if not venue:
        return jsonify({"error": "venue is required"}), 400
    if not speaker:
        return jsonify({"error": "speaker is required"}), 400
    if not programmer:
        return jsonify({"error": "programmer is required"}), 400

    entry = FellowshipSchedule.query.filter_by(fellowship_date=fellowship_date).first()
    if entry:
        old = entry.to_dict()
        entry.venue = venue
        entry.speaker = speaker
        entry.programmer = programmer
        entry.notes = (data.get("notes") or "").strip() or None
        db.session.commit()
        log_audit("fellowship_schedules", "UPDATE", record_id=entry.id, old=old, new=entry.to_dict())
        return jsonify(entry.to_dict())

    entry = FellowshipSchedule(
        fellowship_date=fellowship_date,
        venue=venue,
        speaker=speaker,
        programmer=programmer,
        notes=(data.get("notes") or "").strip() or None,
        created_by=get_jwt_identity(),
    )
    db.session.add(entry)
    db.session.commit()
    log_audit("fellowship_schedules", "INSERT", record_id=entry.id, new=entry.to_dict())
    return jsonify(entry.to_dict()), 201


@bp.put("/<uuid:schedule_id>")
@require_module_role("attendance")
def update_schedule(schedule_id):
    entry = FellowshipSchedule.query.get_or_404(str(schedule_id))
    old = entry.to_dict()
    data = request.get_json(silent=True) or {}

    if "fellowship_date" in data:
        d = _parse_date(data["fellowship_date"])
        if not d:
            return jsonify({"error": "Invalid fellowship_date"}), 400
        clash = FellowshipSchedule.query.filter(
            FellowshipSchedule.fellowship_date == d,
            FellowshipSchedule.id != entry.id,
        ).first()
        if clash:
            return jsonify({"error": f"An entry already exists for {d.isoformat()}"}), 409
        entry.fellowship_date = d
    if "venue" in data:
        if not (data["venue"] or "").strip():
            return jsonify({"error": "venue cannot be empty"}), 400
        entry.venue = data["venue"].strip()
    if "speaker" in data:
        if not (data["speaker"] or "").strip():
            return jsonify({"error": "speaker cannot be empty"}), 400
        entry.speaker = data["speaker"].strip()
    if "programmer" in data:
        if not (data["programmer"] or "").strip():
            return jsonify({"error": "programmer cannot be empty"}), 400
        entry.programmer = data["programmer"].strip()
    if "notes" in data:
        entry.notes = (data["notes"] or "").strip() or None

    db.session.commit()
    log_audit("fellowship_schedules", "UPDATE", record_id=entry.id, old=old, new=entry.to_dict())
    return jsonify(entry.to_dict())


@bp.delete("/<uuid:schedule_id>")
@require_role("admin", "super_admin")
def delete_schedule(schedule_id):
    entry = FellowshipSchedule.query.get_or_404(str(schedule_id))
    body = request.get_json(silent=True) or {}
    result = request_or_delete("fellowship_schedules", entry, reason=body.get("reason"))
    if result["immediate"]:
        return jsonify({"ok": True, "deleted": True})
    return jsonify({"pending": True, "message": "Deletion requires admin approval.",
                     "request": result["pending"].to_dict()}), 202


@bp.post("/send-thursday-now")
@require_role("admin", "super_admin")
def trigger_thursday_now():
    """Manual test trigger — fires the Thursday follow-up immediately."""
    from scheduled_messages import send_thursday_followup
    return jsonify(send_thursday_followup(force=True))


@bp.post("/send-thursday-reminder-now")
@require_role("admin", "super_admin")
def trigger_thursday_reminder_now():
    """Manual test trigger — fires the Thursday 12 PM day-reminder immediately."""
    from scheduled_messages import send_thursday_reminder
    return jsonify(send_thursday_reminder(force=True))


@bp.post("/send-sunday-now")
@require_role("admin", "super_admin")
def trigger_sunday_now():
    """Manual test trigger — fires the Sunday welcome immediately."""
    from scheduled_messages import send_sunday_welcome
    return jsonify(send_sunday_welcome(force=True))