import base64
import os
import uuid

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..extensions import db
from ..models import Report, User
from ..services.audit import record_audit
from ..services.crypto_service import encrypt_report
from ..services.report_storage import read_ciphertext, save_ciphertext

bp = Blueprint("reports", __name__, url_prefix="/api/reports")


def current_user():
    return User.query.filter_by(public_id=get_jwt_identity()).first()


@bp.get("")
@jwt_required()
def list_reports():
    user = current_user()
    if not user:
        return jsonify(error="User not found."), 401
    if user.role == "patient":
        reports = Report.query.filter_by(patient_id=user.id).order_by(Report.created_at.desc()).all()
    elif user.role == "admin":
        reports = Report.query.order_by(Report.created_at.desc()).limit(200).all()
    else:
        reports = Report.query.filter_by(created_by_id=user.id).order_by(Report.created_at.desc()).all()
    return jsonify(reports=[report.to_dict() for report in reports])


@bp.post("/upload")
@jwt_required()
def upload_report():
    staff = current_user()
    if not staff or staff.role not in ("lab", "admin"):
        return jsonify(error="Only laboratory staff or administrators can upload reports."), 403

    upload = request.files.get("file")
    patient_email = str(request.form.get("patient_email", "")).strip().lower()
    report_name = str(request.form.get("report_name", "")).strip()
    test_type = str(request.form.get("test_type", "")).strip()
    if not upload or not patient_email or not report_name or not test_type:
        return jsonify(error="Patient email, report name, test type and PDF file are required."), 400
    if len(report_name) > 160 or len(test_type) > 100:
        return jsonify(error="Report name or test type is too long."), 400

    patient = User.query.filter_by(email=patient_email, role="patient", is_active=True).first()
    if not patient:
        return jsonify(error="Patient account was not found."), 404
    if not patient.public_key_pem:
        return jsonify(error="This patient has not generated an encryption key yet."), 409

    pdf_bytes = upload.read()
    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF-"):
        return jsonify(error="Only valid PDF files are accepted."), 400
    if len(pdf_bytes) > current_app.config["MAX_CONTENT_LENGTH"]:
        return jsonify(error="The PDF exceeds the upload size limit."), 413

    report_id = str(uuid.uuid4())
    try:
        encrypted = encrypt_report(pdf_bytes, patient.public_key_pem, current_app.config["HOSPITAL_SIGNING_PRIVATE_KEY"])
    except ValueError as exc:
        return jsonify(error=str(exc)), 400

    encrypted_path = save_ciphertext(current_app.config["REPORT_STORAGE_DIR"], report_id, encrypted["ciphertext"])
    report = Report(
        id=report_id,
        patient_id=patient.id,
        created_by_id=staff.id,
        report_name=report_name,
        test_type=test_type,
        original_filename=os.path.basename((upload.filename or "lab-report.pdf").replace("\\", "/"))[:255],
        encrypted_path=encrypted_path,
        wrapped_aes_key=encrypted["wrapped_aes_key"],
        nonce=encrypted["nonce"],
        signature=encrypted["signature"],
        sha256_hex=encrypted["sha256_hex"],
    )
    db.session.add(report)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        try:
            os.remove(encrypted_path)
        except OSError:
            pass
        raise

    record_audit("REPORT_ENCRYPTED_AND_UPLOADED", f"Patient: {patient.email}; AES-256-GCM + RSA-OAEP", report_id)
    return jsonify(message="Report encrypted and uploaded successfully.", report=report.to_dict()), 201


@bp.get("/<report_id>/payload")
@jwt_required()
def get_encrypted_payload(report_id):
    user = current_user()
    report = Report.query.filter_by(id=report_id).first()
    if not user or not report:
        return jsonify(error="Report not found."), 404
    # Patients may retrieve only their own reports. Staff/admin cannot decrypt patient documents.
    if user.role != "patient" or report.patient_id != user.id:
        return jsonify(error="You are not authorised to retrieve this report."), 403
    try:
        ciphertext = read_ciphertext(report.encrypted_path)
    except OSError:
        return jsonify(error="Encrypted report file is unavailable."), 404
    record_audit("ENCRYPTED_REPORT_ACCESSED", "Ciphertext retrieved for patient-side decryption", report_id)
    return jsonify(
        report_id=report.id,
        ciphertext=base64.b64encode(ciphertext).decode("ascii"),
        wrapped_aes_key=report.wrapped_aes_key,
        nonce=report.nonce,
        signature=report.signature,
        sha256_hex=report.sha256_hex,
        report_name=report.report_name,
        hospital_public_key_pem=current_app.config["HOSPITAL_PUBLIC_KEY_PEM"],
    )
