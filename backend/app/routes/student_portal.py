from datetime import date

from flask import Blueprint, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from ..models import AttendanceRecord, AttendanceSession, AuditLog, CourseClass
from ..security import role_required


student_portal_bp = Blueprint("student_portal", __name__)


def error(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def linked_student():
    student = g.current_user.student
    if student is None or not student.is_active:
        return None
    return student


@student_portal_bp.get("/attendance")
@role_required("student")
def attendance():
    student = linked_student()
    if student is None:
        return error("student_profile_unavailable", "The linked student profile is unavailable.", 403)

    query = (
        AttendanceSession.query
        .join(CourseClass, AttendanceSession.course_class_id == CourseClass.id)
        .filter(
            CourseClass.department == student.department,
            CourseClass.class_name == student.class_name,
            CourseClass.section == student.section,
            AttendanceSession.status.in_(("active", "ended")),
        )
    )
    from_date = request.args.get("from_date", "", type=str).strip()
    to_date = request.args.get("to_date", "", type=str).strip()
    try:
        start = date.fromisoformat(from_date) if from_date else None
        end = date.fromisoformat(to_date) if to_date else None
    except ValueError:
        return error("validation_error", "Dates must use YYYY-MM-DD format.", 400)
    if start and end and start > end:
        return error("validation_error", "from_date must be on or before to_date.", 400)
    if start:
        query = query.filter(AttendanceSession.session_date >= start)
    if end:
        query = query.filter(AttendanceSession.session_date <= end)
    sessions = query.order_by(AttendanceSession.session_date.desc(), AttendanceSession.id.desc()).all()
    session_ids = [session.id for session in sessions]
    records = (
        AttendanceRecord.query.filter(
            AttendanceRecord.student_id == student.id,
            AttendanceRecord.session_id.in_(session_ids),
        ).all()
        if session_ids else []
    )
    records_by_session = {record.session_id: record for record in records}

    held_sessions = [session for session in sessions if session.status == "ended"]
    present_count = sum(session.id in records_by_session for session in held_sessions)
    total_held = len(held_sessions)
    items = []
    for session in sessions:
        course_class = session.course_class
        record = records_by_session.get(session.id)
        status = "present" if record else "absent" if session.status == "ended" else "in_progress"
        items.append({
            "session_id": session.id,
            "session_title": session.title,
            "session_date": session.session_date.isoformat(),
            "subject": course_class.subject,
            "department": course_class.department,
            "class_name": course_class.class_name,
            "section": course_class.section,
            "status": status,
            "marked_at": record.marked_at.isoformat() if record else None,
        })

    return jsonify({
        "student": {
            "full_name": student.full_name,
            "roll_number": student.roll_number,
            "email": student.email,
            "department": student.department,
            "class_name": student.class_name,
            "section": student.section,
            "phone": student.phone,
        },
        "summary": {
            "classes_held": total_held,
            "present": present_count,
            "absent": total_held - present_count,
            "attendance_percentage": round(100 * present_count / total_held, 1) if total_held else 0.0,
        },
        "items": items,
    }), 200


@student_portal_bp.put("/password")
@role_required("student")
def change_password():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error("invalid_request", "A JSON object is required.", 400)
    current_password = payload.get("current_password")
    new_password = payload.get("new_password")
    if not isinstance(current_password, str) or not isinstance(new_password, str):
        return error("validation_error", "Current and new passwords are required.", 400)
    if len(new_password) < 12 or len(new_password) > 128:
        return error("validation_error", "New password must be between 12 and 128 characters.", 400)
    user = g.current_user
    if not check_password_hash(user.password_hash, current_password):
        return error("invalid_current_password", "Current password is incorrect.", 401)
    user.password_hash = generate_password_hash(new_password)
    db.session.add(AuditLog(
        actor_id=user.id,
        action="student.password_changed",
        resource_type="user",
        resource_id=str(user.id),
        details={},
    ))
    db.session.commit()
    return jsonify({"message": "Password changed successfully."}), 200
