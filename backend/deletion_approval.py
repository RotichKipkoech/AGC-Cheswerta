"""
deletion_approval.py — nothing is ever deleted immediately, anywhere in
this app. Every delete action — including an admin's own — creates a
PendingDeletion row instead. Only an admin or super_admin can approve it
(which then performs the real delete) or reject it (record stays untouched).

Wiring a model in:

    from deletion_approval import register_deletable, request_deletion
    register_deletable("members", Member, label_field="full_name")

    @bp.delete("/<uuid:member_id>")
    @require_role(...)                       # same permission as before — this
    def delete_member(member_id):            # only gates who can REQUEST a delete
        m = Member.query.get_or_404(str(member_id))
        body = request.get_json(silent=True) or {}
        pending = request_deletion("members", m, reason=body.get("reason"))
        return jsonify({"pending": True, "message": "Deletion requires admin approval.",
                         "request": pending.to_dict()}), 202

Reviewing (any admin/super_admin, not necessarily a different person than
the requester — see note in approve()):

    GET  /api/pending-deletions?status=pending
    POST /api/pending-deletions/<id>/approve   { "note": "..." }
    POST /api/pending-deletions/<id>/reject    { "note": "..." }
    GET  /api/pending-deletions/count          -> { "pending": N }  (for a sidebar badge)
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db
from models import PendingDeletion, User
from security import require_role, log_audit, has_role
from timezone_utils import nairobi_now

bp = Blueprint("deletion_approval", __name__, url_prefix="/api/pending-deletions")

# table_name -> (ModelClass, label_field_name_or_callable)
_REGISTRY: dict[str, tuple] = {}


def register_deletable(table_name: str, model_class, label_field="id"):
    """Call once per model, at blueprint import time (see each routes/*.py)."""
    _REGISTRY[table_name] = (model_class, label_field)


def _label_for(record, label_field) -> str:
    if callable(label_field):
        try:
            return label_field(record)
        except Exception:
            return str(getattr(record, "id", "") or "")
    return str(getattr(record, label_field, "") or getattr(record, "id", ""))


def request_deletion(table_name: str, record, reason: str | None = None, snapshot: dict | None = None) -> PendingDeletion:
    """
    Create a pending-deletion request for `record` (an already-loaded model
    instance) and commit it. Does NOT delete `record` — the caller's route
    should return immediately after this without touching the original row.

    Pass `snapshot=` explicitly if the model has a richer serializer than
    its own .to_dict() (e.g. users.py's _serialize() which includes role
    and profile fields that User.to_dict() alone doesn't).
    """
    _, label_field = _REGISTRY.get(table_name, (None, "id"))
    label = _label_for(record, label_field)
    if snapshot is None:
        snapshot = record.to_dict() if hasattr(record, "to_dict") else {}

    uid = get_jwt_identity()
    requester = User.query.get(uid) if uid else None

    pending = PendingDeletion(
        table_name=table_name,
        record_id=record.id,
        record_label=label,
        record_snapshot=snapshot,
        requested_by=requester.id if requester else None,
        requested_by_email=requester.email if requester else None,
        reason=(reason or "").strip() or None,
        status="pending",
    )
    db.session.add(pending)
    db.session.commit()
    return pending


def request_or_delete(table_name: str, record, reason: str | None = None, snapshot: dict | None = None) -> dict:
    """
    Admins and super admins delete immediately (still fully audit-logged) —
    they're the ones who'd otherwise just approve their own request a moment
    later anyway, so the extra step is pure friction for them. Everyone else
    who's permitted to request a delete for this resource still goes through
    the normal approval queue.

    Returns either:
      {"immediate": True, "deleted": True}
      {"immediate": False, "pending": <PendingDeletion>}
    """
    uid = get_jwt_identity()
    if has_role(uid, "admin", "super_admin"):
        data_snapshot = snapshot if snapshot is not None else (record.to_dict() if hasattr(record, "to_dict") else {})
        actor = User.query.get(uid) if uid else None
        record_id = record.id
        db.session.delete(record)
        db.session.commit()
        log_audit(table_name, "DELETE", record_id=record_id, old=data_snapshot, actor=actor)
        return {"immediate": True, "deleted": True}

    pending = request_deletion(table_name, record, reason=reason, snapshot=snapshot)
    return {"immediate": False, "pending": pending}


@bp.get("")
@jwt_required()
@require_role("admin", "super_admin")
def list_pending():
    status = request.args.get("status", "pending")
    q = PendingDeletion.query
    if status != "all":
        q = q.filter_by(status=status)
    items = q.order_by(PendingDeletion.created_at.desc()).limit(200).all()
    return jsonify({"requests": [p.to_dict() for p in items], "total": len(items)})


@bp.get("/count")
@jwt_required()
@require_role("admin", "super_admin")
def pending_count():
    """Lightweight badge-count endpoint — poll this for the sidebar."""
    count = PendingDeletion.query.filter_by(status="pending").count()
    return jsonify({"pending": count})


@bp.post("/<uuid:req_id>/approve")
@jwt_required()
@require_role("admin", "super_admin")
def approve(req_id):
    """
    Performs the actual deletion. Note: the SAME admin who requested it can
    approve their own request — a solo-admin church would otherwise be
    unable to ever delete anything. This still adds real protection (a
    deliberate second step, a visible queue, a full audit trail) even
    without requiring a different reviewer. If you want to enforce a
    different-person rule later, check request.requested_by != get_jwt_identity()
    here and 403 when they match (except for super_admin, perhaps).
    """
    pending = PendingDeletion.query.get_or_404(str(req_id))
    if pending.status != "pending":
        return jsonify({"error": f"This request was already {pending.status}"}), 400

    model_class, _ = _REGISTRY.get(pending.table_name, (None, None))
    if model_class is None:
        return jsonify({"error": f"Unknown table '{pending.table_name}' — cannot complete deletion"}), 400

    record = model_class.query.get(str(pending.record_id))
    body = request.get_json(silent=True) or {}
    uid = get_jwt_identity()
    approver = User.query.get(uid) if uid else None

    if record is not None:
        db.session.delete(record)
        log_audit(pending.table_name, "DELETE", record_id=pending.record_id,
                  old=pending.record_snapshot, actor=approver)

    pending.status = "approved"
    pending.reviewed_by = approver.id if approver else None
    pending.reviewed_by_email = approver.email if approver else None
    pending.reviewed_at = nairobi_now()
    pending.review_note = (body.get("note") or "").strip() or None
    db.session.commit()

    return jsonify({
        "ok": True,
        "deleted": record is not None,
        "already_gone": record is None,  # e.g. someone else deleted it a different way in the meantime
        "request": pending.to_dict(),
    })


@bp.post("/<uuid:req_id>/reject")
@jwt_required()
@require_role("admin", "super_admin")
def reject(req_id):
    pending = PendingDeletion.query.get_or_404(str(req_id))
    if pending.status != "pending":
        return jsonify({"error": f"This request was already {pending.status}"}), 400

    body = request.get_json(silent=True) or {}
    uid = get_jwt_identity()
    reviewer = User.query.get(uid) if uid else None

    pending.status = "rejected"
    pending.reviewed_by = reviewer.id if reviewer else None
    pending.reviewed_by_email = reviewer.email if reviewer else None
    pending.reviewed_at = nairobi_now()
    pending.review_note = (body.get("note") or "").strip() or None
    db.session.commit()

    return jsonify({"ok": True, "request": pending.to_dict()})