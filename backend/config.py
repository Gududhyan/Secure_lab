import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / "instance"


def _configured_path(name: str, default: Path) -> str:
    value = Path(os.getenv(name, str(default)))
    return str(value if value.is_absolute() else (BASE_DIR / value).resolve())


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "development-only-change-me")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "development-jwt-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=int(os.getenv("ACCESS_TOKEN_MINUTES", "30")))
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", f"sqlite:///{INSTANCE_DIR / 'securelab.db'}")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH_MB", "12")) * 1024 * 1024
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:5173")
    REPORT_STORAGE_DIR = _configured_path("REPORT_STORAGE_DIR", INSTANCE_DIR / "encrypted_reports")
    HOSPITAL_SIGNING_KEY_DIR = _configured_path("HOSPITAL_SIGNING_KEY_DIR", INSTANCE_DIR / "signing_keys")
