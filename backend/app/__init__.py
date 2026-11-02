import os
from pathlib import Path

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from config import Config
from .extensions import db, jwt, limiter
from .services.crypto_service import ensure_hospital_signing_key


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)

    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    Path(app.config["REPORT_STORAGE_DIR"]).mkdir(parents=True, exist_ok=True)
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGIN"]}}, allow_headers=["Content-Type", "Authorization"])

    private_key, public_pem = ensure_hospital_signing_key(app.config["HOSPITAL_SIGNING_KEY_DIR"])
    app.config["HOSPITAL_SIGNING_PRIVATE_KEY"] = private_key
    app.config["HOSPITAL_PUBLIC_KEY_PEM"] = public_pem

    from .routes.auth import bp as auth_bp
    from .routes.keys import bp as keys_bp
    from .routes.reports import bp as reports_bp
    from .routes.lab import bp as lab_bp
    from .routes.admin import bp as admin_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(keys_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(lab_bp)
    app.register_blueprint(admin_bp)

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", service="SecureLab API")

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify(error="Upload too large. The configured PDF limit was exceeded."), 413

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Cache-Control"] = "no-store"
        return response

    from .commands import register_commands
    register_commands(app)

    with app.app_context():
        db.create_all()

    return app
