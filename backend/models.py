import uuid
from datetime import datetime, date
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy import Enum as SAEnum
from extensions import db, bcrypt
from timezone_utils import nairobi_now, nairobi_today


def _uuid_pk():
    return db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


APP_ROLES = ("super_admin", "admin", "pastor", "secretary", "treasurer", "ministry_leader", "lay_leader")
app_role_enum = SAEnum(*APP_ROLES, name="app_role")


# ──────────────────────────────────────────────
# User & auth
# ──────────────────────────────────────────────

class User(db.Model):
    """Replaces Supabase auth.users."""
    __tablename__ = "users"
    id = _uuid_pk()
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    username = db.Column(db.String(100), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    profile = db.relationship("Profile", uselist=False, back_populates="user", cascade="all, delete-orphan")
    roles = db.relationship("UserRole", back_populates="user", cascade="all, delete-orphan")

    def set_password(self, raw: str) -> None:
        self.password_hash = bcrypt.generate_password_hash(raw).decode("utf-8")

    def check_password(self, raw: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, raw)

    def to_dict(self):
        return {
            "id": str(self.id),
            "email": self.email,
            "username": self.username,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
        }


class Profile(db.Model):
    __tablename__ = "profiles"
    id = _uuid_pk()
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    full_name = db.Column(db.String(255), nullable=False, default="")
    email = db.Column(db.String(255))
    username = db.Column(db.String(100))
    phone = db.Column(db.String(50))
    avatar_url = db.Column(db.Text)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    user = db.relationship("User", back_populates="profile")

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "full_name": self.full_name,
            "email": self.email,
            "username": self.username,
            "phone": self.phone,
            "avatar_url": self.avatar_url,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
        }


class UserRole(db.Model):
    __tablename__ = "user_roles"
    id = _uuid_pk()
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = db.Column(app_role_enum, nullable=False)
    __table_args__ = (db.UniqueConstraint("user_id", "role", name="uq_user_role"),)

    user = db.relationship("User", back_populates="roles")


# ──────────────────────────────────────────────
# Core church data
# ──────────────────────────────────────────────

class Member(db.Model):
    __tablename__ = "members"
    id = _uuid_pk()
    full_name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255))
    phone = db.Column(db.String(50))
    gender = db.Column(db.String(20))
    date_of_birth = db.Column(db.Date)
    address = db.Column(db.String(255))
    baptism_status = db.Column(db.String(50))
    department = db.Column(db.String(100))
    join_date = db.Column(db.Date, default=nairobi_today)
    status = db.Column(db.String(20), nullable=False, default="active")
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    def to_dict(self):
        return {
            "id": str(self.id),
            "full_name": self.full_name,
            "email": self.email,
            "phone": self.phone,
            "gender": self.gender,
            "date_of_birth": self.date_of_birth.isoformat() if self.date_of_birth else None,
            "address": self.address,
            "baptism_status": self.baptism_status,
            "department": self.department,
            "join_date": self.join_date.isoformat() if self.join_date else None,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class Giving(db.Model):
    __tablename__ = "givings"
    id = _uuid_pk()
    type = db.Column(db.String(50), nullable=False)  # Tithe, Offering, Baby Center, Other
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    member_name = db.Column(db.String(255))  # Required for Tithe & Other, blank for Offering / Baby Center
    date = db.Column(db.Date, nullable=False, default=nairobi_today)
    notes = db.Column(db.Text)
    recorded_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    def to_dict(self):
        return {
            "id": str(self.id),
            "type": self.type,
            "amount": float(self.amount),
            "member_name": self.member_name,
            "date": self.date.isoformat(),
            "notes": self.notes,
            "recorded_by": str(self.recorded_by) if self.recorded_by else None,
            "created_at": self.created_at.isoformat(),
        }


class Attendance(db.Model):
    __tablename__ = "attendance"
    id = _uuid_pk()
    event_name = db.Column(db.String(255), nullable=False)
    date = db.Column(db.Date, nullable=False, default=nairobi_today)
    # Demographic breakdown columns
    men = db.Column(db.Integer, nullable=False, default=0)
    women = db.Column(db.Integer, nullable=False, default=0)
    youths = db.Column(db.Integer, nullable=False, default=0)
    children = db.Column(db.Integer, nullable=False, default=0)
    visitors = db.Column(db.Integer, nullable=False, default=0)
    # total_present = sum of above (kept for backwards-compat / reporting)
    total_present = db.Column(db.Integer, nullable=False, default=0)
    total_absent = db.Column(db.Integer, nullable=False, default=0)
    notes = db.Column(db.Text)
    recorded_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    def to_dict(self):
        return {
            "id": str(self.id),
            "event_name": self.event_name,
            "service_type": self.event_name,       # alias expected by frontend
            "date": self.date.isoformat(),
            "men": self.men,
            "women": self.women,
            "youths": self.youths,
            "children": self.children,
            "visitors": self.visitors,
            "total_present": self.total_present,
            "total_attendees": self.total_present,  # alias expected by frontend
            "total_absent": self.total_absent,
            "notes": self.notes,
            "recorded_by": str(self.recorded_by) if self.recorded_by else None,
            "created_at": self.created_at.isoformat(),
        }


class Department(db.Model):
    __tablename__ = "departments"
    id = _uuid_pk()
    name = db.Column(db.String(255), nullable=False, unique=True)
    description = db.Column(db.Text)
    leader_name = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    def to_dict(self, member_count: int = 0):
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "leader_name": self.leader_name,
            "member_count": member_count,
            "created_at": self.created_at.isoformat(),
        }


