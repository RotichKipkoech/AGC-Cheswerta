"""Departments CRUD — includes live member_count per department."""
from flask import Blueprint, request, jsonify
from sqlalchemy import func
from extensions import db
from models import Department, Member
from security import require_auth, require_role, log_audit
from bulk_import import parse_upload_rows, normalize_row, BulkImportError
from permissions import require_module_role
from deletion_approval import register_deletable, request_or_delete

bp = Blueprint("departments", __name__, url_prefix="/api/departments")

register_deletable("departments", Department, label_field="name")


def _with_counts(items):
    """Attach member counts to a list of Department objects in one query."""
    if not items:
        return []
    counts = dict(
        db.session.query(Member.department, func.count(Member.id))
        .filter(Member.department.isnot(None))
        .group_by(Member.department)
        .all()
    )
    return [d.to_dict(member_count=counts.get(d.name, 0)) for d in items]


@bp.get("")
@require_auth
def list_departments():
    items = Department.query.order_by(Department.name.asc()).all()
    return jsonify({"departments": _with_counts(items)})


@bp.post("")
@require_role("admin", "super_admin", "secretary", "pastor")
def create_department():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    if Department.query.filter_by(name=name).first():
        return jsonify({"error": f"Department '{name}' already exists"}), 409
    d = Department(
        name=name,
        description=(data.get("description") or "").strip() or None,
        leader_name=(data.get("leader_name") or data.get("leader") or "").strip() or None,
    )
    db.session.add(d)
    db.session.commit()
    log_audit("departments", "INSERT", record_id=d.id, new=d.to_dict())
    return jsonify(d.to_dict()), 201


@bp.put("/<uuid:dept_id>")
@require_role("admin", "super_admin", "secretary", "pastor")
def update_department(dept_id):
    d = Department.query.get_or_404(str(dept_id))
    old = d.to_dict()
    data = request.get_json(silent=True) or {}
    if "name" in data and data["name"].strip():
        d.name = data["name"].strip()
    if "description" in data:
        d.description = (data["description"] or "").strip() or None
    if "leader_name" in data:
        d.leader_name = (data["leader_name"] or "").strip() or None
    if "leader" in data:
        d.leader_name = (data["leader"] or "").strip() or None
    db.session.commit()
    log_audit("departments", "UPDATE", record_id=d.id, old=old, new=d.to_dict())
    return jsonify(d.to_dict())


@bp.delete("/<uuid:dept_id>")
@require_module_role("departments")
def delete_department(dept_id):
    d = Department.query.get_or_404(str(dept_id))
    body = request.get_json(silent=True) or {}
    result = request_or_delete("departments", d, reason=body.get("reason"))
    if result["immediate"]:
        return jsonify({"ok": True, "deleted": True})
    return jsonify({"pending": True, "message": "Deletion requires admin approval.",
                     "request": result["pending"].to_dict()}), 202


DEPARTMENT_FIELD_ALIASES = {
    "name": "name", "department": "name", "department_name": "name", "ministry": "name", "ministry_name": "name",
    "description": "description", "desc": "description", "details": "description",
    "leader": "leader_name", "leader_name": "leader_name", "head": "leader_name", "ministry_leader": "leader_name",
}


@bp.post("/bulk-import")
@require_role("admin", "super_admin", "secretary", "pastor")
def bulk_import_departments():
    """
    Bulk-create departments from an uploaded .csv/.json file (multipart field
    "file") or a JSON body (a top-level array, or {"data": [...]}).

    Best-effort: valid rows are created, invalid or duplicate-named rows are
    skipped and reported individually so one bad row doesn't sink the batch.
    """
    try:
        raw_rows = parse_upload_rows(request)
    except BulkImportError as e:
        return jsonify({"error": str(e)}), 400

    existing_names = {d.name for d in Department.query.all()}
    created, errors = [], []

    for idx, raw_row in enumerate(raw_rows, start=1):
        row = normalize_row(raw_row, DEPARTMENT_FIELD_ALIASES)
        name = (row.get("name") or "").strip()
        if not name:
            errors.append({"row": idx, "error": "name is required"})
            continue
        if name in existing_names:
            errors.append({"row": idx, "error": f"Department '{name}' already exists"})
            continue
        try:
            with db.session.begin_nested():
                d = Department(
                    name=name,
                    description=(row.get("description") or "").strip() or None,
                    leader_name=(row.get("leader_name") or "").strip() or None,
                )
                db.session.add(d)
            created.append(d)
            existing_names.add(name)
        except Exception as e:
            errors.append({"row": idx, "error": f"Could not save row: {e}"})

    db.session.commit()
    for d in created:
        log_audit("departments", "INSERT", record_id=d.id, new=d.to_dict())

    return jsonify({
        "total_rows": len(raw_rows),
        "imported": len(created),
        "failed": len(errors),
        "errors": errors,
        "items": [d.to_dict() for d in created],
    }), 200