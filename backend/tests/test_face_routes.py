from io import BytesIO

import numpy as np
import pytest
from cryptography.fernet import Fernet

from app.config import Config
from app.extensions import db
from app.models import FaceTemplate, Student
from app.services.face_recognition import decrypt_embedding, encrypt_embedding
from app.services.face_recognition import FaceInputError, extract_embedding
from test_auth_students import login, student_payload


class FaceConfig(Config):
    SECRET_KEY = "test-secret-key-that-is-long-enough-to-pass-check"
    JWT_SECRET_KEY = "different-test-jwt-secret-that-is-long-enough"
    FACE_DATA_ENCRYPTION_KEY = Fernet.generate_key().decode("ascii")
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    TESTING = True


def make_client():
    from app import create_app

    app = create_app(FaceConfig)
    context = app.app_context()
    context.push()
    db.create_all()
    from werkzeug.security import generate_password_hash
    from app.models import User

    db.session.add(User(email="admin@example.com", password_hash=generate_password_hash("CorrectHorseBattery123!"), role="admin"))
    db.session.commit()
    return app, context, app.test_client()


def test_face_registration_encrypts_templates_and_rejects_mismatch(monkeypatch):
    from app.routes import face

    app, context, client = make_client()
    try:
        headers = login(client)
        created = client.post("/api/students", json=student_payload(), headers=headers)
        student_id = created.get_json()["student"]["id"]
        vector = np.zeros(128, dtype=np.float32)
        vector[0] = 1.0
        monkeypatch.setattr(face, "extract_embedding", lambda _data: vector)
        files = [(BytesIO(b"frame"), f"capture-{index}.jpg", "image/jpeg") for index in range(3)]
        response = client.post("/api/face/register/" + str(student_id), data={"images": files}, headers=headers)
        assert response.status_code == 201
        templates = FaceTemplate.query.filter_by(student_id=student_id).all()
        assert len(templates) == 3
        assert templates[0].encrypted_embedding != vector.tobytes()
        assert np.allclose(decrypt_embedding(templates[0].encrypted_embedding), vector)

        response = client.delete(f"/api/face/{student_id}", headers=headers)
        assert response.status_code == 200
        assert FaceTemplate.query.filter_by(student_id=student_id).count() == 0
    finally:
        db.session.remove()
        db.drop_all()
        context.pop()
        app = None


def test_face_recognition_returns_unknown_and_rejects_close_matches(monkeypatch):
    from app import create_app
    from app.routes import face
    from app.models import User
    from werkzeug.security import generate_password_hash

    app = create_app(FaceConfig)
    context = app.app_context()
    context.push()
    db.create_all()
    db.session.add(User(email="admin@example.com", password_hash=generate_password_hash("CorrectHorseBattery123!"), role="admin"))
    first = Student(full_name="Asha Patil", roll_number="CS-001", department="CS", class_name="Year 3", email="asha@example.com")
    second = Student(full_name="Ravi Shah", roll_number="CS-002", department="CS", class_name="Year 3", email="ravi@example.com")
    db.session.add_all([first, second])
    db.session.flush()
    vector = np.zeros(128, dtype=np.float32)
    vector[0] = 1.0
    for student in (first, second):
        db.session.add(FaceTemplate(student_id=student.id, encrypted_embedding=encrypt_embedding(vector), encryption_key_version="test", model_name="SFace"))
    db.session.commit()
    client = app.test_client()
    headers = login(client)
    monkeypatch.setattr(face, "extract_embedding", lambda _data: vector)
    image = (BytesIO(b"frame"), "frame.jpg", "image/jpeg")
    response = client.post("/api/face/recognize", data={"image": image}, headers=headers)
    assert response.status_code == 200
    assert response.get_json()["status"] == "ambiguous"

    db.session.query(FaceTemplate).delete()
    db.session.add(FaceTemplate(student_id=first.id, encrypted_embedding=encrypt_embedding(vector), encryption_key_version="test", model_name="SFace"))
    db.session.commit()
    orthogonal = np.zeros(128, dtype=np.float32)
    orthogonal[1] = 1.0
    monkeypatch.setattr(face, "extract_embedding", lambda _data: orthogonal)
    image = (BytesIO(b"frame"), "frame.jpg", "image/jpeg")
    response = client.post("/api/face/recognize", data={"image": image}, headers=headers)
    assert response.status_code == 200
    assert response.get_json()["status"] == "unknown"
    db.session.remove()
    db.drop_all()
    context.pop()


def test_real_models_reject_a_blank_image():
    import cv2

    blank = np.zeros((240, 320, 3), dtype=np.uint8)
    encoded = cv2.imencode(".jpg", blank)[1].tobytes()
    app, context, _client = make_client()
    try:
        with pytest.raises(FaceInputError) as issue:
            extract_embedding(encoded)
        assert issue.value.code == "no_face"
    finally:
        db.session.remove()
        db.drop_all()
        context.pop()
