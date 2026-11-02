# SecureLab Test Plan

## Automated tests

From `backend/` after installing `requirements-dev.txt`:

```bash
pytest -q
```

- Hybrid encryption round trip: RSA-OAEP unwraps the AES key, AES-GCM recovers the original bytes, SHA-256 matches, and RSA-PSS signature verifies.
- API ownership check: the intended patient can retrieve their encrypted report payload; another patient receives HTTP 403.

## Manual demonstration tests

| Test | Procedure | Expected result |
|---|---|---|
| Patient registration | Register a new patient | Patient account created |
| Public-key registration | Generate key in browser | API shows encryption key registered |
| Private-key secrecy | Inspect requests/database | Private key is not transmitted or stored by API |
| TOTP | Enable MFA and sign in again | Correct code required after password |
| PDF encryption | Upload sample PDF as lab | Ciphertext stored; encrypted badge shown |
| Patient decryption | Unlock key file and open report | PDF opens after all verifications pass |
| Wrong private key | Unlock a different patient's key file | RSA unwrap fails; no PDF is opened |
| Wrong passphrase | Attempt to unlock key file | Key-file authentication fails |
| Ciphertext tampering | Modify a stored `.pdf.enc` file | AES-GCM authentication fails |
| Signature tampering | Alter signature metadata in DB | RSA-PSS verification fails |
| Cross-patient access | Use a second patient account on first report ID | HTTP 403 |
| Role enforcement | Call admin endpoint as patient | HTTP 403 |

Use synthetic PDFs and accounts. Do not use real health records.
