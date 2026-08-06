"""Generic CRUD dispatcher mirroring a small subset of Supabase PostgREST.

Frontend sends a JSON query like:
    { table, op, columns, filters: [{col, op, value}], order, limit, single, count, head, values, onConflict }

This lets the React app keep its existing `supabase.from(...)` style calls via a thin shim.
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from flask import Blueprint, request, jsonify
from sqlalchemy import asc, desc, func, and_
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from extensions import db
from models import (
    User, Profile, UserRole, Member, Giving, Attendance, Department,
    Announcement, FeatureFlag, Module, SystemSetting,
    AuditLog, LoginAttempt, AccountLock, Event,
)
from timezone_utils import to_nairobi_naive
from security import require_auth


bp = Blueprint("db", __name__, url_prefix="/api/db")

MODELS = {
    "users": User,
    "profiles": Profile,
    "user_roles": UserRole,
    "members": Member,
    "givings": Giving,
    "attendance": Attendance,
    "departments": Department,
    "announcements": Announcement,
    "feature_flags": FeatureFlag,
    "modules": Module,
    "system_settings": SystemSetting,
    "audit_logs": AuditLog,
    "login_attempts": LoginAttempt,
    "account_locks": AccountLock,
    "events": Event,
}


def _serialize(row):
    if hasattr(row, "to_dict"):
        return row.to_dict()
    # Fallback for models without to_dict (UserRole)
    out = {}
    for c in row.__table__.columns:
        v = getattr(row, c.name)
        if isinstance(v, (uuid.UUID,)):
            v = str(v)
        elif isinstance(v, (datetime, date)):
            v = v.isoformat()
        elif isinstance(v, Decimal):
            v = float(v)
        out[c.name] = v
    return out




def _apply_filters(q, model, filters):
    for f in filters or []:
        col_name = f.get("col")
        op = f.get("op", "eq")
        val = f.get("value")
        col = getattr(model, col_name, None)
        if col is None:
            continue
        if op == "eq":
            q = q.filter(col == val)
        elif op == "neq":
            q = q.filter(col != val)
        elif op == "gt":
            q = q.filter(col > val)
        elif op == "gte":
            q = q.filter(col >= val)
        elif op == "lt":
            q = q.filter(col < val)
        elif op == "lte":
            q = q.filter(col <= val)
        elif op == "ilike":
            q = q.filter(col.ilike(str(val)))
        elif op == "like":
            q = q.filter(col.like(val))
        elif op == "in":
            q = q.filter(col.in_(val or []))
        elif op == "is":
            q = q.filter(col.is_(val))
    return q


def _coerce(model, key, value):
    """Best-effort: convert ISO strings to datetimes for DateTime columns."""
    col = model.__table__.columns.get(key)
    if col is None or value is None:
        return value
    t = str(col.type).lower()
    if isinstance(value, str):
        if "timestamp" in t or "datetime" in t:
            try:
                if value.endswith("Z"):
                    # Explicit UTC input (e.g. JS toISOString()) — convert to Nairobi local
                    return to_nairobi_naive(datetime.fromisoformat(value.replace("Z", "+00:00")))
                parsed = datetime.fromisoformat(value)
                if parsed.tzinfo is not None:
                    return to_nairobi_naive(parsed)
                return parsed  # already-naive input is assumed to already be Nairobi local
            except Exception:
                return value
        if "date" == t:
            try:
                return date.fromisoformat(value)
            except Exception:
                return value
        if "uuid" in t:
            try:
                return uuid.UUID(value)
            except Exception:
                return value
    return value


def _row_from(model, payload):
    fields = {}
    for k, v in payload.items():
        if k in model.__table__.columns.keys():
            fields[k] = _coerce(model, k, v)
    return model(**fields)


@bp.post("")
@require_auth
def query():

    actor_id = get_jwt_identity()

    body = request.get_json(silent=True) or {}
    table = body.get("table")
    model = MODELS.get(table)
    if not model:
        return jsonify({"error": f"Unknown table {table}"}), 400

    op = body.get("op", "select")
    filters = body.get("filters", [])

    try:
        if op == "select":
            q = model.query
            q = _apply_filters(q, model, filters)
            for o in body.get("order", []) or []:
                col = getattr(model, o.get("col"), None)
                if col is not None:
                    q = q.order_by(asc(col) if o.get("ascending", True) else desc(col))
            count = q.count() if body.get("count") or body.get("head") else None
            if body.get("head"):
                return jsonify({"data": None, "count": count, "error": None})
            if body.get("limit"):
                q = q.limit(int(body["limit"]))
            rows = q.all()
            if body.get("single") or body.get("maybeSingle"):
                if len(rows) > 1 and body.get("single"):
                    return jsonify({"data": None, "error": {"message": "Multiple rows returned"}}), 200
                data = _serialize(rows[0]) if rows else None
                return jsonify({"data": data, "count": count, "error": None})
            return jsonify({"data": [_serialize(r) for r in rows], "count": count, "error": None})

        if op == "insert":
            values = body.get("values") or []
            if isinstance(values, dict):
                values = [values]
            created = []
            for v in values:
                row = _row_from(model, v)
                db.session.add(row)
                created.append(row)
            db.session.commit()
            return jsonify({"data": [_serialize(r) for r in created], "error": None})

        if op == "update":
            q = model.query
            q = _apply_filters(q, model, filters)
            payload = body.get("values") or {}
            rows = q.all()
            for r in rows:
                for k, v in payload.items():
                    if k in model.__table__.columns.keys():
                        setattr(r, k, _coerce(model, k, v))
            db.session.commit()
            return jsonify({"data": [_serialize(r) for r in rows], "error": None})

        if op == "delete":
            q = model.query
            q = _apply_filters(q, model, filters)
            rows = q.all()
            for r in rows:
                db.session.delete(r)
            db.session.commit()
            return jsonify({"data": [_serialize(r) for r in rows], "error": None})

        if op == "upsert":
            values = body.get("values") or []
            if isinstance(values, dict):
                values = [values]
            on_conflict = body.get("onConflict") or ["id"]
            result = []
            for v in values:
                conds = [getattr(model, c) == v.get(c) for c in on_conflict if c in model.__table__.columns.keys()]
                existing = model.query.filter(and_(*conds)).first() if conds else None
                if existing:
                    for k, val in v.items():
                        if k in model.__table__.columns.keys():
                            setattr(existing, k, _coerce(model, k, val))
                    result.append(existing)
                else:
                    row = _row_from(model, v)
                    db.session.add(row)
                    result.append(row)
            db.session.commit()
            return jsonify({"data": [_serialize(r) for r in result], "error": None})

        return jsonify({"error": f"Unknown op {op}"}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"data": None, "error": {"message": str(e)}}), 200