class CouncilMember(db.Model):
    """Church council / leadership roster — separate from regular Members.
    Used for governance bodies (elders, deacons, executive committee, etc.)
    where a person holds a specific title/role rather than a department.

    A council entry can EITHER:
      - link to an existing Member via member_id (name/phone/email stay in
        sync with that Member record — only `role`/`notes`/`is_active` are
        stored locally), OR
      - stand alone with manually entered full_name/phone/email
        (member_id is NULL).
    """
    __tablename__ = "council_members"
    id = _uuid_pk()
    member_id = db.Column(UUID(as_uuid=True), db.ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    full_name = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(150), nullable=False)   # free text, e.g. "Chairman", "Treasurer"
    phone = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(255))
    notes = db.Column(db.Text)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    member = db.relationship("Member", foreign_keys=[member_id])

    def to_dict(self):
        return {
            "id": str(self.id),
            "member_id": str(self.member_id) if self.member_id else None,
            "full_name": self.full_name,
            "role": self.role,
            "phone": self.phone,
            "email": self.email,
            "notes": self.notes,
            "is_active": self.is_active,
            "linked_member": bool(self.member_id),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }



class FellowshipSchedule(db.Model):
    """Weekly Thursday Fellowship planner — venue, speaker, and programmer
    for an upcoming Thursday. Powers the automatic SMS jobs:
      - Thursday evening: thanks members + announces next week's details
        (pulled from the entry whose fellowship_date is exactly 7 days out)
      - Sunday morning: simple welcome message (no FellowshipSchedule lookup needed)
    """
    __tablename__ = "fellowship_schedules"
    id = _uuid_pk()
    fellowship_date = db.Column(db.Date, nullable=False, unique=True, index=True)
    venue = db.Column(db.String(255), nullable=False)
    speaker = db.Column(db.String(255), nullable=False)
    programmer = db.Column(db.Text, nullable=False)
    notes = db.Column(db.Text)  # internal only — never included in the SMS
    created_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    reminder_sent_at = db.Column(db.DateTime)  # set once the Thursday auto-SMS has used this entry
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    def to_dict(self):
        return {
            "id": str(self.id),
            "fellowship_date": self.fellowship_date.isoformat(),
            "venue": self.venue,
            "speaker": self.speaker,
            "programmer": self.programmer,
            "notes": self.notes,
            "reminder_sent_at": self.reminder_sent_at.isoformat() if self.reminder_sent_at else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class Event(db.Model):
    __tablename__ = "events"
    id = _uuid_pk()
    title = db.Column(db.String(255), nullable=False)
    date = db.Column(db.Date, nullable=False)
    time = db.Column(db.String(10))
    location = db.Column(db.String(255))
    category = db.Column(db.String(50), nullable=False, default="Worship")
    description = db.Column(db.Text)
    created_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    def to_dict(self):
        return {
            "id": str(self.id),
            "title": self.title,
            "date": self.date.isoformat(),
            "time": self.time,
            "location": self.location,
            "category": self.category,
            "description": self.description,
            "created_at": self.created_at.isoformat(),
        }

# ──────────────────────────────────────────────
# System / cPanel
# ──────────────────────────────────────────────

class Announcement(db.Model):
    __tablename__ = "announcements"
    id = _uuid_pk()
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(20), nullable=False, default="info")  # info | warning | critical
    audience = db.Column(db.String(50), nullable=False, default="all")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    starts_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)
    ends_at = db.Column(db.DateTime)
    created_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    def to_dict(self):
        return {
            "id": str(self.id),
            "title": self.title,
            "message": self.message,
            "severity": self.severity,
            "audience": self.audience,
            "is_active": self.is_active,
            "starts_at": self.starts_at.isoformat(),
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
            "created_by": str(self.created_by) if self.created_by else None,
            "created_at": self.created_at.isoformat(),
        }


