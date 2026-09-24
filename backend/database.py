# backend/database.py
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Render provides DATABASE_URL for Postgres; fallback to local SQLite
_db_url = os.getenv("DATABASE_URL", "sqlite:///./techmed.db")
# Render Postgres URL may be postgres://, SQLAlchemy needs postgresql://
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)
SQLALCHEMY_DATABASE_URL = _db_url

if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_schema():
    """Add new columns to existing tables if they don't exist."""
    migrations = [
        ("accounts", "full_name", "VARCHAR"),
        ("accounts", "dob", "VARCHAR"),
        ("accounts", "address", "VARCHAR"),
        ("accounts", "phone", "VARCHAR"),
        ("accounts", "citizenship", "VARCHAR"),
        ("accounts", "email", "VARCHAR"),
        ("victims", "account_id", "INTEGER"),
        ("victims", "case_id", "VARCHAR"),
        ("victims", "patient_photo", "VARCHAR"),
        ("victims", "note_to_donors", "TEXT"),
        ("victims", "rejected", "BOOLEAN"),
        ("victims", "rejection_reason", "VARCHAR"),
        ("victims", "rejected_by", "VARCHAR"),
        ("victims", "hospital_logo", "VARCHAR"),
        ("victims", "municipality_logo", "VARCHAR"),
        ("victims", "created_at", "TIMESTAMP"),
        ("victims", "bank_qr", "VARCHAR"),
        ("victims", "other_hospital_name", "VARCHAR"),
        ("victims", "other_hospital_address", "VARCHAR"),
        ("victims", "other_hospital_contact", "VARCHAR"),
        ("victims", "citizenship_doc", "VARCHAR"),
        ("collectors", "citizenship_details", "VARCHAR"),
    ]
    with engine.connect() as conn:
        for table, column, col_type in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                conn.commit()
            except Exception:
                pass  # Column already exists


def _ensure_indexes_and_seed_settings():
    """Create unique indexes for phone/email/citizenship where possible + seed default smtp sender."""
    from sqlalchemy import text as _text
    with engine.connect() as conn:
        # Use CREATE UNIQUE INDEX IF NOT EXISTS — will fail if duplicate data exists; we handle gracefully
        for sql in [
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_accounts_email ON accounts(email)",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_accounts_phone ON accounts(phone)",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_accounts_citizenship ON accounts(citizenship)",
        ]:
            try:
                conn.execute(_text(sql))
                conn.commit()
            except Exception:
                pass
    # Seed AppSettings default sender
    try:
        from backend.models import AppSettings
        db = SessionLocal()
        try:
            existing = db.query(AppSettings).filter(AppSettings.key == "smtp_from_email").first()
            if not existing:
                s = AppSettings(key="smtp_from_email", value="nirojgyawali45@gmail.com", updated_by="system")
                db.add(s)
                db.commit()
        finally:
            db.close()
    except Exception:
        pass


def _migrate_phone_decrypt():
    """One-time: existing Account.phone values are Fernet ciphertext; decrypt to plaintext so UNIQUE works."""
    try:
        from backend.crypto import decrypt as _dec
        from backend.models import Account as _Acc
        db = SessionLocal()
        try:
            rows = db.query(_Acc).all()
            changed = False
            seen = set()
            for r in rows:
                raw = r.__dict__.get("phone") or r.phone  # may already be decrypted via type, but we now use plain String
                # If phone came through old EncryptedString type, it may already be decrypted; but now column is String plain, so raw is ciphertext if not yet migrated
                # Attempt to decrypt; if decrypt returns different, save plaintext
                if raw:
                    try:
                        dec = _dec(raw)
                        # decrypt returns input if already plaintext — detect ciphertext pattern (Fernet tokens start with gAAAAA)
                        if dec != raw and dec and dec not in seen:
                            # Check duplicates after decrypt — keep first
                            r.phone = dec
                            changed = True
                        elif raw and raw.startswith("gAAAAA"):
                            # try decrypt again with direct
                            try:
                                dec2 = _dec(raw)
                                if dec2 and dec2 != raw:
                                    r.phone = dec2
                                    changed = True
                            except Exception:
                                pass
                    except Exception:
                        pass
                    if r.phone:
                        seen.add(r.phone)
            if changed:
                db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"phone decrypt migration skipped: {e}")


def seed_admin():
    import bcrypt
    from backend.models import Account
    db = SessionLocal()
    try:
        existing = db.query(Account).filter(Account.username == "niroj").first()
        if not existing:
            hashed = bcrypt.hashpw(b"niroj", bcrypt.gensalt()).decode("utf-8")
            admin = Account(username="niroj", password=hashed, role="admin", full_name="Admin", email="nirojgyawali45@gmail.com")
            db.add(admin)
            db.commit()
        else:
            # Ensure admin has email if missing
            if not existing.email:
                existing.email = "nirojgyawali45@gmail.com"
                db.commit()
    finally:
        db.close()