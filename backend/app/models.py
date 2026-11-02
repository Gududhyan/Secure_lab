from datetime import datetime, timezone
import uuid

from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    public_id = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(254), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="patient", index=True)
    patient_code = db.Column(db.String(40), unique=True, nullable=True)
    public_key_pem = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    mfa_secret = db.Column(db.String(64), nullable=True)
    mfa_enabled = db.Column(db.Boolean, nullable=False, default=False)

    reports = db.relationship("Report", backref="patient", lazy=True, foreign_keys="Report.patient_id")

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password, method="scrypt")

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.public_id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "patient_code": self.patient_code,
            "has_public_key": bool(self.public_key_pem),
            "mfa_enabled": bool(self.mfa_enabled),
        }


class Report(db.Model):
    __tablename__ = "reports"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    report_name = db.Column(db.String(160), nullable=False)
    test_type = db.Column(db.String(100), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    encrypted_path = db.Column(db.String(500), nullable=False)
    wrapped_aes_key = db.Column(db.Text, nullable=False)
    nonce = db.Column(db.String(64), nullable=False)
    signature = db.Column(db.Text, nullable=False)
    sha256_hex = db.Column(db.String(64), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, index=True)

    creator = db.relationship("User", foreign_keys=[created_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "report_name": self.report_name,
            "test_type": self.test_type,
            "original_filename": self.original_filename,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "patient_name": self.patient.name if self.patient else None,
            "patient_email": self.patient.email if self.patient else None,
        }


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    actor_email = db.Column(db.String(254), nullable=True)
    action = db.Column(db.String(100), nullable=False, index=True)
    resource_id = db.Column(db.String(100), nullable=True)
    details = db.Column(db.String(500), nullable=True)
    ip_address = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, index=True)

    actor = db.relationship("User", foreign_keys=[actor_id])

    def to_dict(self):
        return {
            "id": self.id,
            "actor_email": self.actor_email,
            "action": self.action,
            "resource_id": self.resource_id,
            "details": self.details,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
