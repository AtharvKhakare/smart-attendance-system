from flask import Blueprint, current_app, g, jsonify, request

from ..extensions import db
from ..models import AuditLog, FaceTemplate, Student
from ..security import role_required
from ..services.face_recognition import (
    FaceInputError,
    cosine_similarity,
    encrypt_embedding,
    extract_embedding,
    match_registered_embedding,
)


face_bp = Blueprint("face", __name__)
MODEL_NAME = "OpenCV SFace 2021-12"


def error(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def read_image_upload(upload):
    if upload is None or not upload.filename:
        raise FaceInputError("image_required", "Upload an image using the expected image field.", 400)
    if upload.mimetype not in ("image/jpeg", "image/png"):
        raise FaceInputError("unsupported_image_type", "Only JPEG and PNG images are accepted.", 415)
    return upload.read()


def audit(action, student, details):
    db.session.add(AuditLog(
        actor_id=g.current_user.id,
        action=action,
        resource_type="student",
        resource_id=str(student.id),
        details=details,
    ))


@face_bp.post("/register/<int:student_id>")
@role_required("admin")
def register_faces(student_id):
    student = Student.query.filter_by(id=student_id, is_active=True).first()
    if student is None:
        return error("not_found", "Active student not found.", 404)
    uploads = request.files.getlist("images")
    if len(uploads) < 3 or len(uploads) > 5:
        return error("validation_error", "Capture and upload 3 to 5 clear images of the same student.", 400)

    vectors = []
    try:
        for index, upload in enumerate(uploads, start=1):
            try:
                vectors.append(extract_embedding(read_image_upload(upload)))
            except FaceInputError as issue:
                return error(issue.code, f"Image {index}: {issue}", issue.status)
    except RuntimeError as issue:
        return error("face_service_unavailable", str(issue), 503)
    threshold = float(current_app.config["FACE_MATCH_THRESHOLD"])
    for left_index in range(len(vectors)):
        for right_index in range(left_index + 1, len(vectors)):
            if cosine_similarity(vectors[left_index], vectors[right_index]) < threshold:
                return error("inconsistent_faces", "The images do not appear to show the same person. Capture a consistent set again.", 422)
    try:
        encrypted_vectors = [encrypt_embedding(vector) for vector in vectors]
    except RuntimeError as issue:
        return error("face_service_unavailable", str(issue), 503)

    # Replace old samples only after all new images have passed validation.
    db.session.query(FaceTemplate).filter_by(student_id=student.id).delete(synchronize_session=False)
    for encrypted in encrypted_vectors:
        db.session.add(FaceTemplate(
            student_id=student.id,
            encrypted_embedding=encrypted,
            encryption_key_version=current_app.config["FACE_DATA_KEY_VERSION"],
            model_name=MODEL_NAME,
        ))
    audit("face.registered", student, {"template_count": len(vectors), "model": MODEL_NAME})
    db.session.commit()
    return jsonify({"message": "Face data registered.", "student_id": student.id, "template_count": len(vectors)}), 201


@face_bp.post("/recognize")
@role_required("admin")
def recognize_face():
    upload = request.files.get("image")
    try:
        query = extract_embedding(read_image_upload(upload))
    except FaceInputError as issue:
        return error(issue.code, str(issue), issue.status)
    except RuntimeError as issue:
        return error("face_service_unavailable", str(issue), 503)

    try:
        match = match_registered_embedding(query)
    except RuntimeError as issue:
        return error("face_data_unavailable", str(issue), 503)
    if match["status"] != "recognized":
        response = {"status": match["status"], "message": match["message"]}
        if "similarity" in match:
            response["similarity"] = round(match["similarity"], 4)
        return jsonify(response), 200
    student = match["student"]
    return jsonify({
        "status": "recognized",
        "student": {"id": student.id, "full_name": student.full_name, "roll_number": student.roll_number},
        "similarity": round(match["similarity"], 4),
    }), 200


@face_bp.delete("/<int:student_id>")
@role_required("admin")
def delete_faces(student_id):
    student = Student.query.filter_by(id=student_id).first()
    if student is None:
        return error("not_found", "Student not found.", 404)
    deleted = db.session.query(FaceTemplate).filter_by(student_id=student.id).delete(synchronize_session=False)
    audit("face.deleted", student, {"template_count": deleted})
    db.session.commit()
    return jsonify({"message": "Face data deleted.", "deleted_templates": deleted}), 200
