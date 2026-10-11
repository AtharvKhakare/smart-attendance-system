import click
from flask import Flask
from flask_cors import CORS
from sqlalchemy import event
from werkzeug.security import generate_password_hash

from .config import Config
from .extensions import db, jwt, migrate
from .routes.health import health_bp


def create_app(config_class=Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)
    config_class.validate()

    origins = [origin.strip() for origin in app.config["CORS_ORIGINS"].split(",") if origin.strip()]
    CORS(app, resources={r"/api/*": {"origins": origins}}, supports_credentials=False)

    db.init_app(app)
    with app.app_context():
        engine = db.engine
    if engine.dialect.name == "postgresql":
        schema = engine.dialect.identifier_preparer.quote(app.config["DATABASE_SCHEMA"])

        @event.listens_for(engine, "connect")
        def set_database_search_path(connection, _connection_record):
            cursor = connection.cursor()
            try:
                cursor.execute(f"SET search_path TO {schema}")
                connection.commit()
            finally:
                cursor.close()

    migrate.init_app(app, db)
    jwt.init_app(app)

    from . import models  # noqa: F401

    app.register_blueprint(health_bp, url_prefix="/api")
    from .routes.auth import auth_bp
    from .routes.attendance import attendance_bp
    from .routes.audit import audit_bp
    from .routes.classes import classes_bp
    from .routes.dashboard import dashboard_bp
    from .routes.face import face_bp
    from .routes.students import students_bp
    from .routes.student_portal import student_portal_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(classes_bp, url_prefix="/api/classes")
    app.register_blueprint(students_bp, url_prefix="/api/students")
    app.register_blueprint(student_portal_bp, url_prefix="/api/student")
    app.register_blueprint(face_bp, url_prefix="/api/face")
    app.register_blueprint(attendance_bp, url_prefix="/api/attendance")
    app.register_blueprint(audit_bp, url_prefix="/api/audit")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")

    @jwt.token_in_blocklist_loader
    def token_is_revoked(_header, payload):
        return db.session.get(models.RevokedToken, payload["jti"]) is not None

    @jwt.unauthorized_loader
    def missing_token(_reason):
        return {"error": {"code": "authentication_required", "message": "A valid bearer token is required."}}, 401

    @jwt.invalid_token_loader
    def invalid_token(_reason):
        return {"error": {"code": "invalid_token", "message": "The access token is invalid."}}, 401

    @jwt.expired_token_loader
    def expired_token(_header, _payload):
        return {"error": {"code": "expired_token", "message": "The access token has expired. Please sign in again."}}, 401

    @jwt.revoked_token_loader
    def revoked_token(_header, _payload):
        return {"error": {"code": "revoked_token", "message": "This access token has been logged out."}}, 401

    @app.cli.command("create-admin")
    @click.option("--email", prompt="Administrator email")
    def create_admin(email):
        """Create the first administrator without exposing a password in shell history."""
        from email_validator import EmailNotValidError, validate_email

        try:
            normalized_email = validate_email(email, check_deliverability=False).normalized.lower()
        except EmailNotValidError as error:
            raise click.ClickException(str(error)) from error
        if models.User.query.filter_by(email=normalized_email).first():
            raise click.ClickException("An account with that email already exists.")
        password = click.prompt("Password (minimum 12 characters)", hide_input=True, confirmation_prompt=True)
        if len(password) < 12:
            raise click.ClickException("Password must contain at least 12 characters.")
        user = models.User(email=normalized_email, password_hash=generate_password_hash(password), role="admin")
        db.session.add(user)
        db.session.add(models.AuditLog(action="admin.created", resource_type="user", details={"email": normalized_email}))
        db.session.commit()
        click.echo("Administrator account created.")

    @app.cli.command("reset-admin-password")
    @click.option("--email", prompt="Administrator email")
    def reset_admin_password(email):
        """Safely replace an administrator password using a hidden prompt."""
        from email_validator import EmailNotValidError, validate_email

        try:
            normalized_email = validate_email(email, check_deliverability=False).normalized.lower()
        except EmailNotValidError as error:
            raise click.ClickException(str(error)) from error
        user = models.User.query.filter_by(email=normalized_email, role="admin").first()
        if user is None:
            raise click.ClickException("No administrator account exists with that email.")
        password = click.prompt("New password (minimum 12 characters)", hide_input=True, confirmation_prompt=True)
        if len(password) < 12:
            raise click.ClickException("Password must contain at least 12 characters.")
        user.password_hash = generate_password_hash(password)
        db.session.add(models.AuditLog(action="admin.password_reset", resource_type="user", details={"email": normalized_email}))
        db.session.commit()
        click.echo("Administrator password changed.")

    @app.cli.command("check-face-key")
    def check_face_key():
        """Report face-key status and source without revealing the secret."""
        from cryptography.fernet import Fernet

        key = app.config.get("FACE_DATA_ENCRYPTION_KEY", "")
        valid = False
        if key:
            try:
                Fernet(key.encode("ascii"))
                valid = True
            except (ValueError, UnicodeEncodeError):
                pass
        click.echo(f"Present: {'yes' if bool(key) else 'no'}")
        click.echo(f"Format valid: {'yes' if valid else 'no'}")
        click.echo(f"Source: {app.config.get('FACE_DATA_ENCRYPTION_KEY_SOURCE', 'unknown')}")

    @app.errorhandler(404)
    def not_found(_error):
        return {"error": {"code": "not_found", "message": "The requested resource was not found."}}, 404

    @app.errorhandler(413)
    def payload_too_large(_error):
        return {"error": {"code": "payload_too_large", "message": "The request exceeds the 25 MB limit."}}, 413

    return app
