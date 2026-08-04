"""Members CRUD."""
from datetime import datetime
from flask import Blueprint, request, jsonify
from extensions import db
from models import Member, Department
from security import require_auth, log_audit
from permissions import require_module_role
from welcome_sms import send_welcome_sms
from bulk_import import parse_upload_rows, normalize_row, BulkImportError
from deletion_approval import register_deletable, request_or_delete
from timezone_utils import nairobi_today

bp = Blueprint("members", __name__, url_prefix="/api/members")

register_deletable("members", Member, label_field="full_name")

UPDATABLE = ("full_name", "email", "phone", "gender", "address",
             "baptism_status", "department", "status")


def _parse_date(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v)).date()
    except ValueError:
        return None


@bp.get("")
@require_auth
def list_members():
    q = Member.query
    if (g := request.args.get("gender")):
        q = q.filter_by(gender=g)
    if (d := request.args.get("department")):
        q = q.filter_by(department=d)
    if (s := request.args.get("status")):
        q = q.filter_by(status=s)
    if (search := request.args.get("q")):
        q = q.filter(Member.full_name.ilike(f"%{search.strip()}%"))
    q = q.order_by(Member.full_name.asc())
    q = q.order_by(Member.full_name.asc())

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)

    pagination = q.paginate(
        page=page,
        per_page=min(per_page, 200),  # prevent huge requests
        error_out=False
    )

    return jsonify({
        "members": [m.to_dict() for m in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
        "per_page": pagination.per_page
    })


@bp.get("/<uuid:member_id>")
@require_auth
def get_member(member_id):
    m = Member.query.get_or_404(str(member_id))
    return jsonify(m.to_dict())


@bp.post("")
@require_module_role("members")
def create_member():
    data = request.get_json(silent=True) or {}
    if not data.get("full_name"):
        return jsonify({"error": "full_name required"}), 400
    m = Member(
        full_name=data["full_name"],
        email=data.get("email") or None,
        phone=data.get("phone") or None,
        gender=data.get("gender") or None,
        date_of_birth=_parse_date(data.get("date_of_birth")),
        address=data.get("address") or None,
        baptism_status=data.get("baptism_status") or None,
        department=data.get("department") or None,
        join_date=_parse_date(data.get("join_date")) or nairobi_today(),
        status=data.get("status", "active"),
    )
    db.session.add(m)
    db.session.commit()
    log_audit("members", "INSERT", record_id=m.id, new=m.to_dict())

    # Fire welcome SMS (non-blocking — errors are logged, not raised)
    sms_status = None
    if m.phone:
        sms_status = send_welcome_sms(m)

    resp = m.to_dict()
    resp["sms_status"] = sms_status  # "sent" | "no_provider" | "no_phone" | "failed:<reason>"
    return jsonify(resp), 201


@bp.put("/<uuid:member_id>")
@require_module_role("members")
def update_member(member_id):
    m = Member.query.get_or_404(str(member_id))
    old = m.to_dict()
    data = request.get_json(silent=True) or {}
    for f in UPDATABLE:
        if f in data:
            setattr(m, f, data[f] or None if f != "full_name" else data[f])
    if "date_of_birth" in data:
        m.date_of_birth = _parse_date(data["date_of_birth"])
    if "join_date" in data:
        m.join_date = _parse_date(data["join_date"])
    db.session.commit()
    log_audit("members", "UPDATE", record_id=m.id, old=old, new=m.to_dict())
    return jsonify(m.to_dict())


@bp.delete("/<uuid:member_id>")
@require_module_role("members")
def delete_member(member_id):
    """Admins/super_admins delete immediately (audit-logged); everyone else
    permitted to touch this module creates a pending request for approval."""
    m = Member.query.get_or_404(str(member_id))
    body = request.get_json(silent=True) or {}
    result = request_or_delete("members", m, reason=body.get("reason"))
    if result["immediate"]:
        return jsonify({"ok": True, "deleted": True})
    return jsonify({
        "pending": True,
        "message": "Deletion requires admin approval.",
        "request": result["pending"].to_dict(),
    }), 202


MEMBER_FIELD_ALIASES = {
    "full_name": "full_name", "name": "full_name", "fullname": "full_name", "member_name": "full_name",
    "email": "email", "email_address": "email",
    "phone": "phone", "phone_number": "phone", "mobile": "phone", "telephone": "phone", "tel": "phone",
    "gender": "gender", "sex": "gender",
    "date_of_birth": "date_of_birth", "dob": "date_of_birth", "birth_date": "date_of_birth", "birthdate": "date_of_birth",
    "address": "address", "home_address": "address",
    "baptism_status": "baptism_status", "baptism": "baptism_status",
    "department": "department", "ministry": "department",
    "join_date": "join_date", "date_joined": "join_date", "joined": "join_date", "joined_date": "join_date",
    "status": "status",
}


@bp.post("/bulk-import")
@require_module_role("members")
def bulk_import_members():
    """
    Bulk-create members from an uploaded .csv/.json file (multipart field "file")
    or a JSON body (a top-level array, or {"data": [...]}).

    Best-effort: valid rows are created, invalid rows are skipped and reported
    individually (with their row number) so one bad row doesn't sink the batch.

    Query params:
      send_welcome_sms=true   also fire the welcome SMS for each imported member
                               that has a phone number. Off by default so a
                               historical/bulk import doesn't SMS everyone.
    """
    try:
        raw_rows = parse_upload_rows(request)
    except BulkImportError as e:
        return jsonify({"error": str(e)}), 400

    send_sms = request.args.get("send_welcome_sms", "").lower() in ("1", "true", "yes")

    created, errors = [], []
    for idx, raw_row in enumerate(raw_rows, start=1):
        row = normalize_row(raw_row, MEMBER_FIELD_ALIASES)
        full_name = (row.get("full_name") or "").strip()
        if not full_name:
            errors.append({"row": idx, "error": "full_name is required"})
            continue

        dob_raw = row.get("date_of_birth")
        dob = _parse_date(dob_raw)
        if dob_raw and not dob:
            errors.append({"row": idx, "error": f"Unrecognised date_of_birth '{dob_raw}' (use YYYY-MM-DD)"})
            continue

        jd_raw = row.get("join_date")
        jd = _parse_date(jd_raw)
        if jd_raw and not jd:
            errors.append({"row": idx, "error": f"Unrecognised join_date '{jd_raw}' (use YYYY-MM-DD)"})
            continue

        try:
            with db.session.begin_nested():
                m = Member(
                    full_name=full_name,
                    email=row.get("email") or None,
                    phone=row.get("phone") or None,
                    gender=row.get("gender") or None,
                    date_of_birth=dob,
                    address=row.get("address") or None,
                    baptism_status=row.get("baptism_status") or None,
                    department=row.get("department") or None,
                    join_date=jd or nairobi_today(),
                    status=row.get("status") or "active",
                )
                db.session.add(m)
            created.append(m)
        except Exception as e:
            errors.append({"row": idx, "error": f"Could not save row: {e}"})

    db.session.commit()

    sms_sent = 0
    if send_sms:
        for m in created:
            if m.phone and send_welcome_sms(m) == "sent":
                sms_sent += 1

    for m in created:
        log_audit("members", "INSERT", record_id=m.id, new=m.to_dict())

    resp = {
        "total_rows": len(raw_rows),
        "imported": len(created),
        "failed": len(errors),
        "errors": errors,
        "items": [m.to_dict() for m in created],
    }
    if send_sms:
        resp["sms_sent"] = sms_sent
    return jsonify(resp), 200