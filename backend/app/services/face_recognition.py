import threading
from io import BytesIO

import cv2
import numpy as np
from cryptography.fernet import Fernet, InvalidToken
from flask import current_app
from PIL import Image, UnidentifiedImageError


class FaceInputError(ValueError):
    def __init__(self, code, message, status=422):
        super().__init__(message)
        self.code = code
        self.status = status


_thread_models = threading.local()


def _models():
    detector = getattr(_thread_models, "detector", None)
    recognizer = getattr(_thread_models, "recognizer", None)
    detector_path = current_app.config["FACE_DETECTOR_MODEL"]
    recognizer_path = current_app.config["FACE_RECOGNIZER_MODEL"]
    if detector is None or recognizer is None:
        if not detector_path.is_file() or not recognizer_path.is_file():
            raise RuntimeError("OpenCV face model files are missing. See backend/models/README.md.")
        detector = cv2.FaceDetectorYN.create(
            str(detector_path), "", (320, 320), 0.90, 0.30, 5000
        )
        recognizer = cv2.FaceRecognizerSF.create(str(recognizer_path), "")
        _thread_models.detector = detector
        _thread_models.recognizer = recognizer
    return detector, recognizer


def _fernet():
    key = current_app.config["FACE_DATA_ENCRYPTION_KEY"]
    if not key or key == "generate-a-fernet-key-and-store-it-here":
        raise RuntimeError("FACE_DATA_ENCRYPTION_KEY must be set before using face endpoints")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as error:
        raise RuntimeError("FACE_DATA_ENCRYPTION_KEY must be a valid Fernet key") from error


def extract_embedding(image_bytes):
    if not image_bytes:
        raise FaceInputError("empty_image", "The uploaded image is empty.")
    if len(image_bytes) > 5 * 1024 * 1024:
        raise FaceInputError("image_too_large", "Each image must be 5 MB or smaller.", 413)

    try:
        with Image.open(BytesIO(image_bytes)) as uploaded:
            if uploaded.format not in ("JPEG", "PNG"):
                raise FaceInputError("unsupported_image_type", "Only JPEG and PNG images are accepted.", 415)
            width, height = uploaded.size
            if width < 100 or height < 100 or width > 4096 or height > 4096:
                raise FaceInputError("invalid_dimensions", "Image dimensions must be between 100 and 4096 pixels.")
            uploaded.verify()
    except FaceInputError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise FaceInputError("invalid_image", "The upload is not a readable JPEG or PNG image.") from error

    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise FaceInputError("invalid_image", "The upload is not a readable JPEG or PNG image.")
    height, width = image.shape[:2]
    if width < 100 or height < 100 or width > 4096 or height > 4096:
        raise FaceInputError("invalid_dimensions", "Image dimensions must be between 100 and 4096 pixels.")

    detector, recognizer = _models()
    detector.setInputSize((width, height))
    _, faces = detector.detect(image)
    count = 0 if faces is None else len(faces)
    if count == 0:
        raise FaceInputError("no_face", "No usable face was detected. Center your face and try again.")
    if count > 1:
        raise FaceInputError("multiple_faces", "More than one face was detected. Capture one person at a time.")

    face = faces[0]
    if float(face[-1]) < 0.90:
        raise FaceInputError("low_quality_face", "The face was not clear enough. Improve lighting and try again.")
    if float(face[2]) < 60 or float(face[3]) < 60:
        raise FaceInputError("face_too_small", "Move closer to the camera so your face is larger in frame.")

    aligned = recognizer.alignCrop(image, face)
    feature = recognizer.feature(aligned).reshape(-1).astype(np.float32)
    if feature.size != 128 or not np.isfinite(feature).all():
        raise FaceInputError("invalid_embedding", "The face model could not create a valid face representation.")
    norm = float(np.linalg.norm(feature))
    if norm == 0.0:
        raise FaceInputError("invalid_embedding", "The face model returned an empty face representation.")
    return feature / norm


def encrypt_embedding(embedding):
    raw = np.asarray(embedding, dtype="<f4").tobytes()
    return _fernet().encrypt(raw)


def decrypt_embedding(encrypted):
    try:
        raw = _fernet().decrypt(encrypted)
    except InvalidToken as error:
        raise RuntimeError("Stored face data could not be decrypted; check the face encryption key.") from error
    vector = np.frombuffer(raw, dtype="<f4")
    if vector.size != 128 or not np.isfinite(vector).all():
        raise RuntimeError("Stored face data has an invalid format.")
    norm = float(np.linalg.norm(vector))
    if norm == 0:
        raise RuntimeError("Stored face data is empty.")
    return vector / norm


def cosine_similarity(left, right):
    return float(np.clip(np.dot(left, right), -1.0, 1.0))


def match_registered_embedding(query):
    from ..extensions import db
    from ..models import FaceTemplate, Student

    templates = (
        db.session.query(FaceTemplate, Student)
        .join(Student, Student.id == FaceTemplate.student_id)
        .filter(Student.is_active.is_(True))
        .all()
    )
    if not templates:
        return {"status": "unknown", "message": "No students have registered face data."}

    best_by_student = {}
    for template, student in templates:
        score = cosine_similarity(query, decrypt_embedding(template.encrypted_embedding))
        previous = best_by_student.get(student.id)
        if previous is None or score > previous["similarity"]:
            best_by_student[student.id] = {"student": student, "similarity": score}

    ranked = sorted(best_by_student.values(), key=lambda match: match["similarity"], reverse=True)
    best = ranked[0]
    threshold = float(current_app.config["FACE_MATCH_THRESHOLD"])
    if best["similarity"] < threshold:
        return {"status": "unknown", "message": "No registered student matched this face.", "similarity": best["similarity"]}

    margin = float(current_app.config["FACE_AMBIGUITY_MARGIN"])
    if len(ranked) > 1 and ranked[1]["similarity"] >= threshold and best["similarity"] - ranked[1]["similarity"] < margin:
        return {"status": "ambiguous", "message": "The face matched more than one student closely. Try another image.", "similarity": best["similarity"]}
    return {"status": "recognized", "student": best["student"], "similarity": best["similarity"]}
