# app/database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 1. Define the database URL (SQLite creates a local file named techmed.db)
SQLALCHEMY_DATABASE_URL = "sqlite:///./techmed.db"

# 2. Create the engine
# connect_args is needed only for SQLite
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# 3. Create a configured "Session" class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. Create the Base class that your models will inherit from
Base = declarative_base()

# 5. Helper function to get the database session for FastAPI dependencies
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()