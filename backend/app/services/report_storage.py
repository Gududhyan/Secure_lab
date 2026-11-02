import os
from pathlib import Path


def save_ciphertext(storage_dir: str, report_id: str, ciphertext: bytes) -> str:
    root = Path(storage_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{report_id}.pdf.enc"
    # Write atomically so an interrupted upload does not leave a partial file.
    temporary = root / f".{report_id}.tmp"
    temporary.write_bytes(ciphertext)
    os.replace(temporary, path)
    return str(path)


def read_ciphertext(path: str) -> bytes:
    return Path(path).read_bytes()


def delete_ciphertext(path: str) -> None:
    try:
        Path(path).unlink()
    except FileNotFoundError:
        pass
