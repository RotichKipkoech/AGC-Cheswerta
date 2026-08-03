"""Announcements — allow admin + super_admin to create/update/delete."""
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from extensions import db
from models import Announcement
from security import require_auth, require_role, log_audit

bp = Blueprint("announcements", __name__, url_prefix="/api/announcements")

def _parse_dt(v):
    return datetime.fromisoformat(v.replace("Z", "+00:00")).replace(tzinfo=None) if v else None

@bp.get("")
@require_auth
def list_announcements():
    items = Announcement.query.order_by(Announcement.starts_at.desc()).all()
    return jsonify({"announcements": [a.to_dict() for a in items]})

@bp.post("")
@require_role("admin", "super_admin")          # was super_admin only
def create_announcement():
    data = request.get_json(silent=True) or {}
    if not data.get("title") or not data.get("message"):
        return jsonify({"error": "title and message required"}), 400
    a = Announcement(
        title=data["title"], message=data["message"],
        severity=data.get("severity", "info"),
        audience=data.get("audience", "all"),
        is_active=data.get("is_active", True),
        starts_at=_parse_dt(data.get("starts_at")) or datetime.utcnow(),
        ends_at=_parse_dt(data.get("ends_at")),
        created_by=get_jwt_identity(),
    )
    db.session.add(a); db.session.commit()
    log_audit("announcements", "INSERT", record_id=a.id, new=a.to_dict())
    return jsonify(a.to_dict()), 201

@bp.put("/<uuid:ann_id>")
@require_role("admin", "super_admin")
def update_announcement(ann_id):
    a = Announcement.query.get_or_404(str(ann_id))
    old = a.to_dict(); data = request.get_json(silent=True) or {}
    for f in ("title", "message", "severity", "audience", "is_active"):
        if f in data: setattr(a, f, data[f])
    if "starts_at" in data: a.starts_at = _parse_dt(data["starts_at"])
    if "ends_at" in data: a.ends_at = _parse_dt(data["ends_at"])
    db.session.commit()
    log_audit("announcements", "UPDATE", record_id=a.id, old=old, new=a.to_dict())
    return jsonify(a.to_dict())

@bp.delete("/<uuid:ann_id>")
@require_role("admin", "super_admin")
def delete_announcement(ann_id):
    a = Announcement.query.get_or_404(str(ann_id))
    old = a.to_dict(); db.session.delete(a); db.session.commit()
    log_audit("announcements", "DELETE", record_id=ann_id, old=old)
    return jsonify({"ok": True})
