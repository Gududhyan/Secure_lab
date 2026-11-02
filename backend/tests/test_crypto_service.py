import hashlib

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.services.crypto_service import b64d, encrypt_report


def test_hybrid_encrypt_and_signature_round_trip(tmp_path):
    patient_private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    patient_public_pem = patient_private.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    hospital_private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pdf = b"%PDF-1.7\nSecureLab synthetic report for cryptographic test\n%%EOF"

    encrypted = encrypt_report(pdf, patient_public_pem, hospital_private)
    aes_key = patient_private.decrypt(
        b64d(encrypted["wrapped_aes_key"]),
        padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
    )
    recovered = AESGCM(aes_key).decrypt(b64d(encrypted["nonce"]), encrypted["ciphertext"], None)

    assert recovered == pdf
    assert encrypted["sha256_hex"] == hashlib.sha256(pdf).hexdigest()
    hospital_private.public_key().verify(
        b64d(encrypted["signature"]),
        recovered,
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=32),
        hashes.SHA256(),
    )


# ---- Attack-resistance tests (used as evidence in the project report) ----
import pytest
from cryptography.exceptions import InvalidSignature, InvalidTag


def _fixture():
    patient = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = patient.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    hospital = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pdf = b"%PDF-1.7\nSecureLab synthetic report\n%%EOF"
    return patient, pem, hospital, pdf


def _oaep():
    return padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)


def test_ciphertext_bit_flip_is_detected():
    patient, pem, hospital, pdf = _fixture()
    enc = encrypt_report(pdf, pem, hospital)
    key = patient.decrypt(b64d(enc["wrapped_aes_key"]), _oaep())
    tampered = bytearray(enc["ciphertext"])
    tampered[5] ^= 0x01
    with pytest.raises(InvalidTag):
        AESGCM(key).decrypt(b64d(enc["nonce"]), bytes(tampered), None)


def test_other_patients_key_cannot_unwrap_the_aes_key():
    _, pem, hospital, pdf = _fixture()
    enc = encrypt_report(pdf, pem, hospital)
    stranger = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(ValueError):
        stranger.decrypt(b64d(enc["wrapped_aes_key"]), _oaep())


def test_forged_or_altered_report_fails_signature_check():
    patient, pem, hospital, pdf = _fixture()
    enc = encrypt_report(pdf, pem, hospital)
    pss = padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=32)
    with pytest.raises(InvalidSignature):  # report content changed after signing
        hospital.public_key().verify(b64d(enc["signature"]), pdf + b"x", pss, hashes.SHA256())
    impostor = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(InvalidSignature):  # signed by someone other than the hospital
        impostor.public_key().verify(b64d(enc["signature"]), pdf, pss, hashes.SHA256())


def test_every_encryption_uses_a_fresh_key_and_nonce():
    _, pem, hospital, pdf = _fixture()
    a, b = encrypt_report(pdf, pem, hospital), encrypt_report(pdf, pem, hospital)
    assert a["nonce"] != b["nonce"] and a["wrapped_aes_key"] != b["wrapped_aes_key"] and a["ciphertext"] != b["ciphertext"]


def test_weak_rsa_public_keys_are_rejected():
    weak = rsa.generate_private_key(public_exponent=65537, key_size=1024).public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    _, _, hospital, pdf = _fixture()
    with pytest.raises(ValueError):
        encrypt_report(pdf, weak, hospital)
