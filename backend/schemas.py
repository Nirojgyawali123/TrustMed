from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginResponse(BaseModel):
    id: int
    username: str
    role: str
    access_token: str
    token_type: str = "bearer"


class SignupRequest(BaseModel):
    username: str
    password: str


class PatientSignupRequest(BaseModel):
    username: str
    password: str
    full_name: str
    dob: str
    address: str
    phone: str
    citizenship: str
    email: EmailStr


class PatientSignupResponse(BaseModel):
    id: int
    username: str
    role: str
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordStep1(BaseModel):
    citizenship: str
    phone: str


class ForgotPasswordStep3(BaseModel):
    citizenship: str
    phone: str
    new_password: str


# New forgot flow (5-field verification + email OTP)
class ForgotRequest(BaseModel):
    full_name: str
    phone: str
    citizenship: str
    email: EmailStr
    address: str


class ForgotVerify(BaseModel):
    email: EmailStr
    otp: str


class ForgotReset(BaseModel):
    email: EmailStr
    otp: str
    new_password: str


class ForgotResetWithToken(BaseModel):
    reset_token: str
    new_password: str


class AdminCreateRequest(BaseModel):
    username: str
    password: str
    role: str
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    citizenship: Optional[str] = None
    address: Optional[str] = None


class AccountResponse(BaseModel):
    id: int
    username: str
    role: str
    full_name: Optional[str] = None
    dob: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    citizenship: Optional[str] = None
    email: Optional[str] = None

    class Config:
        from_attributes = True


class AppSettingsResponse(BaseModel):
    key: str
    value: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AppSettingsUpdate(BaseModel):
    value: str


class PasswordChangeRequestCreate(BaseModel):
    reason: Optional[str] = None


class PasswordChangeRequestResponse(BaseModel):
    id: int
    account_id: int
    username: str
    role: str
    status: str
    reason: Optional[str] = None
    requested_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CollectorCreate(BaseModel):
    name: str
    address: str
    relation_to_victim: str
    contact: str
    citizenship_details: Optional[str] = None


class CollectorResponse(CollectorCreate):
    id: int
    victim_id: int
    photo: Optional[str] = None

    class Config:
        from_attributes = True


class MedicalReportResponse(BaseModel):
    id: int
    victim_id: int
    filename: str
    original_name: str

    class Config:
        from_attributes = True


class VictimCreate(BaseModel):
    name: str
    phone: str
    address: str
    disease: str
    hospital_name: str
    municipality_name: str
    estimated_cost: float
    bank_name: str
    bank_account_number: str
    bank_account_holder: str
    bank_branch: str
    note_to_donors: Optional[str] = None
    collectors: Optional[List[CollectorCreate]] = None
    other_hospital_name: Optional[str] = None
    other_hospital_address: Optional[str] = None
    other_hospital_contact: Optional[str] = None


class VictimResponse(BaseModel):
    id: int
    account_id: Optional[int] = None
    case_id: Optional[str] = None
    name: str
    phone: str
    address: str
    disease: str
    hospital_name: str
    municipality_name: str
    estimated_cost: float
    total_collected: float
    patient_photo: Optional[str] = None
    note_to_donors: Optional[str] = None
    bank_name: str
    bank_account_number: str
    bank_account_holder: str
    bank_branch: str
    bank_qr: Optional[str] = None
    citizenship_doc: Optional[str] = None
    other_hospital_name: Optional[str] = None
    other_hospital_address: Optional[str] = None
    other_hospital_contact: Optional[str] = None
    hospital_verified: bool
    muni_verified: bool
    paused: bool = False
    rejected: bool = False
    rejection_reason: Optional[str] = None
    rejected_by: Optional[str] = None
    hospital_logo: Optional[str] = None
    municipality_logo: Optional[str] = None
    created_at: Optional[datetime] = None
    age: Optional[int] = None
    collectors: List[CollectorResponse] = []
    medical_reports: List[MedicalReportResponse] = []

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    id: int
    action: str
    actor: str
    actor_role: str
    victim_id: Optional[int] = None
    details: Optional[str] = None
    timestamp: Optional[datetime] = None

    class Config:
        from_attributes = True
