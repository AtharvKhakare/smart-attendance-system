from datetime import datetime, timezone

from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity, jwt_required
from werkzeug.security import check_password_hash

from ..extensions import db
from ..models import RevokedToken, User


auth_bp = Blueprint("auth", __name__)


def error(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


@auth_bp.post("/login")
def login():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error("invalid_request", "A JSON object is required.", 400)
    email = payload.get("email")
    password = payload.get("password")
    if not isinstance(email, str) or not isinstance(password, str) or not email.strip() or not password:
        return error("validation_error", "Email and password are required.", 400)
    try:
        normalized_email = validate_email(email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        return error("invalid_credentials", "Email or password is incorrect.", 401)

    user = User.query.filter_by(email=normalized_email).first()
    if user is None or not user.is_active or not check_password_hash(user.password_hash, password):
        return error("invalid_credentials", "Email or password is incorrect.", 401)

    token = create_access_token(identity=str(user.id), additional_claims={"role": user.role})
    return jsonify({"access_token": token, "token_type": "Bearer", "user": {"id": user.id, "email": user.email, "role": user.role}}), 200


@auth_bp.post("/logout")
@jwt_required()
def logout():
    claims = get_jwt()
    if db.session.get(RevokedToken, claims["jti"]) is None:
        db.session.add(RevokedToken(jti=claims["jti"], expires_at=datetime.fromtimestamp(claims["exp"], timezone.utc)))
        db.session.commit()
    return jsonify({"message": "Logged out."}), 200


@auth_bp.get("/me")
@jwt_required()
def me():
    try:
        user_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        return error("invalid_token", "The access token is invalid.", 401)
    user = db.session.get(User, user_id)
    if user is None or not user.is_active:
        return error("account_inactive", "This account is unavailable.", 401)
    return jsonify({"user": {"id": user.id, "email": user.email, "role": user.role}}), 200
