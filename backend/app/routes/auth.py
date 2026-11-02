import re
import secrets

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from sqlalchemy.exc import IntegrityError
import pyotp

from ..extensions import db, limiter
from ..models import AuditLog, User
from ..services.audit import record_audit

bp = Blueprint("auth", __name__, url_prefix="/api/auth")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def valid_password(password: str) -> bool:
    return isinstance(password, str) and len(password) >= 10 and any(c.isalpha() for c in password) and any(c.isdigit() for c in password)


@bp.post("/register")
@limiter.limit("5 per hour")
def register_patient():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    patient_code = str(data.get("patient_code", "")).strip() or f"SL-{secrets.token_hex(4).upper()}"

    if not name or len(name) > 120 or not EMAIL_RE.match(email) or len(patient_code) > 40 or not valid_password(password):
        return jsonify(error="Provide a name, valid email, and password of at least 10 characters containing letters and numbers."), 400
    user = User(name=name, email=email, role="patient", patient_code=patient_code)
    user.set_password(password)
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify(error="An account with this email or patient ID already exists."), 409

    token = create_access_token(identity=user.public_id)
    record_audit("PATIENT_REGISTERED", "Patient self-registration", actor_user=user)
    return jsonify(access_token=token, user=user.to_dict()), 201


@bp.post("/login")
@limiter.limit("5 per minute")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    user = User.query.filter_by(email=email).first()
    if not user or not user.is_active or not isinstance(password, str) or not user.check_password(password):
        # Do not reveal whether an email is registered.
        record_audit("LOGIN_FAILED", "Invalid credentials", actor_user=user)
        return jsonify(error="Invalid email or password."), 401
    if user.mfa_enabled:
        otp = str(data.get("otp", "")).strip()
        if not otp:
            return jsonify(mfa_required=True, message="Enter the six-digit authenticator code."), 200
        if not user.mfa_secret or not pyotp.TOTP(user.mfa_secret).verify(otp, valid_window=1):
            record_audit("MFA_LOGIN_FAILED", "Invalid TOTP code", actor_user=user)
            return jsonify(error="Invalid authenticator code."), 401
    token = create_access_token(identity=user.public_id)
    record_audit("LOGIN_SUCCESS", "User authenticated with password" + (" and TOTP" if user.mfa_enabled else ""), actor_user=user)
    return jsonify(access_token=token, user=user.to_dict())


@bp.post("/mfa/setup")
@jwt_required()
def mfa_setup():
    user = User.query.filter_by(public_id=get_jwt_identity()).first()
    if not user:
        return jsonify(error="User not found."), 404
    if user.mfa_enabled:
        return jsonify(error="Multi-factor authentication is already enabled."), 409
    secret = pyotp.random_base32()
    user.mfa_secret = secret
    db.session.commit()
    record_audit("MFA_SETUP_STARTED", "TOTP authenticator setup initiated")
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="SecureLab")
    return jsonify(secret=secret, provisioning_uri=uri, message="Add this secret to an authenticator app, then verify a code to enable MFA.")


@bp.post("/mfa/enable")
@jwt_required()
@limiter.limit("5 per minute")
def mfa_enable():
    user = User.query.filter_by(public_id=get_jwt_identity()).first()
    data = request.get_json(silent=True) or {}
    code = str(data.get("code", "")).strip()
    if not user or not user.mfa_secret:
        return jsonify(error="Start authenticator setup first."), 400
    if not pyotp.TOTP(user.mfa_secret).verify(code, valid_window=1):
        return jsonify(error="Invalid authenticator code."), 400
    user.mfa_enabled = True
    db.session.commit()
    record_audit("MFA_ENABLED", "TOTP multi-factor authentication enabled")
    return jsonify(message="Multi-factor authentication is now enabled.", mfa_enabled=True)


@bp.get("/me")
@jwt_required()
def me():
    user = User.query.filter_by(public_id=get_jwt_identity()).first()
    if not user or not user.is_active:
        return jsonify(error="Account not available."), 401
    return jsonify(user=user.to_dict())


@bp.post("/change-password")
@jwt_required()
@limiter.limit("5 per minute")
def change_password():
    user = User.query.filter_by(public_id=get_jwt_identity()).first()
    data = request.get_json(silent=True) or {}
    current, new = data.get("current_password", ""), data.get("new_password", "")
    if not user:
        return jsonify(error="User not found."), 404
    if not isinstance(current, str) or not user.check_password(current):
        record_audit("PASSWORD_CHANGE_FAILED", "Incorrect current password", actor_user=user)
        return jsonify(error="Your current password is incorrect."), 403
    minimum = 10 if user.role == "patient" else 12
    if not valid_password(new) or len(new) < minimum:
        return jsonify(error=f"New password must be at least {minimum} characters and contain letters and numbers."), 400
    if new == current:
        return jsonify(error="Choose a password different from your current one."), 400
    user.set_password(new)
    db.session.commit()
    record_audit("PASSWORD_CHANGED", "User changed their own password", actor_user=user)
    return jsonify(message="Password updated successfully.")


@bp.get("/activity")
@jwt_required()
def my_activity():
    user = User.query.filter_by(public_id=get_jwt_identity()).first()
    if not user:
        return jsonify(error="User not found."), 404
    entries = AuditLog.query.filter_by(actor_id=user.id).order_by(AuditLog.created_at.desc()).limit(15).all()
    return jsonify(activity=[e.to_dict() for e in entries])
