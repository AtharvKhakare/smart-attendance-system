import os
import re
from datetime import timedelta
from pathlib import Path

from sqlalchemy.engine import make_url
from dotenv import dotenv_values, load_dotenv

# Resolve the backend environment file relative to this source file so Flask
# behaves the same regardless of the shell's current working directory.
BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BACKEND_DIR / ".env"
_process_face_key = os.getenv("FACE_DATA_ENCRYPTION_KEY", "")
load_dotenv(dotenv_path=ENV_FILE, override=False)
_dotenv_face_key = dotenv_values(dotenv_path=ENV_FILE).get("FACE_DATA_ENCRYPTION_KEY", "") or ""
FACE_DATA_ENCRYPTION_KEY = _process_face_key if _process_face_key.strip() else _dotenv_face_key
FACE_DATA_ENCRYPTION_KEY_SOURCE = (
    "process environment" if _process_face_key.strip()
    else str(ENV_FILE) if _dotenv_face_key.strip()
    else "unset"
)


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "")
    # Render and some local installers provide a generic PostgreSQL URL scheme.
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    DATABASE_SCHEMA = os.getenv("DATABASE_SCHEMA", "public")
    DATABASE_SCHEMA_EXPLICIT = os.getenv("DATABASE_SCHEMA") is not None
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTES", "30")))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "7")))
    JWT_TOKEN_LOCATION = ["headers"]
    MAX_CONTENT_LENGTH = 25 * 1024 * 1024
    FACE_MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.363"))
    FACE_AMBIGUITY_MARGIN = float(os.getenv("FACE_AMBIGUITY_MARGIN", "0.05"))
    APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Asia/Kolkata")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173")
    FACE_DATA_ENCRYPTION_KEY = FACE_DATA_ENCRYPTION_KEY
    FACE_DATA_ENCRYPTION_KEY_SOURCE = FACE_DATA_ENCRYPTION_KEY_SOURCE
    FACE_DATA_KEY_VERSION = os.getenv("FACE_DATA_KEY_VERSION", "v1")
    MODEL_DIR = Path(os.getenv("FACE_MODEL_DIR", Path(__file__).resolve().parents[1] / "models"))
    FACE_DETECTOR_MODEL = MODEL_DIR / "face_detection_yunet_2023mar.onnx"
    FACE_RECOGNIZER_MODEL = MODEL_DIR / "face_recognition_sface_2021dec.onnx"

    @classmethod
    def validate(cls) -> None:
        if not cls.SECRET_KEY or len(cls.SECRET_KEY) < 32:
            raise RuntimeError("SECRET_KEY must be set to a random value of at least 32 characters")
        if not cls.JWT_SECRET_KEY or len(cls.JWT_SECRET_KEY) < 32:
            raise RuntimeError("JWT_SECRET_KEY must be set to a different random value of at least 32 characters")
        if not cls.SQLALCHEMY_DATABASE_URI:
            raise RuntimeError("DATABASE_URL must be set before starting the API")
        if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", cls.DATABASE_SCHEMA):
            raise RuntimeError("DATABASE_SCHEMA must be a lowercase PostgreSQL identifier of at most 63 characters")
        database_url = make_url(cls.SQLALCHEMY_DATABASE_URI)
        if (
            database_url.get_backend_name() == "postgresql"
            and database_url.host not in {None, "localhost", "127.0.0.1", "::1"}
            and not cls.DATABASE_SCHEMA_EXPLICIT
        ):
            raise RuntimeError("Set DATABASE_SCHEMA explicitly before connecting to a remote PostgreSQL database")
        if not 0.0 < cls.FACE_MATCH_THRESHOLD < 1.0:
            raise RuntimeError("FACE_MATCH_THRESHOLD must be greater than 0 and less than 1")
        if not 0.0 <= cls.FACE_AMBIGUITY_MARGIN < 1.0:
            raise RuntimeError("FACE_AMBIGUITY_MARGIN must be between 0 and 1")
