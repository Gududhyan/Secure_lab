import io

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app import create_app
from app.extensions import db
from app.models import User


def make_user(name, email, role, password="TestPassword123!"):
    user = User(name=name, email=email, role=role)
    user.set_password(password)
    return user


def test_patient_only_can_fetch_own_encrypted_report(tmp_path):
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite://",
        "REPORT_STORAGE_DIR": str(tmp_path / "reports"),
        "HOSPITAL_SIGNING_KEY_DIR": str(tmp_path / "signing"),
        "SECRET_KEY": "test-secret",
        "JWT_SECRET_KEY": "test-jwt-secret",
        "FRONTEND_ORIGIN": "http://localhost:5173",
        "RATELIMIT_ENABLED": False,
    })
    with app.app_context():
        db.drop_all()
        db.create_all()
        patient_private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_pem = patient_private.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode("utf-8")
        patient = make_user("Patient One", "patient@example.test", "patient")
        patient.public_key_pem = public_pem
        other = make_user("Patient Two", "other@example.test", "patient")
        lab = make_user("Lab User", "lab@example.test", "lab")
        db.session.add_all([patient, other, lab])
        db.session.commit()
        patient_id = patient.public_id
        other_id = other.public_id

    client = app.test_client()
    lab_login = client.post("/api/auth/login", json={"email": "lab@example.test", "password": "TestPassword123!"})
    lab_token = lab_login.json["access_token"]
    uploaded = client.post(
        "/api/reports/upload",
        headers={"Authorization": f"Bearer {lab_token}"},
        data={
            "patient_email": "patient@example.test",
            "report_name": "CBC Test",
            "test_type": "Complete Blood Count",
            "file": (io.BytesIO(b"%PDF-1.7\nDemo\n%%EOF"), "cbc.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert uploaded.status_code == 201
    report_id = uploaded.json["report"]["id"]

    patient_login = client.post("/api/auth/login", json={"email": "patient@example.test", "password": "TestPassword123!"})
    patient_token = patient_login.json["access_token"]
    payload = client.get(f"/api/reports/{report_id}/payload", headers={"Authorization": f"Bearer {patient_token}"})
    assert payload.status_code == 200

    other_login = client.post("/api/auth/login", json={"email": "other@example.test", "password": "TestPassword123!"})
    other_token = other_login.json["access_token"]
    denied = client.get(f"/api/reports/{report_id}/payload", headers={"Authorization": f"Bearer {other_token}"})
    assert denied.status_code == 403
