from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..extensions import db
from ..models import User
from ..services.audit import record_audit
from ..services.crypto_service import load_and_validate_rsa_public_key

bp = Blueprint("keys", __name__, url_prefix="/api/keys")


@bp.get("/status")
@jwt_required()
def key_status():
    user = User.query.filter_by(public_id=get_jwt_identity()).first()
    return jsonify(has_public_key=bool(user and user.public_key_pem))


@bp.post("/register")
@jwt_required()
def register_public_key():
    user = User.query.filter_by(public_id=get_jwt_identity()).first()
    if not user or user.role != "patient":
        return jsonify(error="Only patient accounts can register patient encryption keys."), 403
    if user.public_key_pem:
        return jsonify(error="An encryption key is already registered. Key rotation is not enabled in this demo."), 409
    data = request.get_json(silent=True) or {}
    pem = data.get("public_key_pem", "")
    if not isinstance(pem, str) or len(pem) > 10000:
        return jsonify(error="Invalid public key."), 400
    try:
        load_and_validate_rsa_public_key(pem)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    user.public_key_pem = pem
    db.session.commit()
    record_audit("PATIENT_PUBLIC_KEY_REGISTERED", "RSA-2048+ public key registered")
    return jsonify(message="Public key registered. Keep your encrypted private-key file safe."), 201


@bp.get("/hospital-public")
def hospital_public_key():
    return jsonify(public_key_pem=current_app.config["HOSPITAL_PUBLIC_KEY_PEM"])
