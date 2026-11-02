# SecureLab — RSA + AES Encrypted Hospital Lab Report Portal

A full-stack academic project for **Cryptography & Network Security**. SecureLab provides patient, laboratory-staff and administrator portals. Laboratory staff upload PDF reports; the backend encrypts each PDF with AES-256-GCM, wraps the AES key with the patient's RSA public key, and signs the original PDF with the hospital's RSA-PSS signing key. Patients unlock an encrypted private-key file in their browser and decrypt/verify reports locally.

> **Academic prototype only.** Do not use real patient information or deploy this build for clinical use. It has not undergone a security audit, privacy impact assessment or clinical validation.

## Project highlights

- React + Vite frontend with patient, laboratory and admin workspaces.
- Python Flask REST API and SQLAlchemy persistence.
- Patient RSA-2048 key pair generated in the browser with Web Crypto.
- Patient private key encrypted locally using PBKDF2-HMAC-SHA-256 + AES-256-GCM and downloaded as a `.securelabkey` file. The private key is never sent to the API.
- Per-report AES-256-GCM encryption with a fresh random 256-bit key and 96-bit nonce.
- RSA-OAEP with SHA-256 wraps the report's AES key for the patient's RSA public key.
- Hospital RSA-PSS with SHA-256 digitally signs the original PDF.
- Patient-side decryption checks the AES-GCM authentication tag, recomputes SHA-256, and verifies the hospital's RSA-PSS signature before opening the PDF.
- Password hashing with Werkzeug scrypt, JWT API authentication, login rate limiting, role checks, TOTP MFA, and audit logs.
- SQLite by default; PostgreSQL is supported through `DATABASE_URL`.

## Architecture

```text
 React browser
 ├── Patient portal
 │    ├── Generate RSA-OAEP key pair
 │    ├── Encrypt private key file locally (PBKDF2 + AES-GCM)
 │    ├── Unlock private key locally
 │    └── Decrypt AES key + PDF; verify SHA-256 and RSA-PSS
 ├── Laboratory portal
 │    └── Upload source PDF for a selected patient's public key
 └── Admin portal
      └── Staff provisioning + audit review
             │ HTTPS in deployment / HTTP localhost in development
             ▼
 Flask REST API
 ├── Authentication / role-based access / TOTP
 ├── Report encryption: AES-256-GCM
 ├── AES key wrapping: RSA-OAEP / SHA-256
 ├── Report signing: hospital RSA-PSS / SHA-256
 └── Audit events
       │
       ├── SQL database: users, public keys, report metadata, audit events
       └── Private file storage: encrypted PDF ciphertext only
```

### Cryptographic flow

1. A patient registers and signs in.
2. In the patient's browser, Web Crypto generates an RSA-2048 OAEP key pair.
3. The public key is registered with the API. The PKCS#8 private key is encrypted locally using a passphrase-derived AES-256-GCM key (PBKDF2-HMAC-SHA-256, 310,000 iterations) and downloaded as a `.securelabkey` file.
4. Laboratory staff select the patient's account and upload a PDF.
5. The backend generates a fresh AES-256 key and nonce, encrypts the PDF using AES-256-GCM, wraps the AES key using the patient's RSA public key and RSA-OAEP/SHA-256, and signs the original PDF using the hospital's RSA-PSS/SHA-256 key.
6. The server stores only the encrypted PDF, wrapped AES key, nonce, SHA-256 digest, signature and report metadata. The plaintext PDF is not written to disk by this application.
7. The patient selects their `.securelabkey` file and enters its passphrase. The browser decrypts and imports the private key, unwraps the AES key, decrypts the PDF, checks its SHA-256 digest and verifies the hospital's digital signature. Only after all checks pass does the browser open the PDF.

## Requirements

- Python 3.10 or later (Python 3.11/3.12 recommended).
- Node.js 20 or later and npm.
- A modern browser with Web Crypto support. `localhost` is treated as a secure context; deployed use requires HTTPS.

## Run locally on Windows

Open two terminals in the `SecureLab` folder.

### 1. Backend (Terminal 1)

PowerShell:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env`. At minimum, replace `SECRET_KEY` and `JWT_SECRET_KEY` with long random values (generate values with `python -c "import secrets; print(secrets.token_hex(32))"`). For a local demonstration, the example demo credentials can be retained, but change them before sharing the environment.

Create the demo administrator and laboratory staff accounts, then start the API:

```powershell
flask --app run.py seed-demo
python run.py
```

Backend health check: `http://127.0.0.1:5000/api/health`

### 2. Frontend (Terminal 2)

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173`.

### Demo staff accounts

The values below match `backend/.env.example`. Use the values from your own `.env` if you changed them.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@securelab.local` | `AdminDemo!2026` |
| Laboratory staff | `lab@securelab.local` | `LabDemo!2026` |

Register a patient account from the login screen. For a quick lab upload demonstration, use the synthetic sample file `docs/synthetic-demo-lab-report.pdf`. Do not use actual patient data.

