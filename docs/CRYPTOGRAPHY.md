# Cryptographic Design

| Primitive | Parameters | Purpose |
|---|---|---|
| RSA-OAEP | 2048-bit patient key, SHA-256, MGF1-SHA-256 | Wrap one random AES key per report |
| AES-GCM | 256-bit key, 96-bit nonce, 128-bit tag | Encrypt PDF and authenticate ciphertext |
| RSA-PSS | 3072-bit hospital signing key, SHA-256, 32-byte salt | Authenticate original report bytes |
| SHA-256 | 256-bit digest | Independent report fingerprint check |
| PBKDF2 | HMAC-SHA-256, 310,000 iterations, random 128-bit salt | Derive the key protecting the patient's local private-key file |
| AES-GCM | 256-bit derived key, random 96-bit IV | Protect the exported PKCS#8 patient private key |
| scrypt | Werkzeug password hashing | Store account password verifiers |
| TOTP | RFC 6238, time-based 6-digit codes | Optional second authentication factor |

## Why hybrid encryption?

RSA is used for the small AES key, not for the full PDF. AES-GCM efficiently handles arbitrary report sizes and provides authenticated encryption. A fresh AES key and nonce are generated for every report.

## Separation of functions

- **Confidentiality:** AES-256-GCM encrypts the PDF; RSA-OAEP protects its AES key.
- **Integrity:** GCM authenticates the encrypted payload; SHA-256 is compared after decryption.
- **Authenticity / non-repudiation demonstration:** the hospital signing private key signs the original report using RSA-PSS; the patient verifies using the corresponding public key.
- **Key protection:** the patient RSA private key is encrypted locally and not uploaded to the server.

## Important operational caveats

- Never reuse an AES-GCM nonce with the same AES key. SecureLab generates a fresh key and nonce for every report.
- Keep RSA encryption and signature key pairs separate. OAEP is for encryption; PSS is for signatures.
- The hospital signing public key must be authenticated out-of-band or anchored in a trusted certificate/PKI in a real system. Fetching it from the same API is sufficient only for a controlled academic demo, not a strong independent trust model.
- The demo's local hospital signing key is unencrypted on disk. Production must use HSM/KMS with access controls, rotation, backup and audit.
- Loss of the patient private-key file or passphrase makes previously encrypted reports unrecoverable unless a reviewed recovery mechanism exists.
