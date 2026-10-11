from functools import wraps

from flask import g, jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from .extensions import db
from .models import User


def role_required(*allowed_roles):
    def decorate(view):
        @wraps(view)
        @jwt_required()
        def wrapped(*args, **kwargs):
            try:
                user_id = int(get_jwt_identity())
            except (TypeError, ValueError):
                return jsonify({"error": {"code": "invalid_token", "message": "The access token is invalid."}}), 401
            user = db.session.get(User, user_id)
            if user is None or not user.is_active:
                return jsonify({"error": {"code": "account_inactive", "message": "This account is unavailable."}}), 401
            # Check the database role so a role change takes effect without waiting for the token to expire.
            if user.role not in allowed_roles:
                return jsonify({"error": {"code": "forbidden", "message": "You do not have permission to perform this action."}}), 403
            g.current_user = user
            return view(*args, **kwargs)

        return wrapped

    return decorate
