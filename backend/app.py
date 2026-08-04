import os
from flask import Flask, jsonify
from flask_cors import CORS
from config import Config
from extensions import db, migrate, jwt, bcrypt
from scheduler import init_scheduler
from api_docs_route import register_docs_route


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # os.makedirs(app.config["UPLOAD_DIR"], exist_ok=True)

    CORS(app, origins=app.config["CORS_ORIGINS"], supports_credentials=True)
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    bcrypt.init_app(app)

    # Import models so Alembic sees them
    import models  # noqa: F401

    # Blueprints
    from routes.auth import bp as auth_bp
    from routes.users import bp as users_bp
    from routes.members import bp as members_bp
    from routes.givings import bp as givings_bp
    from routes.attendance import bp as attendance_bp
    from routes.departments import bp as departments_bp
    from routes.announcements import bp as announcements_bp
    from routes.modules import bp as modules_bp
    from routes.feature_flags import bp as feature_flags_bp
    from routes.settings import bp as settings_bp
    from routes.audit import bp as audit_bp
    from routes.account_locks import bp as account_locks_bp
    from routes.login_attempts import bp as login_attempts_bp
    from routes.uploads import bp as uploads_bp
    from routes.db import bp as db_bp
    from routes.rpc import bp as rpc_bp
    from routes.functions import bp as functions_bp
    from routes.stats import bp as stats_bp
    from routes.cpanel import bp as cpanel_bp
    from broadcast import bp as broadcast_bp
    from routes.sms_logs import bp as sms_logs_bp
    from routes.council_members import bp as council_members_bp
    from routes.fellowship import bp as fellowship_bp
    from routes.church_info import bp as church_info_bp
    from permissions import bp as permissions_bp
    from deletion_approval import bp as deletion_approval_bp

    for bp in (auth_bp, users_bp, members_bp, givings_bp, attendance_bp,
               departments_bp, announcements_bp, modules_bp, feature_flags_bp,
               settings_bp, audit_bp, account_locks_bp, login_attempts_bp, uploads_bp,
               db_bp, rpc_bp, functions_bp, stats_bp, cpanel_bp, broadcast_bp,
               sms_logs_bp, council_members_bp, fellowship_bp, church_info_bp, permissions_bp,
               deletion_approval_bp):
        app.register_blueprint(bp)

    # Auto-seed missing system_settings rows so integrations/branding work on fresh DBs
    @app.before_request
    def _ensure_default_settings():
        _ensure_default_settings._done = getattr(_ensure_default_settings, '_done', False)
        if _ensure_default_settings._done:
            return
        _ensure_default_settings._done = True
        try:
            from models import SystemSetting
            defaults = [
                ("app_branding", {"name": "Africa Gospel Church Kenya", "short_name": "AGC", "sidebar_tagline": "Church Management", "login_tagline": "Church Management System", "logo_url": None, "login_logo_url": None, "favicon_url": None, "report_stamp_url": None}),
                ("app_theme", {"primary_hue": 0, "primary_saturation": 84, "primary_lightness": 50, "accent_hue": 270, "accent_saturation": 50, "accent_lightness": 50}),
                ("security_policy", {"session_timeout_minutes": 60, "min_password_length": 8, "strong_password_required": True, "two_factor_required": False, "max_login_attempts": 5, "global_revocation": 0}),
                ("localization", {"currency": "KES", "currency_symbol": "KSh", "timezone": "Africa/Nairobi", "date_format": "DD/MM/YYYY", "language": "en", "week_start": "sunday"}),
                ("integrations", {"sms": {"provider": "none", "sender_id": "", "username": "", "api_key_masked": ""}, "email": {"provider": "none", "from_name": "", "from_email": "", "api_key_masked": ""}, "mpesa": {"shortcode": "", "environment": "sandbox", "passkey_masked": ""}}),
                ("maintenance_mode", {"enabled": False, "message": "The system is undergoing scheduled maintenance."}),
                ("audit_retention_days", 90),
            ]
            for key, value in defaults:
                if not SystemSetting.query.get(key):
                    db.session.add(SystemSetting(key=key, value=value))
            db.session.commit()
        except Exception:
            db.session.rollback()


    @app.before_request
    def _ensure_default_admin_accounts():
        _ensure_default_admin_accounts._done = getattr(_ensure_default_admin_accounts, '_done', False)
        if _ensure_default_admin_accounts._done:
            return
        _ensure_default_admin_accounts._done = True
        try:
            from models import User, Profile, UserRole
            from routes.users import SYNTHETIC_DOMAIN

            bootstrap_accounts = [
                (app.config["SUPERADMIN_USERNAME"], app.config["SUPERADMIN_PASSWORD"],
                 app.config["SUPERADMIN_FULL_NAME"], "super_admin"),
                (app.config["ADMIN_USERNAME"], app.config["ADMIN_PASSWORD"],
                 app.config["ADMIN_FULL_NAME"], "admin"),
            ]

            for username, password, full_name, role in bootstrap_accounts:
                username = (username or "").strip().lower()
                if not username or not password:
                    continue
                if User.query.filter_by(username=username).first():
                    continue

                email = f"{username}@{SYNTHETIC_DOMAIN}"
                user = User(username=username, email=email)
                user.set_password(password)
                db.session.add(user)
                db.session.flush()

                db.session.add(Profile(user_id=user.id, full_name=full_name,
                                        email=email, username=username))
                db.session.add(UserRole(user_id=user.id, role=role))

                app.logger.warning(
                    "Seeded default %s account '%s' on first run — sign in and change "
                    "this password immediately (override SUPERADMIN_*/ADMIN_* env vars "
                    "to set your own credentials instead).", role, username,
                )

            db.session.commit()
        except Exception:
            db.session.rollback()
            app.logger.exception("Failed to seed default admin accounts")

    @app.route("/")
    def health():
        return {"status": "ok", "message": "AGC Cheswerta CMS", "version": "1.0.0"}, 200

    # @app.route("/uploads/<path:filename>")
    # def serve_upload(filename):
    #     return send_from_directory(app.config["UPLOAD_DIR"], filename)

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        app.logger.exception(e)

        if app.debug:
            return jsonify({
                "error": "Internal server error",
                "detail": str(e)
            }), 500

        return jsonify({
            "error": "Internal server error"
        }), 500

    # ── Scheduler: only start in the main worker, not the reloader watchdog ──
    if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        init_scheduler(app)

    register_docs_route(app)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)