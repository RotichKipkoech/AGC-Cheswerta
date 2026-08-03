from datetime import datetime, timedelta, date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func, or_
from extensions import db
from models import Member, CouncilMember, SystemSetting, AuditLog, User
from security import require_role
from permissions import require_module_role
from welcome_sms import _dispatch as _sms_dispatch, _normalise_phone as _norm_phone
from sms_logger import log_sms

bp = Blueprint("broadcast", __name__, url_prefix="/api/broadcast")

# Departments that count as "church council"
COUNCIL_DEPTS = {
    "council", "church council", "elders", "deacons", "deaconess",
    "board", "executive", "leadership", "pastors", "trustees",
}

NEW_MEMBER_DAYS = 90  # how recent "new member" means


# ─── helpers ──────────────────────────────────────────────────────────────────

def _get_sms_cfg():
    setting = SystemSetting.query.get("integrations")
    if not setting or not setting.value:
        return None, "No SMS integration configured. Save your SMS settings first."
    sms = setting.value.get("sms") or {}
    provider = (sms.get("provider") or "none").lower()
    if provider == "none":
        return None, "No SMS provider configured."
    return sms, None


def _resolve_audience(target: str, member_ids: list | None = None):
    """Return (list_of_members, description_str, error_str|None)."""
    q = Member.query.filter(
        Member.status == "active",
        Member.phone.isnot(None),
        Member.phone != "",
    )

    if target == "all":
        members = q.all()
        desc = "All active members"

    elif target == "new_members":
        since = date.today() - timedelta(days=NEW_MEMBER_DAYS)
        members = q.filter(Member.join_date >= since).all()
        desc = f"New members (joined last {NEW_MEMBER_DAYS} days)"

    elif target == "council":
        # Primary source: the dedicated Church Council roster (managed via
        # the Council page) — this is the authoritative list of who's
        # currently serving, independent of whether they have a Member record.
        council_roster = CouncilMember.query.filter(
            CouncilMember.is_active == True,  # noqa: E712
            CouncilMember.phone.isnot(None),
            CouncilMember.phone != "",
        ).all()

        # Secondary source: any regular Member whose department also matches
        # a council-style name, for anyone not yet added to the dedicated roster.
        dept_matches = q.filter(
            func.lower(Member.department).in_(COUNCIL_DEPTS)
        ).all()

        # Combine, de-duplicating by normalised phone so nobody is messaged twice.
        seen_phones = set()
        members = []
        for m in list(council_roster) + list(dept_matches):
            key = _norm_phone(m.phone)
            if key in seen_phones:
                continue
            seen_phones.add(key)
            members.append(m)

        desc = "Church council / leadership"

    elif target == "baptized":
        members = q.filter(func.lower(Member.baptism_status) == "baptized").all()
        desc = "Baptized members"

    elif target == "not_baptized":
        members = q.filter(
            or_(Member.baptism_status.is_(None), func.lower(Member.baptism_status) != "baptized")
        ).all()
        desc = "Not yet baptized"

    elif target == "selected":
        ids = [str(i).strip() for i in (member_ids or []) if str(i).strip()]
        if not ids:
            return [], "", "No members selected. Pick at least one member."
        members = q.filter(Member.id.in_(ids)).all()
        desc = f"{len(members)} individually selected member{'s' if len(members) != 1 else ''}"

    elif target.startswith("department:"):
        dept_name = target.split(":", 1)[1].strip()
        members = q.filter(
            func.lower(Member.department) == dept_name.lower()
        ).all()
        desc = f"Department: {dept_name}"

    else:
        return [], "", f"Unknown audience target: {target}"

    return members, desc, None


def _send_one(sms: dict, phone: str, message: str):
    """Send a single SMS via the shared welcome_sms._dispatch helper.
    Returns (ok: bool, error: str|None)."""
    try:
        _sms_dispatch(sms, phone, message)
        return True, None
    except Exception as exc:
        return False, str(exc)


def _personalise(full_name: str, body: str) -> str:
    """Single-line format: Dear {First}, {body} - CheswertaAGC"""
    first = (full_name or "").strip().split()[0].capitalize() if full_name else "Member"
    return f"Dear {first}, {body} - CheswertaAGC"


def _log_broadcast(actor_id, actor_email, audience_desc, message, sent, failed, skipped):
    entry = AuditLog(
        table_name="broadcast",
        record_id=None,
        action="INSERT",
        actor_id=actor_id,
        actor_email=actor_email,
        old_data=None,
        new_data={
            "audience": audience_desc,
            "message_preview": message[:120],
            "sent": sent,
            "failed": failed,
            "skipped": skipped,
            "total": sent + failed + skipped,
        },
    )
    db.session.add(entry)
    db.session.commit()


