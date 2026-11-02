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
