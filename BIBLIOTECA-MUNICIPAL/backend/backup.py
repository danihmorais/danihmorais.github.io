from datetime import datetime, timezone
from pathlib import Path
import os
import sqlite3

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "BIBLIOTECA-MUNICIPAL" / "data"
DB_PATH = DATA_DIR / "biblioteca.db"
BACKUP_DIR = Path(os.getenv("BIBLIOTECA_BACKUP_DIR", "/mnt/c/Users/servidor/Biblioteca-Backups"))
RETENTION_DAYS = 30


def backup_database():
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Banco não encontrado: {DB_PATH}")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d")
    backup_path = BACKUP_DIR / f"biblioteca-{stamp}.db"

    source = sqlite3.connect(DB_PATH, timeout=60)
    target = sqlite3.connect(backup_path, timeout=60)

    try:
        with target:
            source.backup(target, pages=256, sleep=0.1)
    finally:
        target.close()
        source.close()

    cutoff = datetime.now().timestamp() - RETENTION_DAYS * 86400
    for path in BACKUP_DIR.glob("biblioteca-*.db"):
        try:
            if path != backup_path and path.stat().st_mtime < cutoff:
                path.unlink()
        except FileNotFoundError:
            pass

    return backup_path


if __name__ == "__main__":
    path = backup_database()
    print(f"Backup concluído: {path}")
