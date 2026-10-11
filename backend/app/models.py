from datetime import datetime, timezone

from .extensions import db


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(254), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="admin")
    student_id = db.Column(db.Integer, db.ForeignKey("students.id", ondelete="CASCADE"), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    student = db.relationship("Student", back_populates="account", uselist=False)

    __table_args__ = (
        db.CheckConstraint("role IN ('admin', 'teacher', 'student')", name="ck_users_role"),
        db.UniqueConstraint("student_id", name="uq_users_student_id"),
        db.CheckConstraint("(role = 'student' AND student_id IS NOT NULL) OR (role != 'student' AND student_id IS NULL)", name="ck_users_student_link"),
    )


class RevokedToken(db.Model):
    __tablename__ = "revoked_tokens"

    jti = db.Column(db.String(36), primary_key=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)


class CourseClass(db.Model):
    __tablename__ = "course_classes"

    id = db.Column(db.Integer, primary_key=True)
    department = db.Column(db.String(100), nullable=False)
    class_name = db.Column(db.String(100), nullable=False)
    section = db.Column(db.String(30), nullable=False, default="A")
    subject = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    __table_args__ = (
        db.UniqueConstraint("department", "class_name", "section", "subject", name="uq_class_subject"),
    )


class Student(db.Model):
    __tablename__ = "students"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(160), nullable=False)
    roll_number = db.Column(db.String(40), nullable=False, unique=True, index=True)
    department = db.Column(db.String(100), nullable=False)
    class_name = db.Column(db.String(100), nullable=False)
    section = db.Column(db.String(30), nullable=False, default="A", server_default="A")
    email = db.Column(db.String(254), nullable=False, unique=True, index=True)
    phone = db.Column(db.String(30))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    face_templates = db.relationship("FaceTemplate", back_populates="student", cascade="all, delete-orphan")
    attendance_records = db.relationship("AttendanceRecord", back_populates="student")
    account = db.relationship("User", back_populates="student", uselist=False, foreign_keys="User.student_id")


class FaceTemplate(db.Model):
    __tablename__ = "face_templates"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    encrypted_embedding = db.Column(db.LargeBinary, nullable=False)
    encryption_key_version = db.Column(db.String(40), nullable=False)
    model_name = db.Column(db.String(80), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    student = db.relationship("Student", back_populates="face_templates")


class AttendanceSession(db.Model):
    __tablename__ = "attendance_sessions"

    id = db.Column(db.Integer, primary_key=True)
    course_class_id = db.Column(db.Integer, db.ForeignKey("course_classes.id", ondelete="RESTRICT"), nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    session_date = db.Column(db.Date, nullable=False, index=True)
    title = db.Column(db.String(160), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="scheduled")
    started_at = db.Column(db.DateTime(timezone=True))
    ended_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    course_class = db.relationship("CourseClass")
    created_by = db.relationship("User")
    records = db.relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (db.CheckConstraint("status IN ('scheduled', 'active', 'ended')", name="ck_sessions_status"),)


class AttendanceRecord(db.Model):
    __tablename__ = "attendance_records"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id", ondelete="RESTRICT"), nullable=False)
    marked_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    match_score = db.Column(db.Float, nullable=False)
    capture_id = db.Column(db.String(64), nullable=False)

    session = db.relationship("AttendanceSession", back_populates="records")
    student = db.relationship("Student", back_populates="attendance_records")

    __table_args__ = (
        db.UniqueConstraint("session_id", "student_id", name="uq_attendance_session_student"),
        db.CheckConstraint("match_score >= 0 AND match_score <= 1", name="ck_attendance_match_score"),
    )


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    action = db.Column(db.String(100), nullable=False)
    resource_type = db.Column(db.String(80), nullable=False)
    resource_id = db.Column(db.String(80))
    details = db.Column(db.JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now, index=True)

    actor = db.relationship("User")
