"""Givings CRUD — DB column is 'notes', frontend may send 'description' or 'notes'."""
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from extensions import db
from models import Giving
from security import require_auth, log_audit
from permissions import require_module_role
from deletion_approval import register_deletable, request_or_delete
from timezone_utils import nairobi_now

bp = Blueprint("givings", __name__, url_prefix="/api/givings")

register_deletable("givings", Giving, label_field=lambda g: f"{g.type} · KES {g.amount}" + (f" · {g.member_name}" if g.member_name else ""))

NEEDS_NAME = {"Tithe", "Other"}


def _parse_date(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v)).date()
    except Exception:
        return None


def _get_notes(data: dict) -> str | None:
    """Accept both 'notes' and 'description' from frontend."""
    return data.get("notes") or data.get("description") or None


@bp.get("")
@require_auth
def list_givings():
    q = Giving.query
    if t := request.args.get("type"):
        q = q.filter_by(type=t)
    if df := request.args.get("date_from"):
        q = q.filter(Giving.date >= _parse_date(df))
    if dt := request.args.get("date_to"):
        q = q.filter(Giving.date <= _parse_date(dt))
    items = q.order_by(Giving.date.desc(), Giving.created_at.desc()).all()
    return jsonify({"givings": [g.to_dict() for g in items], "total": len(items)})


@bp.post("")
@require_module_role("finance")
def create_giving():
    data = request.get_json(silent=True) or {}
    gtype = (data.get("type") or "").strip()
    if not gtype:
        return jsonify({"error": "type is required"}), 400
    raw_amount = data.get("amount")
    try:
        amount = float(raw_amount)
    except (TypeError, ValueError):
        return jsonify({"error": "amount must be a number"}), 400
    if amount <= 0:
        return jsonify({"error": "amount must be greater than 0"}), 400

    member_name = (data.get("member_name") or "").strip() or None
    if gtype not in NEEDS_NAME:
        member_name = None

    g = Giving(
        type=gtype,
        amount=amount,
        member_name=member_name,
        date=_parse_date(data.get("date")) or nairobi_now().date(),
        notes=_get_notes(data),
        recorded_by=get_jwt_identity(),
    )
    db.session.add(g)
    db.session.commit()
    log_audit("givings", "INSERT", record_id=g.id, new=g.to_dict())
    return jsonify(g.to_dict()), 201


@bp.put("/<uuid:giving_id>")
@require_module_role("finance")
def update_giving(giving_id):
    g = Giving.query.get_or_404(str(giving_id))
    old = g.to_dict()
    data = request.get_json(silent=True) or {}
    if "type" in data:
        g.type = data["type"].strip()
    if "amount" in data:
        try:
            g.amount = float(data["amount"])
        except (TypeError, ValueError):
            return jsonify({"error": "amount must be a number"}), 400
    if "date" in data:
        g.date = _parse_date(data["date"])
    # Accept both 'notes' and 'description'
    if "notes" in data or "description" in data:
        g.notes = _get_notes(data)
    if "member_name" in data:
        g.member_name = (data["member_name"] or "").strip() or None if g.type in NEEDS_NAME else None
    db.session.commit()
    log_audit("givings", "UPDATE", record_id=g.id, old=old, new=g.to_dict())
    return jsonify(g.to_dict())


@bp.delete("/<uuid:giving_id>")
@require_module_role("finance")
def delete_giving(giving_id):
    g = Giving.query.get_or_404(str(giving_id))
    body = request.get_json(silent=True) or {}
    result = request_or_delete("givings", g, reason=body.get("reason"))
    if result["immediate"]:
        return jsonify({"ok": True, "deleted": True})
    return jsonify({"pending": True, "message": "Deletion requires admin approval.",
                     "request": result["pending"].to_dict()}), 202