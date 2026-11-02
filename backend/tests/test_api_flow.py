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


def test_password_change_deactivation_and_delete(tmp_path):
    app = create_app({
        "TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite://",
        "REPORT_STORAGE_DIR": str(tmp_path / "reports"), "HOSPITAL_SIGNING_KEY_DIR": str(tmp_path / "signing"),
        "SECRET_KEY": "test-secret-key-for-unit-tests-0123456789", "JWT_SECRET_KEY": "test-jwt-secret-key-for-unit-tests-0123",
        "FRONTEND_ORIGIN": "http://localhost:5173", "RATELIMIT_ENABLED": False,
    })
    with app.app_context():
        db.drop_all()
        db.create_all()
        db.session.add_all([make_user("Admin", "admin@example.test", "admin", "AdminPassword123!"),
                            make_user("Pat", "pat@example.test", "patient")])
        db.session.commit()
        pat_id = User.query.filter_by(email="pat@example.test").first().public_id
    c = app.test_client()
    login = lambda e, p: c.post("/api/auth/login", json={"email": e, "password": p})
    h = lambda r: {"Authorization": f"Bearer {r.json['access_token']}"}

    pat = login("pat@example.test", "TestPassword123!")
    bad = c.post("/api/auth/change-password", headers=h(pat), json={"current_password": "wrong", "new_password": "NewPassword456!"})
    assert bad.status_code == 403
    ok = c.post("/api/auth/change-password", headers=h(pat), json={"current_password": "TestPassword123!", "new_password": "NewPassword456!"})
    assert ok.status_code == 200
    assert login("pat@example.test", "TestPassword123!").status_code == 401
    pat = login("pat@example.test", "NewPassword456!")
    assert pat.status_code == 200
    assert c.get("/api/auth/activity", headers=h(pat)).json["activity"]

    admin = login("admin@example.test", "AdminPassword123!")
    assert c.patch(f"/api/admin/users/{pat_id}/active", headers=h(admin), json={"active": False}).status_code == 200
    # The deactivated user's existing token stops working immediately.
    assert c.get("/api/reports", headers=h(pat)).status_code == 401
    assert login("pat@example.test", "NewPassword456!").status_code == 401


def test_lab_can_generate_report_from_values(tmp_path):
    from app.services.report_pdf import clean_rows, result_flag
    assert result_flag("5.0", "4", "10") == "NORMAL" and result_flag("3", "4", "10") == "LOW" and result_flag("11", "4", "10") == "HIGH"
    assert result_flag("Positive", "", "") == ""
    for bad in ([], [{"name": "Hb", "value": ""}], [{"name": "Hb", "value": "1", "low": "abc"}]):
        try:
            clean_rows(bad)
            raise AssertionError("expected ValueError")
        except ValueError:
            pass

    app = create_app({
        "TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite://",
        "REPORT_STORAGE_DIR": str(tmp_path / "reports"), "HOSPITAL_SIGNING_KEY_DIR": str(tmp_path / "signing"),
        "SECRET_KEY": "test-secret-key-for-unit-tests-0123456789", "JWT_SECRET_KEY": "test-jwt-secret-key-for-unit-tests-0123",
        "FRONTEND_ORIGIN": "http://localhost:5173", "RATELIMIT_ENABLED": False,
    })
    with app.app_context():
        db.drop_all()
        db.create_all()
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        pat = make_user("Pat", "pat@example.test", "patient")
        pat.public_key_pem = pem
        nokey = make_user("NoKey", "nokey@example.test", "patient")
        db.session.add_all([pat, nokey, make_user("Lab", "lab@example.test", "lab"), make_user("Other", "other@example.test", "patient")])
        db.session.commit()
    c = app.test_client()
    token = lambda e: c.post("/api/auth/login", json={"email": e, "password": "TestPassword123!"}).json["access_token"]
    lab = {"Authorization": f"Bearer {token('lab@example.test')}"}
    body = {"patient_email": "pat@example.test", "report_name": "CBC", "test_type": "Complete Blood Count",
            "results": [{"name": "Hemoglobin", "value": "9.1", "unit": "g/dL", "low": "12", "high": "16"}], "notes": "Repeat in 4 weeks"}
    ok = c.post("/api/reports/generate", headers=lab, json=body)
    assert ok.status_code == 201, ok.json
    assert c.post("/api/reports/generate", headers=lab, json={**body, "results": []}).status_code == 400
    assert c.post("/api/reports/generate", headers=lab, json={**body, "patient_email": "nokey@example.test"}).status_code == 409
    patient_headers = {"Authorization": f"Bearer {token('pat@example.test')}"}
    assert c.post("/api/reports/generate", headers=patient_headers, json=body).status_code == 403
    assert c.get(f"/api/reports/{ok.json['report']['id']}/payload", headers=patient_headers).status_code == 200
