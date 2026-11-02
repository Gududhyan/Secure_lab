# SecureLab Threat Model (Academic Prototype)

## Assets

- Patient report content and report metadata.
- Patient RSA private key and its passphrase.
- Patient RSA public keys.
- Hospital digital-signing private key.
- User credentials, TOTP secrets and access tokens.
- Audit events.

## Threat actors

- Unauthenticated internet user.
- Authenticated patient attempting cross-patient access.
- Compromised laboratory or administrator account.
- Storage/database operator without patient private keys.
- Attacker modifying report ciphertext or metadata.
- Attacker stealing a patient's key file.

## Controls implemented

| Threat | Implemented control | Residual risk |
|---|---|---|
| Read stored report file | AES-256-GCM + patient-specific RSA-OAEP key wrapping | Patient private key compromise defeats confidentiality |
| Modify ciphertext | AES-GCM authentication tag | API/storage availability can still be attacked |
| Forge/modify original report | Hospital RSA-PSS signature and SHA-256 verification | Hospital signing key compromise enables forged signatures |
| Patient A reads Patient B report | Patient ownership check on payload endpoint | Backend/application compromise may bypass controls |
| Password guessing | scrypt password hashing + Flask-Limiter login limit | Distributed credential stuffing needs additional controls |
| Stolen password | Optional TOTP MFA | Phishing and endpoint compromise remain possible |
| Publicly exposed upload folder | Encrypted files stored outside frontend/public directory | Host access and backups still need protection |
| Untrusted PDF upload | PDF signature and size checks | Not a malware scanner; production needs scanning/sandboxing |

## Out of scope / future hardening

- Independent certificate authority or PKI trust anchor for the hospital signing public key.
- HSM/KMS-backed signing key, key rotation and disaster recovery.
- Encrypted TOTP secret storage and stronger MFA lifecycle controls.
- Password reset, account recovery, patient key rotation and revocation.
- Clinician delegation, consent, emergency access and access expiration.
- Tamper-evident/append-only remote audit logging.
- Formal security testing, dependency scanning, penetration testing and compliance review.