# ─── routes ───────────────────────────────────────────────────────────────────

@bp.get("/departments")
@jwt_required()
def get_departments():
    """Return distinct department names for the audience picker."""
    rows = (
        db.session.query(Member.department)
        .filter(Member.status == "active", Member.department.isnot(None), Member.department != "")
        .distinct()
        .order_by(Member.department)
        .all()
    )
    return jsonify({"departments": [r[0] for r in rows]})


@bp.post("/preview")
@jwt_required()
@require_module_role("broadcast")
def preview():
    """Dry-run: resolve audience and return recipient count + sample names."""
    body = request.get_json(silent=True) or {}
    target = (body.get("audience") or "").strip()
    message = (body.get("message") or "").strip()
    member_ids = body.get("member_ids") or []

    if not target:
        return jsonify({"error": "audience is required"}), 400
    if not message:
        return jsonify({"error": "message is required"}), 400
    if len(message) > 640:
        return jsonify({"error": "Message too long (max 640 characters)"}), 400

    members, desc, err = _resolve_audience(target, member_ids)
    if err:
        return jsonify({"error": err}), 400

    no_phone = [m for m in members if not (m.phone or "").strip()]
    reachable = [m for m in members if (m.phone or "").strip()]

    sample = [{"name": m.full_name, "phone": m.phone} for m in reachable[:5]]
    sms_count = -(-len(reachable) // 160) if message else 0  # ceil div — SMS parts

    return jsonify({
        "audience_label": desc,
        "total_members": len(members),
        "reachable": len(reachable),
        "no_phone": len(no_phone),
        "sample": sample,
        "sms_parts": sms_count,
        "char_count": len(message),
    })


@bp.post("/send")
@jwt_required()
@require_module_role("broadcast")
def send_broadcast():
    """Actually send the broadcast."""
    body = request.get_json(silent=True) or {}
    target  = (body.get("audience") or "").strip()
    message = (body.get("message") or "").strip()
    member_ids = body.get("member_ids") or []

    if not target:
        return jsonify({"error": "audience is required"}), 400
    if not message:
        return jsonify({"error": "message is required"}), 400
    if len(message) > 640:
        return jsonify({"error": "Message too long (max 640 characters)"}), 400

    sms_cfg, cfg_err = _get_sms_cfg()
    if cfg_err:
        return jsonify({"error": cfg_err}), 400

    members, desc, err = _resolve_audience(target, member_ids)
    if err:
        return jsonify({"error": err}), 400

    reachable = [m for m in members if (m.phone or "").strip()]
    skipped   = len(members) - len(reachable)

    sent_list, failed_list = [], []
    provider_name = (sms_cfg.get("provider") or "none").lower()
    identity = get_jwt_identity()
    actor = User.query.get(identity) if identity else None

    for m in reachable:
        personalised = _personalise(m.full_name, message)
        phone_e164 = _norm_phone(m.phone)
        ok, error = _send_one(sms_cfg, phone_e164, personalised)
        if ok:
            sent_list.append({"name": m.full_name, "phone": m.phone})
            log_sms(
                event_type="broadcast",
                phone=phone_e164,
                message=personalised,
                provider=provider_name,
                status="sent",
                recipient_name=m.full_name,
                sent_by=str(actor.id) if actor else None,
            )
        else:
            failed_list.append({"name": m.full_name, "phone": m.phone, "error": error})
            log_sms(
                event_type="broadcast",
                phone=phone_e164,
                message=personalised,
                provider=provider_name,
                status="failed",
                recipient_name=m.full_name,
                error_detail=error,
                sent_by=str(actor.id) if actor else None,
            )

    # Audit
    _log_broadcast(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        audience_desc=desc,
        message=message,
        sent=len(sent_list),
        failed=len(failed_list),
        skipped=skipped,
    )

    return jsonify({
        "ok": True,
        "audience_label": desc,
        "sent": len(sent_list),
        "failed": len(failed_list),
        "skipped": skipped,
        "total": len(reachable),
        "failed_details": failed_list[:20],  # cap to avoid huge payload
    })


@bp.get("/history")
@jwt_required()
@require_module_role("broadcast")
def history():
    """Return recent broadcast audit entries."""
    limit = min(int(request.args.get("limit", 50)), 200)
    rows = (
        AuditLog.query
        .filter_by(table_name="broadcast", action="INSERT")
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify({"history": [r.to_dict() for r in rows]})