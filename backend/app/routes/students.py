from datetime import datetime, timezone

from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, g, jsonify, request
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash

from ..extensions import db
from ..models import AuditLog, FaceTemplate, Student, User
from ..security import role_required


students_bp = Blueprint("students", __name__)
_REQUIRED_FIELDS = ("full_name", "roll_number", "department", "class_name", "email")
_ALLOWED_FIELDS = set(_REQUIRED_FIELDS) | {"phone", "section"}


def error(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def normalize_student_payload(payload, creating):
    if not isinstance(payload, dict):
        return None, "A JSON object is required."
    unknown = set(payload) - _ALLOWED_FIELDS
    if unknown:
        return None, "Unknown fields: " + ", ".join(sorted(unknown))
    values = {}
    for field in _REQUIRED_FIELDS:
        if creating and field not in payload:
            return None, f"{field} is required."
        if field in payload:
            value = payload[field]
            if not isinstance(value, str) or not value.strip():
                return None, f"{field} must be a non-empty string."
            value = value.strip()
            if field == "full_name" and len(value) > 160:
                return None, "full_name must be 160 characters or fewer."
            if field == "roll_number" and len(value) > 40:
                return None, "roll_number must be 40 characters or fewer."
            if field == "class_name" and len(value) > 100:
                return None, "class_name must be 100 characters or fewer."
            if field == "department" and len(value) > 100:
                return None, "department must be 100 characters or fewer."
            if field == "email":
                try:
                    value = validate_email(value, check_deliverability=False).normalized.lower()
                except EmailNotValidError:
                    return None, "email must be a valid email address."
                if len(value) > 254:
                    return None, "email must be 254 characters or fewer."
            values[field] = value
    if "phone" in payload:
        phone = payload["phone"]
        if phone is not None and (not isinstance(phone, str) or len(phone.strip()) > 30):
            return None, "phone must be a string of 30 characters or fewer."
        values["phone"] = phone.strip() if isinstance(phone, str) and phone.strip() else None
    if "section" in payload:
        section = payload["section"]
        if not isinstance(section, str) or not section.strip() or len(section.strip()) > 30:
            return None, "section must be a non-empty string of 30 characters or fewer."
        values["section"] = section.strip()
    return values, None


def student_json(student):
    return {
        "id": student.id,
        "full_name": student.full_name,
        "roll_number": student.roll_number,
        "department": student.department,
        "class_name": student.class_name,
        "section": student.section,
        "email": student.email,
        "phone": student.phone,
        "is_active": student.is_active,
        "portal_enabled": bool(student.account and student.account.is_active),
        "face_registered": bool(student.face_templates),
        "created_at": student.created_at.isoformat(),
        "updated_at": student.updated_at.isoformat(),
    }


def audit(action, student, details=None):
    db.session.add(AuditLog(
        actor_id=g.current_user.id,
        action=action,
        resource_type="student",
        resource_id=str(student.id),
        details=details or {},
    ))


@students_bp.get("")
@role_required("admin")
def list_students():
    query = Student.query.filter_by(is_active=True)
    search = request.args.get("q", "", type=str).strip()
    department = request.args.get("department", "", type=str).strip()
    class_name = request.args.get("class_name", "", type=str).strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(Student.full_name.ilike(pattern), Student.roll_number.ilike(pattern), Student.email.ilike(pattern)))
    if department:
        query = query.filter(Student.department == department)
    if class_name:
        query = query.filter(Student.class_name == class_name)
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, max(1, request.args.get("per_page", 20, type=int)))
    results = query.order_by(Student.full_name.asc()).paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        "items": [student_json(student) for student in results.items],
        "pagination": {"page": results.page, "per_page": results.per_page, "total": results.total, "pages": results.pages},
    }), 200


@students_bp.post("")
@role_required("admin")
def create_student():
    values, problem = normalize_student_payload(request.get_json(silent=True), creating=True)
    if problem:
        return error("validation_error", problem, 400)
    student = Student(**values)
    db.session.add(student)
    try:
        db.session.flush()
        audit("student.created", student, {"roll_number": student.roll_number})
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("duplicate_student", "A student with this roll number or email already exists.", 409)
    return jsonify({"student": student_json(student)}), 201


@students_bp.get("/<int:student_id>")
@role_required("admin")
def get_student(student_id):
    student = Student.query.filter_by(id=student_id, is_active=True).first()
    if student is None:
        return error("not_found", "Student not found.", 404)
    return jsonify({"student": student_json(student)}), 200


@students_bp.put("/<int:student_id>")
@role_required("admin")
def update_student(student_id):
    student = Student.query.filter_by(id=student_id, is_active=True).first()
    if student is None:
        return error("not_found", "Student not found.", 404)
    values, problem = normalize_student_payload(request.get_json(silent=True), creating=False)
    if problem:
        return error("validation_error", problem, 400)
    if not values:
        return error("validation_error", "At least one editable field is required.", 400)
    for key, value in values.items():
        setattr(student, key, value)
    if "email" in values and student.account:
        student.account.email = student.email
    try:
        audit("student.updated", student, {"changed_fields": sorted(values)})
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("duplicate_student", "A student with this roll number or email already exists.", 409)
    return jsonify({"student": student_json(student)}), 200


@students_bp.post("/<int:student_id>/account")
@role_required("admin")
def set_student_account_password(student_id):
    student = Student.query.filter_by(id=student_id, is_active=True).first()
    if student is None:
        return error("not_found", "Student not found.", 404)
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error("invalid_request", "A JSON object is required.", 400)
    password = payload.get("password")
    if not isinstance(password, str) or len(password) < 12 or len(password) > 128:
        return error("validation_error", "password must be between 12 and 128 characters.", 400)

    account = student.account
    if account is None:
        account = User(email=student.email, role="student", student=student)
        db.session.add(account)
    account.email = student.email
    account.password_hash = generate_password_hash(password)
    account.is_active = True
    audit("student.account_password_reset", student, {"portal_enabled": True})
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("account_email_conflict", "This email is already used by another login account.", 409)
    return jsonify({"message": "Student portal account is ready.", "portal_enabled": True}), 200


@students_bp.delete("/<int:student_id>")
@role_required("admin")
def delete_student(student_id):
    student = Student.query.filter_by(id=student_id, is_active=True).first()
    if student is None:
        return error("not_found", "Student not found.", 404)
    # Keep attendance history, but remove biometric templates and hide the record from active rosters.
    db.session.query(FaceTemplate).filter_by(student_id=student.id).delete(synchronize_session=False)
    student.is_active = False
    if student.account:
        student.account.is_active = False
    audit("student.deactivated", student, {"roll_number": student.roll_number, "biometric_templates_deleted": True})
    db.session.commit()
    return jsonify({"message": "Student deactivated and biometric data removed."}), 200
