"""Council Members CRUD — church council / leadership roster with name, role, phone.

A council entry can be created in two ways:
  1. Linked to an existing Member  → pass `member_id`; full_name/phone/email
     are pulled from that Member automatically (kept in sync on each read).
  2. Standalone                    → pass full_name/phone manually (no
     matching Member record required) — for people not yet in Members.
"""
from flask import Blueprint, request, jsonify
from extensions import db
from models import CouncilMember, Member
from security import require_auth, require_role, log_audit
from permissions import require_module_role
from deletion_approval import register_deletable, request_or_delete

bp = Blueprint("council_members", __name__, url_prefix="/api/council-members")

register_deletable("council_members", CouncilMember, label_field=lambda c: f"{c.full_name} ({c.role})")



def _sync_from_member(c: CouncilMember):
    """If linked to a Member, refresh name/phone/email from that record."""
    if c.member_id and c.member:
        c.full_name = c.member.full_name
        c.phone = c.member.phone or c.phone
        c.email = c.member.email or c.email


@bp.get("")
@require_auth
def list_council_members():
    q = CouncilMember.query
    if (s := request.args.get("status")):
        if s == "active":
            q = q.filter_by(is_active=True)
        elif s == "inactive":
            q = q.filter_by(is_active=False)
    items = q.order_by(CouncilMember.full_name.asc()).all()
    for c in items:
        _sync_from_member(c)
    return jsonify({"council_members": [c.to_dict() for c in items], "total": len(items)})


@bp.get("/available-members")
@require_auth
def available_members():
    """Members not yet on the council roster — for the 'add from existing member' picker."""
    search = (request.args.get("q") or "").strip()
    existing_member_ids = {
        str(mid) for (mid,) in db.session.query(CouncilMember.member_id)
        .filter(CouncilMember.member_id.isnot(None)).all()
    }
    q = Member.query.filter(Member.status == "active")
    if search:
        q = q.filter(Member.full_name.ilike(f"%{search}%"))
    candidates = q.order_by(Member.full_name.asc()).limit(50).all()
    results = [m for m in candidates if str(m.id) not in existing_member_ids]
    return jsonify({
        "members": [
            {"id": str(m.id), "full_name": m.full_name, "phone": m.phone, "email": m.email, "department": m.department}
            for m in results
        ]
    })


@bp.get("/<uuid:council_id>")
@require_auth
def get_council_member(council_id):
    c = CouncilMember.query.get_or_404(str(council_id))
    _sync_from_member(c)
    return jsonify(c.to_dict())


@bp.post("")
@require_module_role("council")
def create_council_member():
    data = request.get_json(silent=True) or {}
    member_id = (data.get("member_id") or "").strip() or None
    role = (data.get("role") or "").strip()

    if not role:
        return jsonify({"error": "role is required"}), 400

    if member_id:
        # ── Add from an existing Member ──────────────────────────────
        member = Member.query.get(member_id)
        if not member:
            return jsonify({"error": "Member not found"}), 404
        if not (member.phone or "").strip():
            return jsonify({"error": f"{member.full_name} has no phone number on file. Add one in Members first."}), 400
        if CouncilMember.query.filter_by(member_id=member.id).first():
            return jsonify({"error": f"{member.full_name} is already on the council roster"}), 409

        c = CouncilMember(
            member_id=member.id,
            full_name=member.full_name,
            role=role,
            phone=member.phone,
            email=member.email,
            notes=(data.get("notes") or "").strip() or None,
            is_active=data.get("is_active", True),
        )
    else:
        # ── Standalone entry ──────────────────────────────────────────
        full_name = (data.get("full_name") or "").strip()
        phone = (data.get("phone") or "").strip()
        if not full_name:
            return jsonify({"error": "full_name is required"}), 400
        if not phone:
            return jsonify({"error": "phone is required"}), 400

        c = CouncilMember(
            full_name=full_name,
            role=role,
            phone=phone,
            email=(data.get("email") or "").strip() or None,
            notes=(data.get("notes") or "").strip() or None,
            is_active=data.get("is_active", True),
        )

    db.session.add(c)
    db.session.commit()
    log_audit("council_members", "INSERT", record_id=c.id, new=c.to_dict())
    return jsonify(c.to_dict()), 201


@bp.put("/<uuid:council_id>")
@require_module_role("council")
def update_council_member(council_id):
    c = CouncilMember.query.get_or_404(str(council_id))
    old = c.to_dict()
    data = request.get_json(silent=True) or {}

    # Linked entries: name/phone/email are managed via Members, not edited here.
    if not c.member_id:
        if "full_name" in data:
            full_name = (data["full_name"] or "").strip()
            if not full_name:
                return jsonify({"error": "full_name cannot be empty"}), 400
            c.full_name = full_name
        if "phone" in data:
            phone = (data["phone"] or "").strip()
            if not phone:
                return jsonify({"error": "phone cannot be empty"}), 400
            c.phone = phone
        if "email" in data:
            c.email = (data["email"] or "").strip() or None

    if "role" in data:
        role = (data["role"] or "").strip()
        if not role:
            return jsonify({"error": "role cannot be empty"}), 400
        c.role = role
    if "notes" in data:
        c.notes = (data["notes"] or "").strip() or None
    if "is_active" in data:
        c.is_active = bool(data["is_active"])

    db.session.commit()
    log_audit("council_members", "UPDATE", record_id=c.id, old=old, new=c.to_dict())
    return jsonify(c.to_dict())


@bp.delete("/<uuid:council_id>")
@require_module_role("council")
def delete_council_member(council_id):
    c = CouncilMember.query.get_or_404(str(council_id))
    body = request.get_json(silent=True) or {}
    result = request_or_delete("council_members", c, reason=body.get("reason"))
    if result["immediate"]:
        return jsonify({"ok": True, "deleted": True})
    return jsonify({"pending": True, "message": "Deletion requires admin approval.",
                     "request": result["pending"].to_dict()}), 202