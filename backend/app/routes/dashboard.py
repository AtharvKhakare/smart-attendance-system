from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from flask import Blueprint, current_app, jsonify, request

from ..extensions import db
from ..models import AttendanceRecord, AttendanceSession, CourseClass, Student
from ..security import role_required


dashboard_bp = Blueprint("dashboard", __name__)


def _attendance_snapshot(start_date, end_date):
    sessions = (
        AttendanceSession.query
        .filter(AttendanceSession.session_date >= start_date, AttendanceSession.session_date <= end_date)
        .filter(AttendanceSession.status.in_(["active", "ended"]))
        .all()
    )
    if not sessions:
        return {}, {}, {}

    class_ids = {session.course_class_id for session in sessions}
    classes = {row.id: row for row in CourseClass.query.filter(CourseClass.id.in_(class_ids)).all()}
    rosters = {}
    for class_id, course_class in classes.items():
        rosters[class_id] = {
            student.id for student in Student.query.filter_by(
                department=course_class.department,
                class_name=course_class.class_name,
                section=course_class.section,
                is_active=True,
            ).all()
        }

    sessions_by_date = {}
    sessions_by_class = {}
    session_ids = []
    for session in sessions:
        sessions_by_date.setdefault(session.session_date, []).append(session)
        sessions_by_class.setdefault(session.course_class_id, []).append(session)
        session_ids.append(session.id)

    present_by_date = {}
    present_by_class = {}
    records = (
        db.session.query(AttendanceRecord, AttendanceSession)
        .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
        .join(Student, AttendanceRecord.student_id == Student.id)
        .filter(AttendanceSession.id.in_(session_ids), Student.is_active.is_(True))
        .all()
    )
    for record, session in records:
        present_by_date.setdefault(session.session_date, set()).add(record.student_id)
        present_by_class.setdefault(session.course_class_id, set()).add(record.student_id)

    daily = {}
    for day, day_sessions in sessions_by_date.items():
        expected = set()
        for session in day_sessions:
            expected.update(rosters.get(session.course_class_id, set()))
        present = present_by_date.get(day, set()) & expected
        daily[day] = {"expected": expected, "present": present}
    by_class = {}
    for class_id, class_sessions in sessions_by_class.items():
        expected = rosters.get(class_id, set())
        present = present_by_class.get(class_id, set()) & expected
        by_class[class_id] = {"expected": expected, "present": present, "sessions": len(class_sessions)}
    return daily, by_class, classes


@dashboard_bp.get("/stats")
@role_required("admin")
def stats():
    today = datetime.now(ZoneInfo(current_app.config["APP_TIMEZONE"])).date()
    start = today - timedelta(days=6)
    daily, by_class, classes = _attendance_snapshot(start, today)
    expected_today = daily.get(today, {}).get("expected", set())
    present_today = daily.get(today, {}).get("present", set())
    trend = []
    for offset in range(7):
        day = start + timedelta(days=offset)
        snapshot = daily.get(day, {"expected": set(), "present": set()})
        expected = len(snapshot["expected"])
        present = len(snapshot["present"])
        trend.append({
            "date": day.isoformat(),
            "present": present,
            "absent": max(0, expected - present),
            "expected": expected,
            "attendance_percentage": round(100 * present / expected, 1) if expected else 0.0,
        })
    class_summary = []
    for class_id, snapshot in by_class.items():
        course_class = classes[class_id]
        expected = len(snapshot["expected"])
        present = len(snapshot["present"])
        class_summary.append({
            "class_id": class_id,
            "department": course_class.department,
            "class_name": course_class.class_name,
            "section": course_class.section,
            "subject": course_class.subject,
            "sessions_today": snapshot["sessions"],
            "present": present,
            "absent": max(0, expected - present),
            "expected": expected,
            "attendance_percentage": round(100 * present / expected, 1) if expected else 0.0,
        })
    total_students = Student.query.filter_by(is_active=True).count()
    expected_count = len(expected_today)
    present_count = len(present_today)
    return jsonify({
        "total_students": total_students,
        "present_today": present_count,
        "absent_today": max(0, expected_count - present_count),
        "expected_today": expected_count,
        "attendance_percentage": round(100 * present_count / expected_count, 1) if expected_count else 0.0,
        "attendance_trend": trend,
        "class_summary": class_summary,
    }), 200


@dashboard_bp.get("/recent-activity")
@role_required("admin")
def recent_activity():
    limit = min(50, max(1, request.args.get("limit", 15, type=int)))
    rows = (
        AttendanceRecord.query
        .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
        .join(Student, AttendanceRecord.student_id == Student.id)
        .order_by(AttendanceRecord.marked_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify({"items": [{
        "id": row.id,
        "student": {"id": row.student.id, "full_name": row.student.full_name, "roll_number": row.student.roll_number},
        "session_id": row.session_id,
        "session_title": row.session.title,
        "session_date": row.session.session_date.isoformat(),
        "department": row.session.course_class.department,
        "class_name": row.session.course_class.class_name,
        "section": row.session.course_class.section,
        "marked_at": row.marked_at.isoformat(),
        "similarity": round(row.match_score, 4),
    } for row in rows]}), 200
