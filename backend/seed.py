from app import create_app
from extensions import db
from models import User, Profile, UserRole, Module, FeatureFlag

SYNTHETIC_DOMAIN = "agc.local"

TEST_ACCOUNTS = [
    # (username, full_name, role, password)
    ("superadmin", "Super Administrator", "super_admin", "SuperAdmin@2026"),
    ("admin", "Administrator", "admin", "Admin@2026"),
    ("pastor", "Pastor User", "pastor", "Pastor@2026"),
    ("secretary", "Secretary User", "secretary", "Secretary@2026"),
    ("treasurer", "Treasurer User", "treasurer", "Treasurer@2026"),
    ("leader", "Ministry Leader", "ministry_leader", "Leader@2026"),
]

DEFAULT_MODULES = [
    ("dashboard", "Dashboard", 0),
    ("members", "Members", 10),
    ("attendance", "Attendance", 20),
    ("finance", "Finance", 30),
    ("events", "Events", 40),
    ("ministries", "Ministries", 50),
    ("reports", "Reports", 60),
]

DEFAULT_FLAGS = [
    ("notifications", "Notifications"),
    ("dark_mode", "Dark Mode"),
    ("realtime", "Realtime Updates"),
]


def seed():
    app = create_app()
    with app.app_context():
        for username, full_name, role, password in TEST_ACCOUNTS:
            if User.query.filter_by(username=username).first():
                continue
            email = f"{username}@{SYNTHETIC_DOMAIN}"
            u = User(username=username, email=email)
            u.set_password(password)
            db.session.add(u)
            db.session.flush()
            db.session.add(Profile(user_id=u.id, full_name=full_name, email=email, username=username))
            db.session.add(UserRole(user_id=u.id, role=role))
            print(f"  created {username} ({role})")

        for key, label, order in DEFAULT_MODULES:
            if not Module.query.get(key):
                db.session.add(Module(key=key, label=label, sort_order=order))

        for key, label in DEFAULT_FLAGS:
            if not FeatureFlag.query.get(key):
                db.session.add(FeatureFlag(key=key, label=label))

        db.session.commit()
        print("Seed complete.")


if __name__ == "__main__":
    seed()
