from flask import Blueprint, g, jsonify, request
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import AuditLog, CourseClass
from ..security import role_required


classes_bp = Blueprint("classes", __name__)


def error(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def class_json(course_class):
    return {
        "id": course_class.id,
        "department": course_class.department,
        "class_name": course_class.class_name,
        "section": course_class.section,
        "subject": course_class.subject,
        "created_at": course_class.created_at.isoformat(),
    }


@classes_bp.get("")
@role_required("admin")
def list_classes():
    query = CourseClass.query
    department = request.args.get("department", "", type=str).strip()
    if department:
        query = query.filter(CourseClass.department == department)
    return jsonify({"items": [class_json(row) for row in query.order_by(CourseClass.department, CourseClass.class_name, CourseClass.section, CourseClass.subject).all()]}), 200


@classes_bp.post("")
@role_required("admin")
def create_class():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error("invalid_request", "A JSON object is required.", 400)
    allowed = {"department", "class_name", "section", "subject"}
    if set(payload) - allowed:
        return error("validation_error", "Only department, class_name, section, and subject are accepted.", 400)
    values = {}
    limits = {"department": 100, "class_name": 100, "subject": 120}
    for field, limit in limits.items():
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
            return error("validation_error", f"{field} must be a non-empty string of {limit} characters or fewer.", 400)
        values[field] = value.strip()
    section = payload.get("section", "A")
    if not isinstance(section, str) or not section.strip() or len(section.strip()) > 30:
        return error("validation_error", "section must be a non-empty string of 30 characters or fewer.", 400)
    values["section"] = section.strip()
    course_class = CourseClass(**values)
    db.session.add(course_class)
    try:
        db.session.flush()
        db.session.add(AuditLog(actor_id=g.current_user.id, action="class.created", resource_type="course_class", resource_id=str(course_class.id), details={"class_name": course_class.class_name, "section": course_class.section, "subject": course_class.subject}))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("duplicate_class", "This class, section, and subject already exists.", 409)
    return jsonify({"course_class": class_json(course_class)}), 201
