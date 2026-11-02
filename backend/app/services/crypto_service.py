import base64
import hashlib
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


OAEP_PADDING = padding.OAEP(
    mgf=padding.MGF1(algorithm=hashes.SHA256()),
    algorithm=hashes.SHA256(),
    label=None,
)


def b64e(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def b64d(value: str) -> bytes:
    return base64.b64decode(value, validate=True)


def load_and_validate_rsa_public_key(pem: str):
    try:
        key = serialization.load_pem_public_key(pem.encode("utf-8"))
    except Exception as exc:
        raise ValueError("Invalid PEM public key") from exc
    if not isinstance(key, rsa.RSAPublicKey) or key.key_size < 2048:
        raise ValueError("A minimum 2048-bit RSA public key is required")
    return key


def encrypt_report(pdf_bytes: bytes, patient_public_key_pem: str, signing_private_key):
    """Encrypt PDF with AES-256-GCM and wrap the random AES key using RSA-OAEP."""
    public_key = load_and_validate_rsa_public_key(patient_public_key_pem)
    aes_key = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(12)
    ciphertext = AESGCM(aes_key).encrypt(nonce, pdf_bytes, None)
    wrapped_key = public_key.encrypt(aes_key, OAEP_PADDING)
    signature = signing_private_key.sign(
        pdf_bytes,
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=32),
        hashes.SHA256(),
    )
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    return {
        "ciphertext": ciphertext,
        "wrapped_aes_key": b64e(wrapped_key),
        "nonce": b64e(nonce),
        "signature": b64e(signature),
        "sha256_hex": digest,
    }


def ensure_hospital_signing_key(directory: str):
    """Create a local demo signing key if one does not exist. Protect this directory in production."""
    path = Path(directory)
    path.mkdir(parents=True, exist_ok=True)
    private_path = path / "hospital_signing_private.pem"
    public_path = path / "hospital_signing_public.pem"
    if private_path.exists() and public_path.exists():
        private_key = serialization.load_pem_private_key(private_path.read_bytes(), password=None)
        public_pem = public_path.read_text("utf-8")
        return private_key, public_pem

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    private_path.write_bytes(private_pem)
    public_path.write_text(public_pem, encoding="utf-8")
    try:
        os.chmod(private_path, 0o600)
    except OSError:
        pass
    return private_key, public_pem
