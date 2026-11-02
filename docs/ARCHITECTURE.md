# SecureLab Architecture

## Components

- **React/Vite:** presentation layer, patient key generation, encrypted key-file handling, patient-side decryption and signature verification.
- **Flask API:** authentication, role checks, patient public-key registration, report processing and audit events.
- **SQLAlchemy database:** identity records, patient public keys, report metadata and audit trail.
- **Encrypted object/file storage:** ciphertext only; plaintext reports are processed in memory and are not persisted by the API.

## Trust boundaries

1. Browser to API: use HTTPS outside localhost. API JWT is held in React memory.
2. Patient browser to local key file: private key is protected by a passphrase-derived key; never transmit the private key.
3. Laboratory upload to backend: lab staff are trusted to submit the correct report for the selected patient. The backend validates the target patient and encrypts before writing to disk.
4. Backend storage: storage operators can see metadata and ciphertext but, absent the patient's private key, cannot unwrap the per-report AES key.
5. Hospital signing key: the signing key authenticates the issuing laboratory/system. Compromise of this key undermines authenticity; use an HSM/KMS in production.

## Report data model

Each report record contains a UUID, patient foreign key, uploading staff foreign key, report title/type, original filename, encrypted file path, RSA-wrapped AES key, AES-GCM nonce, RSA-PSS signature, SHA-256 digest and creation timestamp. The encrypted PDF file contains AES-GCM ciphertext plus its authentication tag.

## Sequence

```mermaid
sequenceDiagram
    participant P as Patient Browser
    participant API as Flask API
    participant DB as Database / Ciphertext Storage
    participant L as Lab Browser
    P->>P: Generate RSA-OAEP key pair
    P->>P: Encrypt private key file with PBKDF2 + AES-GCM
    P->>API: Register RSA public key
    API->>DB: Store patient public key
    L->>API: Upload PDF + patient email
    API->>API: Generate random AES-256 key and nonce
    API->>API: AES-256-GCM encrypt PDF
    API->>API: RSA-OAEP wrap AES key
    API->>API: RSA-PSS sign original PDF
    API->>DB: Store ciphertext + cryptographic metadata
    P->>P: Unlock encrypted private key file
    P->>API: Request own report ciphertext
    API->>P: Ciphertext + wrapped AES key + signature + digest
    P->>P: RSA unwrap, AES decrypt, SHA-256 and RSA-PSS verify
    P->>P: Open PDF only after successful checks
```