class FeatureFlag(db.Model):
    __tablename__ = "feature_flags"
    key = db.Column(db.String(100), primary_key=True)
    label = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    updated_by = db.Column(UUID(as_uuid=True))
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    def to_dict(self):
        return {
            "key": self.key,
            "label": self.label,
            "description": self.description,
            "enabled": self.enabled,
            "updated_at": self.updated_at.isoformat(),
        }


class Module(db.Model):
    __tablename__ = "modules"
    key = db.Column(db.String(100), primary_key=True)
    label = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    updated_by = db.Column(UUID(as_uuid=True))
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    def to_dict(self):
        return {
            "key": self.key,
            "label": self.label,
            "description": self.description,
            "enabled": self.enabled,
            "sort_order": self.sort_order,
        }


class SystemSetting(db.Model):
    __tablename__ = "system_settings"
    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(JSONB, nullable=False)
    description = db.Column(db.Text)
    updated_by = db.Column(UUID(as_uuid=True))
    updated_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, onupdate=nairobi_now)

    def to_dict(self):
        return {
            "key": self.key,
            "value": self.value,
            "description": self.description,
            "updated_at": self.updated_at.isoformat(),
        }


# ──────────────────────────────────────────────
# Deletion approval — see deletion_approval.py
# ──────────────────────────────────────────────

class PendingDeletion(db.Model):
    """A delete request awaiting admin/super_admin approval. Nothing in the
    app deletes a row directly anymore — every delete route creates one of
    these instead, and the actual row is only removed once an admin calls
    approve() on it (see deletion_approval.py)."""
    __tablename__ = "pending_deletions"
    id = _uuid_pk()
    table_name = db.Column(db.String(100), nullable=False, index=True)
    record_id = db.Column(UUID(as_uuid=True), nullable=False, index=True)
    record_label = db.Column(db.String(255))
    record_snapshot = db.Column(JSONB)
    requested_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    requested_by_email = db.Column(db.String(255))
    reason = db.Column(db.Text)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)  # pending | approved | rejected
    reviewed_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_by_email = db.Column(db.String(255))
    reviewed_at = db.Column(db.DateTime)
    review_note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, index=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "table_name": self.table_name,
            "record_id": str(self.record_id),
            "record_label": self.record_label,
            "record_snapshot": self.record_snapshot,
            "requested_by": str(self.requested_by) if self.requested_by else None,
            "requested_by_email": self.requested_by_email,
            "reason": self.reason,
            "status": self.status,
            "reviewed_by": str(self.reviewed_by) if self.reviewed_by else None,
            "reviewed_by_email": self.reviewed_by_email,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "review_note": self.review_note,
            "created_at": self.created_at.isoformat(),
        }