## Demonstration sequence

1. **Register a patient:** create a patient account with a valid email and password.
2. **Create the patient key:** sign in as the patient, enter a strong 12+ character key-file passphrase, and generate the RSA key pair. Save the downloaded `.securelabkey` file in a safe location. The API receives only the public key.
3. **Enable MFA:** use the authenticator setup card and add its secret to an authenticator app (e.g. Google Authenticator or Microsoft Authenticator). Enter the 6-digit code to enable TOTP. The next login requires the authenticator code.
4. **Upload a report:** sign out, sign in as laboratory staff, search for the patient, select the patient with an encryption key, add report details, and upload a synthetic PDF.
5. **Decrypt and verify:** sign out, sign in as the patient (enter TOTP if enabled), unlock the `.securelabkey` file, and select **Decrypt & verify report**. The app opens the PDF only after AES-GCM authentication, SHA-256 comparison and RSA-PSS signature verification succeed.
6. **Review administration:** sign in as administrator to create staff accounts and inspect audit events.
7. **Demonstrate access control:** sign in as a second patient and confirm that the first patient's report payload endpoint returns HTTP 403.

## API overview

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Patient registration |
| `POST` | `/api/auth/login` | Public | Password + optional TOTP login |
| `GET` | `/api/auth/me` | Authenticated | Current account |
| `POST` | `/api/auth/mfa/setup` | Authenticated | Start TOTP setup |
| `POST` | `/api/auth/mfa/enable` | Authenticated | Confirm and enable TOTP |
| `GET` | `/api/keys/status` | Authenticated | Check patient public-key status |
| `POST` | `/api/keys/register` | Patient | Register RSA public key |
| `GET` | `/api/keys/hospital-public` | Public | Obtain hospital signing public key |
| `GET` | `/api/lab/patients` | Lab/Admin | Search patients eligible for upload |
| `POST` | `/api/reports/upload` | Lab/Admin | Encrypt and upload PDF |
| `GET` | `/api/reports` | Authenticated | List role-appropriate report metadata |
| `GET` | `/api/reports/{id}/payload` | Owning patient | Retrieve ciphertext and crypto metadata |
| `GET` | `/api/admin/overview` | Admin | Dashboard counters |
| `POST` | `/api/admin/staff` | Admin | Create lab/admin account |
| `GET` | `/api/admin/users` | Admin | List staff accounts |
| `GET` | `/api/admin/audit-logs` | Admin | Review audit trail |

## Database

SQLite is the default and requires no separate server. To use PostgreSQL, create a database and change `DATABASE_URL` in `backend/.env`, for example:

```env
DATABASE_URL=postgresql+psycopg://securelab_user:your-password@localhost:5432/securelab
```

The schema is created automatically on first startup. The current academic build uses `db.create_all()`; use Alembic/Flask-Migrate migrations before evolving a production schema.

## Security notes and known limitations

- The hospital signing private key is generated locally under `backend/instance/signing_keys/` on first run. This is for reproducible demonstrations only. In production, keep the signing key in an HSM or managed key service, define key rotation and recovery, and never store an unprotected signing key beside application code.
- The patient private key is not uploaded to the backend. If the `.securelabkey` file and its passphrase are both lost, this prototype cannot recover the patient's reports. Implement a formally designed recovery/escrow process only after a threat-model review.
- TOTP secrets are stored in the development database for this prototype. Production systems must encrypt MFA secrets at rest and protect them with a managed key service.
- JWTs are kept in React memory, not localStorage. Reloading the page signs the user out; this reduces persistent token exposure in this demo.
- The demo does not implement email/SMS delivery, password reset, patient key rotation, delegated clinician access, emergency break-glass access, consent workflows, FHIR integration, or a formal privacy/compliance program.
- CORS is restricted to `FRONTEND_ORIGIN`. Configure HTTPS, secure reverse-proxy headers, rate limits, backups, monitoring, database access controls, malware scanning and secrets management before any non-local deployment.
- Upload validation checks the PDF header and size; production should add hardened PDF parsing, malware scanning and content-disarm/reconstruction where appropriate.
- Audit logs are application-level records, not tamper-proof forensic evidence. Production should forward them to an append-only central logging system.
- Medical records are sensitive personal data. Use synthetic/sample reports for this academic demonstration and obtain institutional approval before any real-data testing.

## Project structure

```text
SecureLab/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CRYPTOGRAPHY.md
│   ├── THREAT_MODEL.md
│   └── TEST_PLAN.md
├── backend/
│   ├── app/
│   │   ├── routes/          # Auth, keys, reports, lab, admin APIs
│   │   ├── services/        # Cryptography, encrypted storage, audit
│   │   ├── models.py
│   │   └── commands.py
│   ├── tests/
│   ├── config.py
│   ├── run.py
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── api.js
    │   ├── crypto.js        # Browser key generation, decryption, verification
    │   ├── main.jsx
    │   └── styles.css
    ├── package.json
    └── vite.config.js
```
