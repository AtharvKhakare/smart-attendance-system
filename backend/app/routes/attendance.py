from datetime import date, datetime, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Blueprint, current_app, g, jsonify, request, send_file
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import AuditLog, AttendanceRecord, AttendanceSession, CourseClass, FaceTemplate, Student
from ..security import role_required
from ..services.face_recognition import FaceInputError, extract_embedding, match_registered_embedding


attendance_bp = Blueprint("attendance", __name__)


def error(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def local_today():
    try:
        return datetime.now(ZoneInfo(current_app.config["APP_TIMEZONE"])).date()
    except ZoneInfoNotFoundError as issue:
        raise RuntimeError("APP_TIMEZONE must be a valid IANA timezone name") from issue


def parse_date(value, field_name):
    if not value:
        return None, None
    try:
        return date.fromisoformat(value), None
    except (ValueError, TypeError):
        return None, f"{field_name} must use YYYY-MM-DD format."


def session_json(session):
    course_class = session.course_class
    return {
        "id": session.id,
        "title": session.title,
        "session_date": session.session_date.isoformat(),
        "status": session.status,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "course_class": {
            "id": course_class.id,
            "department": course_class.department,
            "class_name": course_class.class_name,
            "section": course_class.section,
            "subject": course_class.subject,
        },
    }


def record_query():
    query = (
        db.session.query(AttendanceRecord)
        .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
        .join(CourseClass, AttendanceSession.course_class_id == CourseClass.id)
        .join(Student, AttendanceRecord.student_id == Student.id)
    )
    student_id = request.args.get("student_id", type=int)
    session_id = request.args.get("session_id", type=int)
    class_id = request.args.get("class_id", type=int)
    department = request.args.get("department", "", type=str).strip()
    if student_id:
        query = query.filter(AttendanceRecord.student_id == student_id)
    if session_id:
        query = query.filter(AttendanceRecord.session_id == session_id)
    if class_id:
        query = query.filter(AttendanceSession.course_class_id == class_id)
    if department:
        query = query.filter(CourseClass.department == department)
    start, issue = parse_date(request.args.get("from_date"), "from_date")
    if issue:
        return None, issue
    end, issue = parse_date(request.args.get("to_date"), "to_date")
    if issue:
        return None, issue
    if start:
        query = query.filter(AttendanceSession.session_date >= start)
    if end:
        query = query.filter(AttendanceSession.session_date <= end)
    if start and end and start > end:
        return None, "from_date must be on or before to_date."
    return query, None


def record_json(record):
    course_class = record.session.course_class
    student = record.student
    return {
        "id": record.id,
        "session_id": record.session_id,
        "session_title": record.session.title,
        "session_date": record.session.session_date.isoformat(),
        "student": {"id": student.id, "full_name": student.full_name, "roll_number": student.roll_number},
        "class": {"id": course_class.id, "department": course_class.department, "class_name": course_class.class_name, "section": course_class.section, "subject": course_class.subject},
        "marked_at": record.marked_at.isoformat(),
        "similarity": round(record.match_score, 4),
    }


@attendance_bp.get("/sessions")
@role_required("admin")
def list_sessions():
    query = AttendanceSession.query
    status = request.args.get("status", "", type=str).strip()
    class_id = request.args.get("class_id", type=int)
    session_date, issue = parse_date(request.args.get("date"), "date")
    if issue:
        return error("validation_error", issue, 400)
    if status:
        if status not in ("scheduled", "active", "ended"):
            return error("validation_error", "status must be scheduled, active, or ended.", 400)
        query = query.filter(AttendanceSession.status == status)
    if class_id:
        query = query.filter(AttendanceSession.course_class_id == class_id)
    if session_date:
        query = query.filter(AttendanceSession.session_date == session_date)
    rows = query.order_by(AttendanceSession.session_date.desc(), AttendanceSession.id.desc()).limit(200).all()
    return jsonify({"items": [session_json(row) for row in rows]}), 200


@attendance_bp.post("/sessions")
@role_required("admin")
def create_session():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error("invalid_request", "A JSON object is required.", 400)
    class_id = payload.get("course_class_id")
    title = payload.get("title")
    session_date, issue = parse_date(payload.get("session_date"), "session_date")
    if issue:
        return error("validation_error", issue, 400)
    if not isinstance(class_id, int) or class_id < 1:
        return error("validation_error", "course_class_id must be a positive integer.", 400)
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 160:
        return error("validation_error", "title must be a non-empty string of 160 characters or fewer.", 400)
    course_class = db.session.get(CourseClass, class_id)
    if course_class is None:
        return error("not_found", "Class not found.", 404)
    session = AttendanceSession(
        course_class_id=class_id,
        created_by_id=g.current_user.id,
        session_date=session_date or local_today(),
        title=title.strip(),
        status="scheduled",
    )
    db.session.add(session)
    db.session.flush()
    db.session.add(AuditLog(actor_id=g.current_user.id, action="attendance_session.created", resource_type="attendance_session", resource_id=str(session.id), details={"course_class_id": class_id, "session_date": session.session_date.isoformat()}))
    db.session.commit()
    return jsonify({"session": session_json(session)}), 201


@attendance_bp.get("/sessions/<int:session_id>")
@role_required("admin")
def get_session(session_id):
    session = db.session.get(AttendanceSession, session_id)
    if session is None:
        return error("not_found", "Attendance session not found.", 404)
    return jsonify({"session": session_json(session)}), 200


@attendance_bp.post("/sessions/<int:session_id>/start")
@role_required("admin")
def start_session(session_id):
    session = db.session.get(AttendanceSession, session_id)
    if session is None:
        return error("not_found", "Attendance session not found.", 404)
    if session.status != "scheduled":
        return error("invalid_session_state", "Only a scheduled session can be started.", 409)
    if session.session_date != local_today():
        return error("invalid_session_date", "Only a session scheduled for today can be started.", 409)
    active = AttendanceSession.query.filter_by(course_class_id=session.course_class_id, status="active").first()
    if active:
        return error("class_has_active_session", "This class already has an active attendance session.", 409)
    session.status = "active"
    session.started_at = datetime.now(timezone.utc)
    db.session.add(AuditLog(actor_id=g.current_user.id, action="attendance_session.started", resource_type="attendance_session", resource_id=str(session.id), details={"course_class_id": session.course_class_id}))
    db.session.commit()
    return jsonify({"session": session_json(session)}), 200


@attendance_bp.post("/sessions/<int:session_id>/end")
@role_required("admin")
def end_session(session_id):
    session = db.session.get(AttendanceSession, session_id)
    if session is None:
        return error("not_found", "Attendance session not found.", 404)
    if session.status != "active":
        return error("invalid_session_state", "Only an active session can be ended.", 409)
    session.status = "ended"
    session.ended_at = datetime.now(timezone.utc)
    db.session.add(AuditLog(actor_id=g.current_user.id, action="attendance_session.ended", resource_type="attendance_session", resource_id=str(session.id), details={"course_class_id": session.course_class_id}))
    db.session.commit()
    return jsonify({"session": session_json(session)}), 200


@attendance_bp.post("/mark")
@role_required("admin")
def mark_attendance():
    raw_session_id = request.form.get("session_id", "")
    try:
        session_id = int(raw_session_id)
    except (TypeError, ValueError):
        return error("validation_error", "session_id must be a positive integer.", 400)
    session = db.session.get(AttendanceSession, session_id)
    if session is None:
        return error("not_found", "Attendance session not found.", 404)
    if session.status != "active":
        return error("session_not_active", "Attendance can only be recorded in an active session.", 409)
    upload = request.files.get("image")
    if upload is None or not upload.filename:
        return error("image_required", "Upload one captured frame using the image field.", 400)
    if upload.mimetype not in ("image/jpeg", "image/png"):
        return error("unsupported_image_type", "Only JPEG and PNG images are accepted.", 415)
    try:
        query_embedding = extract_embedding(upload.read())
        match = match_registered_embedding(query_embedding)
    except FaceInputError as issue:
        return error(issue.code, str(issue), issue.status)
    except RuntimeError as issue:
        return error("face_service_unavailable", str(issue), 503)
    if match["status"] != "recognized":
        response = {"status": match["status"], "message": match["message"]}
        if "similarity" in match:
            response["similarity"] = round(match["similarity"], 4)
        return jsonify(response), 200

    student = match["student"]
    course_class = session.course_class
    if (student.department, student.class_name, student.section) != (course_class.department, course_class.class_name, course_class.section):
        return jsonify({"status": "class_mismatch", "message": "The recognized student is not enrolled in this session's class."}), 409

    existing = AttendanceRecord.query.filter_by(session_id=session.id, student_id=student.id).first()
    if existing:
        return jsonify({"status": "already_marked", "message": "Attendance was already recorded for this student in this session.", "record": record_json(existing)}), 200

    record = AttendanceRecord(session_id=session.id, student_id=student.id, match_score=match["similarity"], capture_id=str(uuid4()))
    db.session.add(record)
    db.session.add(AuditLog(actor_id=g.current_user.id, action="attendance.marked", resource_type="attendance_record", details={"session_id": session.id, "student_id": student.id, "similarity": round(match["similarity"], 4)}))
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        existing = AttendanceRecord.query.filter_by(session_id=session.id, student_id=student.id).first()
        if existing:
            return jsonify({"status": "already_marked", "message": "Attendance was already recorded for this student in this session.", "record": record_json(existing)}), 200
        raise
    return jsonify({"status": "marked", "message": "Attendance recorded.", "record": record_json(record)}), 201


@attendance_bp.get("/records")
@role_required("admin")
def list_records():
    query, issue = record_query()
    if issue:
        return error("validation_error", issue, 400)
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, max(1, request.args.get("per_page", 20, type=int)))
    results = query.order_by(AttendanceRecord.marked_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({"items": [record_json(row) for row in results.items], "pagination": {"page": results.page, "per_page": results.per_page, "total": results.total, "pages": results.pages}}), 200


@attendance_bp.get("/records/<int:record_id>")
@role_required("admin")
def get_record(record_id):
    record = db.session.get(AttendanceRecord, record_id)
    if record is None:
        return error("not_found", "Attendance record not found.", 404)
    return jsonify({"record": record_json(record)}), 200


@attendance_bp.get("/reports")
@role_required("admin")
def reports():
    start, issue = parse_date(request.args.get("from_date"), "from_date")
    if issue:
        return error("validation_error", issue, 400)
    end, issue = parse_date(request.args.get("to_date"), "to_date")
    if issue:
        return error("validation_error", issue, 400)
    if start and end and start > end:
        return error("validation_error", "from_date must be on or before to_date.", 400)
    class_id = request.args.get("class_id", type=int)
    department = request.args.get("department", "", type=str).strip()
    query = AttendanceSession.query.filter(AttendanceSession.status.in_(["active", "ended"]))
    if start:
        query = query.filter(AttendanceSession.session_date >= start)
    if end:
        query = query.filter(AttendanceSession.session_date <= end)
    if class_id:
        query = query.filter(AttendanceSession.course_class_id == class_id)
    if department:
        query = query.join(CourseClass).filter(CourseClass.department == department)
    sessions = query.order_by(AttendanceSession.session_date.desc()).limit(500).all()
    expected_total = 0
    present_total = 0
    by_class = {}
    for session in sessions:
        course_class = session.course_class
        expected = Student.query.filter_by(department=course_class.department, class_name=course_class.class_name, section=course_class.section, is_active=True).count()
        present = (
            db.session.query(func.count(AttendanceRecord.id))
            .join(Student, AttendanceRecord.student_id == Student.id)
            .filter(AttendanceRecord.session_id == session.id, Student.is_active.is_(True))
            .scalar() or 0
        )
        key = course_class.id
        item = by_class.setdefault(key, {"class_id": key, "department": course_class.department, "class_name": course_class.class_name, "section": course_class.section, "subject": course_class.subject, "sessions": 0, "expected": 0, "present": 0})
        item["sessions"] += 1
        item["expected"] += expected
        item["present"] += present
        expected_total += expected
        present_total += present
    for item in by_class.values():
        item["absent"] = max(0, item["expected"] - item["present"])
        item["attendance_percentage"] = round(100 * item["present"] / item["expected"], 1) if item["expected"] else 0.0
    return jsonify({"summary": {
        "sessions": len(sessions),
        "expected": expected_total,
        "present": present_total,
        "absent": max(0, expected_total - present_total),
        "attendance_percentage": round(100 * present_total / expected_total, 1) if expected_total else 0.0,
    }, "by_class": list(by_class.values())}), 200


@attendance_bp.get("/export")
@role_required("admin")
def export_records():
    import csv
    from io import BytesIO, StringIO

    query, issue = record_query()
    if issue:
        return error("validation_error", issue, 400)
    rows = query.order_by(AttendanceRecord.marked_at.desc()).limit(100000).all()
    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["record_id", "session_id", "session_title", "date", "roll_number", "student_name", "department", "class_name", "section", "subject", "marked_at", "similarity"])
    def safe_cell(value):
        value = str(value)
        if value.lstrip().startswith(("=", "+", "-", "@")):
            return "'" + value
        return value
    for record in rows:
        student = record.student
        course_class = record.session.course_class
        writer.writerow([record.id, record.session_id, safe_cell(record.session.title), record.session.session_date.isoformat(), safe_cell(student.roll_number), safe_cell(student.full_name), safe_cell(course_class.department), safe_cell(course_class.class_name), safe_cell(course_class.section), safe_cell(course_class.subject), record.marked_at.isoformat(), f"{record.match_score:.4f}"])
    data = BytesIO(output.getvalue().encode("utf-8-sig"))
    data.seek(0)
    return send_file(data, mimetype="text/csv; charset=utf-8", as_attachment=True, download_name="attendance-records.csv")