# ──────────────────────────────────────────────
# Security / audit
# ──────────────────────────────────────────────

class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = _uuid_pk()
    table_name = db.Column(db.String(100), nullable=False, index=True)
    record_id = db.Column(db.String(255))
    action = db.Column(db.String(20), nullable=False)  # INSERT / UPDATE / DELETE
    actor_id = db.Column(UUID(as_uuid=True))
    actor_email = db.Column(db.String(255))
    old_data = db.Column(JSONB)
    new_data = db.Column(JSONB)
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, index=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "table_name": self.table_name,
            "record_id": self.record_id,
            "action": self.action,
            "actor_id": str(self.actor_id) if self.actor_id else None,
            "actor_email": self.actor_email,
            "old_data": self.old_data,
            "new_data": self.new_data,
            "created_at": self.created_at.isoformat(),
        }


class LoginAttempt(db.Model):
    __tablename__ = "login_attempts"
    id = _uuid_pk()
    identifier = db.Column(db.String(255), nullable=False, index=True)
    success = db.Column(db.Boolean, nullable=False, default=False)
    ip_address = db.Column(db.String(64))
    user_agent = db.Column(db.String(500))
    attempted_at = db.Column(db.DateTime, nullable=False, default=nairobi_now, index=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "identifier": self.identifier,
            "success": self.success,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "attempted_at": self.attempted_at.isoformat(),
        }


class AccountLock(db.Model):
    __tablename__ = "account_locks"
    id = _uuid_pk()
    identifier = db.Column(db.String(255), nullable=False, unique=True, index=True)
    locked_until = db.Column(db.DateTime)  # NULL = locked indefinitely
    reason = db.Column(db.Text)
    locked_by = db.Column(UUID(as_uuid=True))
    created_at = db.Column(db.DateTime, nullable=False, default=nairobi_now)

    def to_dict(self):
        return {
            "id": str(self.id),
            "identifier": self.identifier,
            "locked_until": self.locked_until.isoformat() if self.locked_until else None,
            "reason": self.reason,
            "locked_by": str(self.locked_by) if self.locked_by else None,
            "created_at": self.created_at.isoformat(),
        }
    
# ──────────────────────────────────────────────
# SMS Logs
# ──────────────────────────────────────────────
 
class SmsLog(db.Model):
    """Records every outbound SMS attempt — welcome messages, OTP resets, broadcasts."""
    __tablename__ = "sms_logs"
    id = _uuid_pk()
    # Who/what triggered the SMS
    event_type = db.Column(db.String(50), nullable=False, index=True)
    # e.g. "welcome", "otp_reset", "broadcast"
    recipient_phone = db.Column(db.String(50), nullable=False, index=True)
    recipient_name  = db.Column(db.String(255))          # member name / username if known
    message         = db.Column(db.Text, nullable=False)
    provider        = db.Column(db.String(50))           # africastalking | twilio | talksasa | custom
    status          = db.Column(db.String(30), nullable=False, index=True)
    # "sent" | "queued" | "failed" | "no_provider" | "no_phone"
    error_detail    = db.Column(db.Text)                 # populated on failure
    sent_by         = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at      = db.Column(db.DateTime, nullable=False, default=nairobi_now, index=True)
 
    def to_dict(self):
        return {
            "id":             str(self.id),
            "event_type":     self.event_type,
            "recipient_phone": self.recipient_phone,
            "recipient_name": self.recipient_name,
            "message":        self.message,
            "provider":       self.provider,
            "status":         self.status,
            "error_detail":   self.error_detail,
            "sent_by":        str(self.sent_by) if self.sent_by else None,
            "created_at":     self.created_at.isoformat(),
        }