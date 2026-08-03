"""
permissions.py — lets super_admin control which roles can access which
page/module from the UI, without touching code.

GET  /api/permissions   -> current permission map (any authenticated user —
                            the frontend needs this to decide what to show)
PUT  /api/permissions   -> update the map (super_admin only)

Storage: a single SystemSetting row, key="module_permissions",
value = { module_key: [role, role, ...] }

super_admin and admin ALWAYS have access to every configurable module.
They are intentionally not shown as togglable in the UI and cannot be
removed via the API, so a super admin can never accidentally lock
themselves out of their own system.

Other blueprints adopt this by swapping:
    @require_role("admin", "super_admin", "secretary", "pastor")
for:
    @require_module_role("members")
"""
from functools import wraps
from flask import Blueprint, request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, jwt_required
from extensions import db
from models import SystemSetting, UserRole
from security import require_role

try:
    from security import log_audit
except ImportError:  # pragma: no cover — audit logging is best-effort only
    log_audit = None

bp = Blueprint("permissions", __name__, url_prefix="/api/permissions")

SETTING_KEY = "module_permissions"

# Every module that can be toggled per-role, with a human label.
# Keys here MUST match the `permKey` values used in the frontend.
CONFIGURABLE_MODULES = {
    "members":     {"label": "Members"},
    "finance":     {"label": "Finance"},
    "departments": {"label": "Departments"},
    "attendance":  {"label": "Attendance"},
    "reports":     {"label": "Reports"},
    "broadcast":   {"label": "Broadcast"},
    "council":     {"label": "Council"},
}

# Roles that can be individually toggled per module. super_admin/admin are
# always-on and deliberately excluded from this list — see module docstring.
CONFIGURABLE_ROLES = ["pastor", "secretary", "treasurer", "ministry_leader", "lay_leader"]

# Defaults — match the app's existing hardcoded behaviour exactly, so nothing
# changes for anyone until a super admin actually edits something in the UI.
DEFAULT_PERMISSIONS = {
    "members":     ["secretary", "pastor", "lay_leader"],
    "finance":     ["treasurer", "pastor", "lay_leader"],
    "departments": ["pastor", "ministry_leader", "secretary", "lay_leader"],
    "attendance":  ["secretary", "pastor", "lay_leader"],
    "reports":     ["treasurer", "secretary", "pastor", "lay_leader"],
    "broadcast":   ["secretary", "pastor", "treasurer", "ministry_leader", "lay_leader"],
    "council":     ["pastor", "secretary", "lay_leader"],
}


def _load_permissions() -> dict:
    """Merge saved settings over the defaults so every module always has a value,
    even ones added to CONFIGURABLE_MODULES after the setting was last saved."""
    setting = SystemSetting.query.get(SETTING_KEY)
    saved = (setting.value if setting and setting.value else {}) or {}
    merged = {}
    for key in CONFIGURABLE_MODULES:
        roles = saved.get(key, DEFAULT_PERMISSIONS.get(key, []))
        merged[key] = [r for r in roles if r in CONFIGURABLE_ROLES]
    return merged


def _current_role():
    """Resolve the caller's role from their JWT. Raises via verify_jwt_in_request()
    if there's no valid token — matches how require_role behaves elsewhere."""
    verify_jwt_in_request()
    uid = get_jwt_identity()
    row = UserRole.query.filter_by(user_id=uid).first()
    return row.role if row else None


def require_module_role(module_key: str):
    """
    Dynamic, DB-backed replacement for @require_role(...). super_admin and
    admin always pass. Everyone else is checked against the live permission
    map, falling back to DEFAULT_PERMISSIONS if nothing's been configured.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            role = _current_role()
            if role in ("super_admin", "admin"):
                return fn(*args, **kwargs)
            allowed = _load_permissions().get(module_key, DEFAULT_PERMISSIONS.get(module_key, []))
            if role not in allowed:
                return jsonify({"error": "You do not have permission to perform this action."}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


@bp.get("")
@jwt_required()
def get_permissions():
    """Any authenticated user can READ the map — the frontend needs this to
    decide what to show in the sidebar/routes. Only super_admin can WRITE it."""
    return jsonify({
        "permissions": _load_permissions(),
        "modules": CONFIGURABLE_MODULES,
        "roles": CONFIGURABLE_ROLES,
    })


@bp.put("")
@jwt_required()
@require_role("super_admin")
def update_permissions():
    data = request.get_json(silent=True) or {}
    incoming = data.get("permissions")
    if not isinstance(incoming, dict):
        return jsonify({"error": "permissions object is required"}), 400

    cleaned = {}
    for key in CONFIGURABLE_MODULES:
        roles = incoming.get(key, [])
        if not isinstance(roles, list):
            return jsonify({"error": f"'{key}' must be a list of roles"}), 400
        invalid = [r for r in roles if r not in CONFIGURABLE_ROLES]
        if invalid:
            return jsonify({"error": f"Invalid role(s) for '{key}': {invalid}"}), 400
        cleaned[key] = roles

    setting = SystemSetting.query.get(SETTING_KEY)
    old = setting.value if setting else None
    if setting:
        setting.value = cleaned
    else:
        db.session.add(SystemSetting(key=SETTING_KEY, value=cleaned))
    db.session.commit()

    if log_audit:
        try:
            log_audit("system_settings", "UPDATE", record_id=None,
                      old={"key": SETTING_KEY, "value": old},
                      new={"key": SETTING_KEY, "value": cleaned})
        except Exception:
            pass  # audit logging is best-effort — never block the actual save

    return jsonify({"permissions": cleaned})