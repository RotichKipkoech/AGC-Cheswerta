"""Attendance CRUD.

Accepts BOTH old field names (event_name, total_present, total_absent)
AND new field names (service_type, men, women, youths, children, visitors)
so the frontend doesn't break regardless of which schema is in use.
"""
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from extensions import db
from models import Attendance
from security import require_auth, log_audit
from permissions import require_module_role
from deletion_approval import register_deletable, request_or_delete
from timezone_utils import nairobi_now

bp = Blueprint("attendance", __name__, url_prefix="/api/attendance")

register_deletable("attendance", Attendance, label_field=lambda a: f"{a.event_name} · {a.date.isoformat()}" if a.date else a.event_name)


def _parse_date(v):
    return datetime.fromisoformat(str(v)).date() if v else None


def _breakdown(data: dict) -> dict:
    """Return the 5 demographic counts and their sum."""
    men      = int(data.get("men",      0) or 0)
    women    = int(data.get("women",    0) or 0)
    youths   = int(data.get("youths",   0) or 0)
    children = int(data.get("children", 0) or 0)
    visitors = int(data.get("visitors", 0) or 0)
    total    = men + women + youths + children + visitors
    # If no breakdown given, fall back to total_present
    if total == 0 and "total_present" in data:
        total = int(data.get("total_present", 0) or 0)
    return dict(men=men, women=women, youths=youths,
                children=children, visitors=visitors, total=total)


@bp.get("")
@require_auth
def list_attendance():
    q = Attendance.query
    if df := request.args.get("date_from"):
        q = q.filter(Attendance.date >= _parse_date(df))
    if dt := request.args.get("date_to"):
        q = q.filter(Attendance.date <= _parse_date(dt))
    items = q.order_by(Attendance.date.desc()).all()
    return jsonify({"attendance": [a.to_dict() for a in items], "total": len(items)})


@bp.post("")
@require_module_role("attendance")
def create_attendance():
    data = request.get_json(silent=True) or {}

    # Accept service_type OR event_name
    event_name = (
        data.get("service_type") or
        data.get("event_name") or
        data.get("serviceType") or
        ""
    ).strip()
    if not event_name:
        return jsonify({"error": "service_type (or event_name) is required"}), 400

    bd = _breakdown(data)

    a = Attendance(
        event_name=event_name,
        date=_parse_date(data.get("date")) or nairobi_now().date(),
        men=bd["men"],
        women=bd["women"],
        youths=bd["youths"],
        children=bd["children"],
        visitors=bd["visitors"],
        total_present=bd["total"],
        total_absent=int(data.get("total_absent", 0) or 0),
        notes=data.get("notes") or None,
        recorded_by=get_jwt_identity(),
    )
    db.session.add(a)
    db.session.commit()
    log_audit("attendance", "INSERT", record_id=a.id, new=a.to_dict())
    return jsonify(a.to_dict()), 201


@bp.put("/<uuid:record_id>")
@require_module_role("attendance")
def update_attendance(record_id):
    a = Attendance.query.get_or_404(str(record_id))
    old = a.to_dict()
    data = request.get_json(silent=True) or {}

    if "service_type" in data:
        a.event_name = data["service_type"]
    elif "event_name" in data:
        a.event_name = data["event_name"]

    if "date" in data:
        a.date = _parse_date(data["date"])
    if "notes" in data:
        a.notes = data["notes"] or None
    if "total_absent" in data:
        a.total_absent = int(data["total_absent"] or 0)

    # Always update breakdown columns when any demographic key is present
    if any(k in data for k in ("men", "women", "youths", "children", "visitors")):
        bd = _breakdown(data)
        a.men      = bd["men"]
        a.women    = bd["women"]
        a.youths   = bd["youths"]
        a.children = bd["children"]
        a.visitors = bd["visitors"]
        a.total_present = bd["total"]
    elif "total_present" in data:
        a.total_present = int(data["total_present"] or 0)

    db.session.commit()
    log_audit("attendance", "UPDATE", record_id=a.id, old=old, new=a.to_dict())
    return jsonify(a.to_dict())


@bp.delete("/<uuid:record_id>")
@require_module_role("attendance")
def delete_attendance(record_id):
    a = Attendance.query.get_or_404(str(record_id))
    body = request.get_json(silent=True) or {}
    result = request_or_delete("attendance", a, reason=body.get("reason"))
    if result["immediate"]:
        return jsonify({"ok": True, "deleted": True})
    return jsonify({"pending": True, "message": "Deletion requires admin approval.",
                     "request": result["pending"].to_dict()}), 202