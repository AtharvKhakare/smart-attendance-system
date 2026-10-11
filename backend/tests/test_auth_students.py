import pytest
from werkzeug.security import generate_password_hash

from app import create_app
from app.extensions import db
from app.models import AttendanceRecord, AttendanceSession, CourseClass, Student, User
from app.config import Config


class TestConfig(Config):
    SECRET_KEY = "test-secret-key-that-is-long-enough-to-pass-check"
    JWT_SECRET_KEY = "different-test-jwt-secret-that-is-long-enough"
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    TESTING = True


@pytest.fixture()
def app():
    application = create_app(TestConfig)
    with application.app_context():
        db.create_all()
        db.session.add_all([
            User(email="admin@example.com", password_hash=generate_password_hash("CorrectHorseBattery123!"), role="admin"),
            User(email="teacher@example.com", password_hash=generate_password_hash("CorrectHorseBattery123!"), role="teacher"),
        ])
        db.session.commit()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, email="admin@example.com"):
    response = client.post("/api/auth/login", json={"email": email, "password": "CorrectHorseBattery123!"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.get_json()['access_token']}"}


def student_payload():
    return {
        "full_name": "Asha Patil",
        "roll_number": "CS-001",
        "department": "Computer Science",
        "class_name": "BSc CS Year 3",
        "email": "asha@example.com",
        "phone": "9876543210",
    }


def test_login_me_and_revoked_logout(client):
    headers = login(client)
    assert client.get("/api/auth/me", headers=headers).get_json()["user"]["role"] == "admin"
    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_login_rejects_wrong_password(client):
    response = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "wrong"})
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "invalid_credentials"


def test_student_crud_duplicate_and_role_permissions(client):
    admin_headers = login(client)
    teacher_headers = login(client, "teacher@example.com")

    assert client.get("/api/students", headers=teacher_headers).status_code == 403
    created = client.post("/api/students", json=student_payload(), headers=admin_headers)
    assert created.status_code == 201
    student_id = created.get_json()["student"]["id"]

    duplicate = client.post("/api/students", json=student_payload(), headers=admin_headers)
    assert duplicate.status_code == 409

    listing = client.get("/api/students?q=asha", headers=admin_headers)
    assert listing.status_code == 200
    assert listing.get_json()["pagination"]["total"] == 1

    updated = client.put(f"/api/students/{student_id}", json={"phone": "1234567890"}, headers=admin_headers)
    assert updated.status_code == 200
    assert updated.get_json()["student"]["phone"] == "1234567890"

    deleted = client.delete(f"/api/students/{student_id}", headers=admin_headers)
    assert deleted.status_code == 200
    assert client.get(f"/api/students/{student_id}", headers=admin_headers).status_code == 404


def test_student_portal_account_is_linked_and_only_sees_own_attendance(client, app):
    admin_headers = login(client)
    created = client.post("/api/students", json=student_payload(), headers=admin_headers)
    student_id = created.get_json()["student"]["id"]
    account = client.post(
        f"/api/students/{student_id}/account",
        json={"password": "InitialStudentPassword123!"},
        headers=admin_headers,
    )
    assert account.status_code == 200
    assert account.get_json()["portal_enabled"] is True

    with app.app_context():
        student = db.session.get(Student, student_id)
        admin = User.query.filter_by(email="admin@example.com").one()
        course_class = CourseClass(
            department=student.department,
            class_name=student.class_name,
            section=student.section,
            subject="Software Engineering",
        )
        db.session.add(course_class)
        db.session.flush()
        session = AttendanceSession(
            course_class_id=course_class.id,
            created_by_id=admin.id,
            session_date=__import__("datetime").date.today(),
            title="Morning lecture",
            status="ended",
        )
        db.session.add(session)
        db.session.flush()
        db.session.add(AttendanceRecord(
            session_id=session.id,
            student_id=student.id,
            match_score=0.8,
            capture_id="student-portal-test-capture",
        ))
        db.session.commit()

    response = client.post("/api/auth/login", json={
        "email": "asha@example.com",
        "password": "InitialStudentPassword123!",
    })
    assert response.status_code == 200
    assert response.get_json()["user"]["role"] == "student"
    student_headers = {"Authorization": f"Bearer {response.get_json()['access_token']}"}
    portal = client.get("/api/student/attendance", headers=student_headers)
    assert portal.status_code == 200
    assert portal.get_json()["student"]["roll_number"] == "CS-001"
    assert portal.get_json()["summary"] == {
        "classes_held": 1,
        "present": 1,
        "absent": 0,
        "attendance_percentage": 100.0,
    }
    assert portal.get_json()["items"][0]["status"] == "present"
    assert client.get("/api/students", headers=student_headers).status_code == 403
    assert client.get("/api/student/attendance", headers=admin_headers).status_code == 403

    changed = client.put("/api/student/password", json={
        "current_password": "InitialStudentPassword123!",
        "new_password": "UpdatedStudentPassword456!",
    }, headers=student_headers)
    assert changed.status_code == 200
    assert client.post("/api/auth/login", json={
        "email": "asha@example.com",
        "password": "UpdatedStudentPassword456!",
    }).status_code == 200


def test_deactivating_student_disables_portal_account(client):
    admin_headers = login(client)
    created = client.post("/api/students", json=student_payload(), headers=admin_headers)
    student_id = created.get_json()["student"]["id"]
    client.post(
        f"/api/students/{student_id}/account",
        json={"password": "InitialStudentPassword123!"},
        headers=admin_headers,
    )
    assert client.delete(f"/api/students/{student_id}", headers=admin_headers).status_code == 200
    assert client.post("/api/auth/login", json={
        "email": "asha@example.com",
        "password": "InitialStudentPassword123!",
    }).status_code == 401
