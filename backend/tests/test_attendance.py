from datetime import datetime
from io import BytesIO
from zoneinfo import ZoneInfo

import numpy as np
from cryptography.fernet import Fernet
from werkzeug.security import generate_password_hash

from app import create_app
from app.config import Config
from app.extensions import db
from app.models import Student, User
from test_auth_students import login


class AttendanceTestConfig(Config):
    SECRET_KEY = "test-secret-key-that-is-long-enough-to-pass-check"
    JWT_SECRET_KEY = "different-test-jwt-secret-that-is-long-enough"
    FACE_DATA_ENCRYPTION_KEY = Fernet.generate_key().decode("ascii")
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    TESTING = True


def setup_client():
    app = create_app(AttendanceTestConfig)
    context = app.app_context()
    context.push()
    db.create_all()
    db.session.add(User(email="admin@example.com", password_hash=generate_password_hash("CorrectHorseBattery123!"), role="admin"))
    db.session.commit()
    client = app.test_client()
    headers = login(client)
    course_class = client.post("/api/classes", json={
        "department": "Computer Science",
        "class_name": "BSc CS Year 3",
        "section": "A",
        "subject": "Database Systems",
    }, headers=headers).get_json()["course_class"]
    student = client.post("/api/students", json={
        "full_name": "Asha Patil",
        "roll_number": "CS-001",
        "department": "Computer Science",
        "class_name": "BSc CS Year 3",
        "section": "A",
        "email": "asha@example.com",
    }, headers=headers).get_json()["student"]
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    session = client.post("/api/attendance/sessions", json={
        "course_class_id": course_class["id"],
        "title": "Morning lecture",
        "session_date": today,
    }, headers=headers).get_json()["session"]
    return app, context, client, headers, student, session


def image_upload():
    return BytesIO(b"test-frame"), "frame.jpg", "image/jpeg"


def test_session_and_face_verified_marking_are_duplicate_safe(monkeypatch):
    from app.routes import attendance

    app, context, client, headers, student_data, session_data = setup_client()
    try:
        student = db.session.get(Student, student_data["id"])
        vector = np.zeros(128, dtype=np.float32)
        vector[0] = 1.0
        monkeypatch.setattr(attendance, "extract_embedding", lambda _data: vector)
        monkeypatch.setattr(attendance, "match_registered_embedding", lambda _vector: {"status": "recognized", "student": student, "similarity": 0.94})

        assert client.post(f"/api/attendance/sessions/{session_data['id']}/start", headers=headers).status_code == 200
        first = client.post("/api/attendance/mark", data={"session_id": str(session_data["id"]), "image": image_upload(), "student_id": "999999"}, headers=headers)
        assert first.status_code == 201
        assert first.get_json()["status"] == "marked"

        duplicate = client.post("/api/attendance/mark", data={"session_id": str(session_data["id"]), "image": image_upload()}, headers=headers)
        assert duplicate.status_code == 200
        assert duplicate.get_json()["status"] == "already_marked"
        assert client.get("/api/attendance/records", headers=headers).get_json()["pagination"]["total"] == 1
        assert client.get("/api/attendance/reports", headers=headers).get_json()["summary"]["attendance_percentage"] == 100.0
        stats = client.get("/api/dashboard/stats", headers=headers).get_json()
        assert stats["present_today"] == 1 and stats["absent_today"] == 0
        exported = client.get("/api/attendance/export", headers=headers)
        assert exported.status_code == 200
        assert b"CS-001" in exported.data
        assert client.post(f"/api/attendance/sessions/{session_data['id']}/end", headers=headers).status_code == 200
    finally:
        db.session.remove()
        db.drop_all()
        context.pop()


def test_unknown_face_and_scheduled_session_do_not_mark_attendance(monkeypatch):
    from app.routes import attendance

    _app, context, client, headers, _student, session_data = setup_client()
    try:
        vector = np.zeros(128, dtype=np.float32)
        monkeypatch.setattr(attendance, "extract_embedding", lambda _data: vector)
        monkeypatch.setattr(attendance, "match_registered_embedding", lambda _vector: {"status": "unknown", "message": "No match."})
        inactive = client.post("/api/attendance/mark", data={"session_id": str(session_data["id"]), "image": image_upload()}, headers=headers)
        assert inactive.status_code == 409
        assert inactive.get_json()["error"]["code"] == "session_not_active"

        client.post(f"/api/attendance/sessions/{session_data['id']}/start", headers=headers)
        unknown = client.post("/api/attendance/mark", data={"session_id": str(session_data["id"]), "image": image_upload()}, headers=headers)
        assert unknown.status_code == 200
        assert unknown.get_json()["status"] == "unknown"
        assert client.get("/api/attendance/records", headers=headers).get_json()["pagination"]["total"] == 0
    finally:
        db.session.remove()
        db.drop_all()
        context.pop()
