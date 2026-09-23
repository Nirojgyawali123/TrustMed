from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean, DateTime, Text, TypeDecorator
from sqlalchemy.orm import relationship
from backend.database import Base
from datetime import datetime
from backend.crypto import encrypt, decrypt


class EncryptedString(TypeDecorator):
    impl = String

    def process_bind_param(self, value, dialect):
        if value is not None:
            return encrypt(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            return decrypt(value)
        return value


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    dob = Column(String, nullable=True)
    address = Column(String, nullable=True)
    phone = Column(EncryptedString(255), nullable=True)
    citizenship = Column(String, unique=True, nullable=True)


class Victim(Base):
    __tablename__ = "victims"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    case_id = Column(String, unique=True, nullable=True)

    name = Column(String, nullable=False)
    phone = Column(EncryptedString(255), nullable=False)
    address = Column(String, nullable=False)
    disease = Column(String, nullable=False)
    hospital_name = Column(String, nullable=False)
    municipality_name = Column(String, nullable=False)
    estimated_cost = Column(Float, nullable=False)
    total_collected = Column(Float, default=0.0)
    patient_photo = Column(String, nullable=True)
    note_to_donors = Column(Text, nullable=True)

    bank_name = Column(String, nullable=False)
    bank_account_number = Column(EncryptedString(255), nullable=False)
    bank_account_holder = Column(String, nullable=False)
    bank_branch = Column(String, nullable=False)
    bank_qr = Column(String, nullable=True)

    hospital_verified = Column(Boolean, default=False)
    muni_verified = Column(Boolean, default=False)
    paused = Column(Boolean, default=False)
    rejected = Column(Boolean, default=False)
    rejection_reason = Column(String, nullable=True)
    rejected_by = Column(String, nullable=True)

    hospital_logo = Column(String, nullable=True)
    municipality_logo = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", backref="victims")
    collectors = relationship("Collector", back_populates="victim", cascade="all, delete-orphan")
    medical_reports = relationship("MedicalReport", back_populates="victim", cascade="all, delete-orphan")


class Collector(Base):
    __tablename__ = "collectors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    relation_to_victim = Column(String, nullable=False)
    contact = Column(EncryptedString(255), nullable=False)
    photo = Column(String, nullable=True)
    citizenship_details = Column(EncryptedString(255), nullable=True)

    victim_id = Column(Integer, ForeignKey("victims.id"))
    victim = relationship("Victim", back_populates="collectors")


class MedicalReport(Base):
    __tablename__ = "medical_reports"

    id = Column(Integer, primary_key=True, index=True)
    victim_id = Column(Integer, ForeignKey("victims.id"), nullable=False)
    filename = Column(String, nullable=False)
    original_name = Column(String, nullable=False)

    victim = relationship("Victim", back_populates="medical_reports")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, nullable=False)
    actor = Column(String, nullable=False)
    actor_role = Column(String, nullable=False)
    victim_id = Column(Integer, nullable=True)
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
