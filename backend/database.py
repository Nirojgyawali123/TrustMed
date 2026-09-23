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
        ("collectors", "citizenship_details", "VARCHAR"),
    ]
    with engine.connect() as conn:
        for table, column, col_type in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                conn.commit()
            except Exception:
                pass  # Column already exists


def seed_admin():
    import bcrypt
    from backend.models import Account
    db = SessionLocal()
    try:
        existing = db.query(Account).filter(Account.username == "niroj").first()
        if not existing:
            hashed = bcrypt.hashpw(b"niroj", bcrypt.gensalt()).decode("utf-8")
            admin = Account(username="niroj", password=hashed, role="admin", full_name="Admin")
            db.add(admin)
            db.commit()
    finally:
        db.close()