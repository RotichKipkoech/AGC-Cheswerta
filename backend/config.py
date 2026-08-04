import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    # SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    SECRET_KEY = os.environ["SECRET_KEY"]
    DEBUG = os.environ.get("FLASK_DEBUG", "True") == "True"

    # SQLALCHEMY_DATABASE_URI = os.environ.get(
    #     "DATABASE_URL",
    #     "postgresql://postgres:Kenrotich89@localhost:5432/agc_cheswerta",
    # )
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
}

    # JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "ASIAWF3QWACOMHBYB5XR")
    JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        hours=int(os.environ.get("JWT_HOURS", "12"))
    )


    CORS_ORIGINS = os.environ.get(
        "CORS_ORIGINS", "https://cheswertaagc.netlify.app"
    ).split(",")

    

    # UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "uploads"))
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10 MB

    # Account lockout
    LOGIN_MAX_ATTEMPTS = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "3"))
    LOGIN_WINDOW_MINUTES = int(os.environ.get("LOGIN_WINDOW_MINUTES", "5"))

    # First-run bootstrap accounts — created automatically on a fresh database
    # if they don't already exist (see app.py's _ensure_default_admin_accounts).
    # Override these via environment variables before your first deploy; the
    # fallback values below are for local/dev convenience only and must never
    # be relied on in production.
    SUPERADMIN_USERNAME  = os.environ.get("SUPERADMIN_USERNAME", "superadmin")
    SUPERADMIN_PASSWORD  = os.environ.get("SUPERADMIN_PASSWORD", "ChangeMe123!")
    SUPERADMIN_FULL_NAME = os.environ.get("SUPERADMIN_FULL_NAME", "Super Administrator")

    ADMIN_USERNAME  = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD  = os.environ.get("ADMIN_PASSWORD", "ChangeMe123!")
    ADMIN_FULL_NAME = os.environ.get("ADMIN_FULL_NAME", "Administrator")