"""Audit log routes + DELETE /api/audit-logs/cleanup?before=<ISO date>"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from extensions import db
from models import AuditLog
from security import require_role as require_roles
from timezone_utils import to_nairobi_naive

bp = Blueprint("audit", __name__, url_prefix="/api/audit-logs")


@bp.get("")
@jwt_required()
@require_roles("super_admin", "admin")
def list_logs():
    table = request.args.get("table")
    action = request.args.get("action")
    limit = min(int(request.args.get("limit", 200)), 500)

    q = AuditLog.query.order_by(AuditLog.created_at.desc())
    if table:
        q = q.filter(AuditLog.table_name == table)
    if action:
        q = q.filter(AuditLog.action == action.upper())

    rows = q.limit(limit).all()
    return jsonify({"data": [r.to_dict() for r in rows]})


@bp.delete("/cleanup")
@jwt_required()
@require_roles("super_admin")
def cleanup():
    """
    DELETE /api/audit-logs/cleanup?before=2024-01-01T00:00:00Z
    Removes all audit log entries older than the given ISO timestamp.
    """
    before_str = request.args.get("before")
    if not before_str:
        return jsonify({"error": "Query param 'before' (ISO date) is required"}), 400

    from datetime import datetime
    try:
        parsed = datetime.fromisoformat(before_str.replace("Z", "+00:00"))
        cutoff = to_nairobi_naive(parsed) if parsed.tzinfo is not None else parsed
    except ValueError:
        return jsonify({"error": "Invalid date format. Use ISO 8601, e.g. 2024-01-01T00:00:00Z"}), 400

    deleted = AuditLog.query.filter(AuditLog.created_at < cutoff).delete()
    db.session.commit()
    return jsonify({"ok": True, "deleted": deleted, "before": cutoff.isoformat()})