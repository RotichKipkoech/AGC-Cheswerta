"""CPanel overview — aggregated stats for the super-admin dashboard."""
from datetime import timedelta
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func, text
from extensions import db
from models import User, UserRole, Member, Giving, Attendance, AuditLog
from security import require_role
from timezone_utils import nairobi_now

bp = Blueprint("cpanel", __name__, url_prefix="/api/cpanel")


@bp.get("/overview")
@jwt_required()
@require_role("super_admin", "admin")
def overview():
    total_users = db.session.query(func.count(User.id)).scalar() or 0
    active_users = db.session.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0  # noqa: E712
    locked_users = total_users - active_users

    total_members = db.session.query(func.count(Member.id)).scalar() or 0
    total_givings_amount = float(
        db.session.query(func.coalesce(func.sum(Giving.amount), 0)).scalar() or 0
    )
    total_attendance = db.session.query(func.count(Attendance.id)).scalar() or 0

    role_rows = (db.session.query(UserRole.role, func.count(UserRole.user_id))
                 .group_by(UserRole.role).all())
    roles_count = {r: c for r, c in role_rows}

    since_24h = nairobi_now() - timedelta(hours=24)
    recent_events = (db.session.query(func.count(AuditLog.id))
                     .filter(AuditLog.created_at >= since_24h)
                     .scalar() or 0)

    return jsonify({
        "totalUsers": total_users,
        "activeUsers": active_users,
        "lockedUsers": locked_users,
        "totalMembers": total_members,
        "totalGivings": total_givings_amount,
        "totalAttendance": total_attendance,
        "rolesCount": roles_count,
        "recentEvents": recent_events,
    })