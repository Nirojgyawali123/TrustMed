import os
import uuid
import shutil
import time
from collections import defaultdict
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File, Query, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
from jose import JWTError, jwt
import bcrypt

from backend import crud, models, schemas, database, pdf as pdfgen
from backend.config import JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

# ──────────────────────────────────────────
# Simple in-memory rate limiter
# ──────────────────────────────────────────

_rate_store = defaultdict(list)

def rate_limit(max_per_minute: int = 20):
    def limiter(request: Request):
        client = request.client.host if request.client else "unknown"
        key = f"{client}:{request.url.path}"
        now = time.time()
        window = now - 60
        _rate_store[key] = [t for t in _rate_store[key] if t > window]
        if len(_rate_store[key]) >= max_per_minute:
            raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")
        _rate_store[key].append(now)
        return True
    return limiter

# ──────────────────────────────────────────
# File upload validation (magic bytes)
# ──────────────────────────────────────────

ALLOWED_IMAGE_SIGNATURES = [
    (b'\xff\xd8\xff', 'JPEG'),
    (b'\x89PNG\r\n\x1a\n', 'PNG'),
    (b'GIF87a', 'GIF'),
    (b'GIF89a', 'GIF'),
    (b'RIFF', 'WEBP'),
]
ALLOWED_DOC_SIGNATURES = [
    (b'%PDF', 'PDF'),
]

def check_file_mime(file_bytes: bytes, allow_pdf: bool = False) -> str:
    for sig, name in ALLOWED_IMAGE_SIGNATURES:
        if file_bytes.startswith(sig):
            if name == 'WEBP' and file_bytes[8:12] != b'WEBP':
                break
            return name
    if allow_pdf:
        for sig, name in ALLOWED_DOC_SIGNATURES:
            if file_bytes.startswith(sig):
                return name
    raise HTTPException(status_code=400, detail=f"File type not allowed. Must be JPEG, PNG, GIF, or WebP{' or PDF' if allow_pdf else ''}.")

def save_uploaded_file(file: UploadFile, subdir: str, max_mb: int = 5, allow_pdf: bool = False) -> str:
    contents = file.file.read()
    if len(contents) > max_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large. Max {max_mb} MB.")
    file_type = check_file_mime(contents[:64], allow_pdf=allow_pdf)
    ext_map = {'JPEG': '.jpg', 'PNG': '.png', 'GIF': '.gif', 'WEBP': '.webp', 'PDF': '.pdf'}
    ext = ext_map.get(file_type, '.bin')
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, subdir, unique_name)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "wb") as f:
        f.write(contents)
    return f"{subdir}/{unique_name}"

models.Base.metadata.create_all(bind=database.engine)
database.migrate_schema()
database.seed_admin()

backend = FastAPI(title="TrustMed API")

backend.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "reports"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "collectors"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "photos"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "logos"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "qrcodes"), exist_ok=True)

backend.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@backend.get("/")
def health():
    return {"status": "ok", "service": "TrustMed API"}

@backend.get("/health")
def health_check():
    return {"status": "ok"}

security = HTTPBearer(auto_error=False)


# ──────────────────────────────────────────
# JWT helpers
# ──────────────────────────────────────────

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_auth_user: Optional[str] = Header(None),
    x_auth_pass: Optional[str] = Header(None),
    db: Session = Depends(database.get_db),
) -> models.Account:
    if credentials:
        token = credentials.credentials
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            sub_val = payload.get("sub")
            if sub_val is None:
                raise HTTPException(status_code=401, detail="Invalid token")
            user_id = int(sub_val)
            account = db.query(models.Account).filter(models.Account.id == user_id).first()
            if account is None:
                raise HTTPException(status_code=401, detail="User not found")
            return account
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

    if x_auth_user and x_auth_pass:
        account = db.query(models.Account).filter(models.Account.username == x_auth_user).first()
        if not account or account.password != x_auth_pass:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return account

    raise HTTPException(status_code=401, detail="Authentication required. Provide Bearer token or X-Auth-User / X-Auth-Pass headers.")


def require_role(*roles: str):
    def checker(account: models.Account = Depends(get_current_user)):
        if account.role not in roles:
            raise HTTPException(status_code=403, detail=f"Requires one of roles: {', '.join(roles)}")
        return account
    return checker


# ──────────────────────────────────────────
# Auth endpoints
# ──────────────────────────────────────────

@backend.post("/auth/login", response_model=schemas.LoginResponse)
def login(req: schemas.LoginRequest, db: Session = Depends(database.get_db), _: bool = Depends(rate_limit(20))):
    account = db.query(models.Account).filter(models.Account.username == req.username).first()
    if not account or not bcrypt.checkpw(req.password.encode("utf-8"), account.password.encode("utf-8")):
        crud.log_action(db, "login_failed", req.username, "unknown")
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token({"sub": str(account.id), "username": account.username, "role": account.role})
    crud.log_action(db, "login_success", req.username, account.role)
    return schemas.LoginResponse(id=account.id, username=account.username, role=account.role, access_token=token)


@backend.post("/auth/signup", response_model=schemas.PatientSignupResponse)
def signup(req: schemas.PatientSignupRequest, db: Session = Depends(database.get_db), _: bool = Depends(rate_limit(5))):
    existing_user = db.query(models.Account).filter(models.Account.username == req.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already taken")
    existing_cit = db.query(models.Account).filter(models.Account.citizenship == req.citizenship).first()
    if existing_cit:
        raise HTTPException(status_code=400, detail="Citizenship number already registered")
    hashed = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    account = models.Account(
        username=req.username,
        password=hashed,
        role="patient",
        full_name=req.full_name,
        dob=req.dob,
        address=req.address,
        phone=req.phone,
        citizenship=req.citizenship,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    token = create_access_token({"sub": str(account.id), "username": account.username, "role": account.role})
    crud.log_action(db, "signup", req.username, "patient")
    return schemas.PatientSignupResponse(id=account.id, username=account.username, role=account.role, access_token=token)


@backend.get("/auth/me", response_model=schemas.AccountResponse)
def auth_me(account: models.Account = Depends(get_current_user)):
    return account


# ──────────────────────────────────────────
# Admin endpoints
# ──────────────────────────────────────────

@backend.post("/admin/create-account", response_model=schemas.LoginResponse)
def admin_create_account(req: schemas.AdminCreateRequest, db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    if req.role not in ["hospital", "municipality"]:
        raise HTTPException(status_code=400, detail="Can only create hospital or municipality accounts")
    existing = db.query(models.Account).filter(models.Account.username == req.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    hashed = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    account = models.Account(username=req.username, password=hashed, role=req.role, full_name=req.full_name)
    db.add(account)
    db.commit()
    db.refresh(account)
    token = create_access_token({"sub": str(account.id), "username": account.username, "role": account.role})
    crud.log_action(db, "account_created", admin.username, "admin", details=f"Created {req.role} account: {req.username}")
    return schemas.LoginResponse(id=account.id, username=account.username, role=account.role, access_token=token)


@backend.get("/admin/accounts", response_model=list[schemas.AccountResponse])
def admin_list_accounts(db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    return db.query(models.Account).all()


@backend.get("/admin/victims", response_model=list[schemas.VictimResponse])
def admin_list_victims(db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    return db.query(models.Victim).all()


@backend.get("/admin/stats")
def admin_stats(db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    total = db.query(models.Victim).count()
    paused = db.query(models.Victim).filter(models.Victim.paused == True).count()
    rejected = db.query(models.Victim).filter(models.Victim.rejected == True).count()
    pending_hospital = db.query(models.Victim).filter(
        models.Victim.hospital_verified == False,
        models.Victim.rejected == False,
        models.Victim.paused == False,
    ).count()
    pending_municipality = db.query(models.Victim).filter(
        models.Victim.hospital_verified == True,
        models.Victim.muni_verified == False,
        models.Victim.rejected == False,
        models.Victim.paused == False,
    ).count()
    verified = db.query(models.Victim).filter(
        models.Victim.hospital_verified == True,
        models.Victim.muni_verified == True,
        models.Victim.paused == False,
    ).count()
    return {
        "total": total,
        "paused": paused,
        "rejected": rejected,
        "pending_hospital": pending_hospital,
        "pending_municipality": pending_municipality,
        "verified": verified,
    }


@backend.get("/admin/logs", response_model=list[schemas.AuditLogResponse])
def admin_list_logs(db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    return db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(100).all()


@backend.get("/hospitals")
def list_hospitals(db: Session = Depends(database.get_db)):
    hospitals = db.query(models.Account).filter(models.Account.role == "hospital").all()
    return [{"full_name": h.full_name or h.username, "username": h.username} for h in hospitals]


@backend.get("/admin/unregistered-hospitals", response_model=list[schemas.VictimResponse])
def admin_unregistered_hospitals(db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    victims = db.query(models.Victim).filter(
        models.Victim.other_hospital_name.isnot(None),
        models.Victim.hospital_name == "Other",
        models.Victim.rejected == False,
    ).order_by(models.Victim.created_at.desc()).all()
    return victims


@backend.post("/admin/unregistered-hospitals/{victim_id}/verify")
def admin_verify_unregistered_hospital(victim_id: int, db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    victim = crud.get_victim(db, victim_id)
    if not victim or not victim.other_hospital_name:
        raise HTTPException(status_code=404, detail="Unregistered hospital case not found")
    # Create hospital account if not exists — username/password = sanitized hospital name (you will change later)
    existing = db.query(models.Account).filter(models.Account.full_name == victim.other_hospital_name).first()
    if not existing:
        import re as _re
        import bcrypt as _bcrypt
        # sanitize: lower, replace non-alnum with underscore, collapse underscores
        raw = victim.other_hospital_name.strip().lower()
        sanitized = _re.sub(r'[^a-z0-9]+', '_', raw).strip('_')
        sanitized = sanitized or f"hosp{victim_id}"
        # keep reasonable length (max 30)
        base = sanitized[:30].strip('_')
        username = base
        suffix = 1
        while db.query(models.Account).filter(models.Account.username == username).first():
            # preserve sanitized base, append suffix
            suffix_str = f"_{suffix}" if "_" in base else f"{suffix}"
            # ensure not too long
            username = f"{base[:24]}{suffix_str}"
            suffix += 1
        # password = same sanitized name (for now, you will change)
        pwd_raw = base
        hashed = _bcrypt.hashpw(pwd_raw.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
        acc = models.Account(username=username, password=hashed, role="hospital", full_name=victim.other_hospital_name, address=victim.other_hospital_address, phone=victim.other_hospital_contact)
        db.add(acc)
        db.commit()
        db.refresh(acc)
        crud.log_action(db, "hospital_created_from_unregistered", admin.username, "admin", victim_id, f"Created hospital {acc.full_name} ({username}) from unregistered request (pwd=sanitized name)")
    # mark victim as hospital verified and update hospital_name to actual name
    victim.hospital_name = victim.other_hospital_name
    victim.hospital_verified = True
    db.commit()
    db.refresh(victim)
    crud.log_action(db, "unregistered_hospital_verified", admin.username, "admin", victim_id, f"Verified unregistered hospital {victim.other_hospital_name}")
    return {"detail": "Hospital verified and added", "hospital": victim.other_hospital_name, "victim": victim}


@backend.patch("/admin/victims/{victim_id}/pause")
def admin_pause_victim(victim_id: int, db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    victim.paused = True
    db.commit()
    crud.log_action(db, "case_paused", admin.username, "admin", victim_id, "Case paused by admin")
    return {"detail": "Case paused", "id": victim_id}


@backend.patch("/admin/victims/{victim_id}/unpause")
def admin_unpause_victim(victim_id: int, db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    victim.paused = False
    db.commit()
    crud.log_action(db, "case_unpaused", admin.username, "admin", victim_id, "Case unpaused by admin")
    return {"detail": "Case unpaused", "id": victim_id}


# ──────────────────────────────────────────
# Victim / Case endpoints
# ──────────────────────────────────────────

@backend.post("/victims/", response_model=schemas.VictimResponse)
def create_victim(
    victim: schemas.VictimCreate,
    db: Session = Depends(database.get_db),
    account: models.Account = Depends(require_role("patient")),
):
    return crud.create_victim(db=db, victim_data=victim, account_id=account.id)


@backend.get("/victims/", response_model=list[schemas.VictimResponse])
def read_public_victims(db: Session = Depends(database.get_db)):
    victims = db.query(models.Victim).filter(
        models.Victim.hospital_verified == True,
        models.Victim.muni_verified == True,
        models.Victim.paused == False,
        models.Victim.rejected == False,
    ).all()
    # Hide raw bank account number from public — donors use QR instead
    for v in victims:
        # Use object attribute without triggering encryption write
        v.__dict__["bank_account_number"] = "****"
        v.__dict__["phone"] = "***"
        if v.other_hospital_contact:
            v.__dict__["other_hospital_contact"] = "****"
    return victims


@backend.get("/victims/all", response_model=list[schemas.VictimResponse])
def read_all_victims(db: Session = Depends(database.get_db), account: models.Account = Depends(get_current_user)):
    q = db.query(models.Victim)
    if account.role == "patient":
        q = q.filter(models.Victim.account_id == account.id)
    elif account.role == "hospital":
        q = q.filter(models.Victim.hospital_name.ilike(f"%{account.full_name or ''}%"))
    elif account.role == "municipality":
        q = q.filter(models.Victim.municipality_name.ilike(f"%{account.full_name or ''}%"))
    return q.order_by(models.Victim.created_at.desc()).all()


@backend.get("/victims/{victim_id}", response_model=schemas.VictimResponse)
def read_victim(victim_id: int, db: Session = Depends(database.get_db)):
    victim = crud.get_victim(db, victim_id)
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    # Public detail: hide sensitive raw numbers, show QR instead
    if victim.hospital_verified and victim.muni_verified and not victim.paused and not victim.rejected:
        victim.__dict__["bank_account_number"] = "****"
        victim.__dict__["phone"] = "***"
        if victim.other_hospital_contact:
            victim.__dict__["other_hospital_contact"] = "****"
    return victim


@backend.post("/victims/{victim_id}/reports")
def upload_medical_report(
    victim_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    _: bool = Depends(rate_limit(10)),
):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    rel_path = save_uploaded_file(file, "reports", max_mb=10, allow_pdf=True)
    report = crud.create_medical_report(db, victim_id, rel_path, file.filename or "report")
    return {"id": report.id, "filename": report.filename, "original_name": report.original_name}


@backend.post("/victims/{victim_id}/patient-photo")
def upload_patient_photo(
    victim_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    _: bool = Depends(rate_limit(10)),
):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    rel_path = save_uploaded_file(file, "photos")
    victim.patient_photo = rel_path
    db.commit()
    return {"photo": victim.patient_photo}


@backend.post("/victims/{victim_id}/collector/{collector_id}/photo")
def upload_collector_photo(
    victim_id: int,
    collector_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    _: bool = Depends(rate_limit(10)),
):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    rel_path = save_uploaded_file(file, "collectors")
    collector = crud.update_collector_photo(db, collector_id, rel_path)
    if not collector:
        raise HTTPException(status_code=404, detail="Collector not found")
    return {"photo": collector.photo}


@backend.post("/victims/{victim_id}/bank-qr")
def upload_bank_qr(
    victim_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    account: models.Account = Depends(require_role("patient")),
    _: bool = Depends(rate_limit(10)),
):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    if victim.account_id is not None and victim.account_id != account.id and account.role != "admin":
        raise HTTPException(status_code=403, detail="Not your case")
    rel_path = save_uploaded_file(file, "qrcodes", max_mb=2)
    victim.bank_qr = rel_path
    db.commit()
    db.refresh(victim)
    return {"bank_qr": victim.bank_qr}


@backend.post("/victims/{victim_id}/upload-logo")
def upload_logo(
    victim_id: int,
    file: UploadFile = File(...),
    role: str = Header(...),
    db: Session = Depends(database.get_db),
    account: models.Account = Depends(require_role("hospital", "municipality")),
    _: bool = Depends(rate_limit(10)),
):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    if role not in ["hospital", "municipality"]:
        raise HTTPException(status_code=400, detail="Role must be 'hospital' or 'municipality'")
    rel_path = save_uploaded_file(file, "logos")
    if role == "hospital":
        victim.hospital_logo = rel_path
    else:
        victim.municipality_logo = rel_path
    db.commit()
    return {"logo": rel_path}


# ──────────────────────────────────────────
# Verification endpoints
# ──────────────────────────────────────────

@backend.patch("/victims/{victim_id}/verify/{role}")
def verify_victim(
    victim_id: int,
    role: str,
    db: Session = Depends(database.get_db),
    account: models.Account = Depends(require_role("hospital", "municipality", "admin")),
    _: bool = Depends(rate_limit(30)),
):
    if role not in ["hospital", "municipality"]:
        raise HTTPException(status_code=400, detail="Invalid role. Use 'hospital' or 'municipality'.")
    if account.role != role and account.role != "admin":
        raise HTTPException(status_code=403, detail=f"Your account is {account.role}, cannot verify as {role}")
    updated_victim = crud.verify_case(db=db, victim_id=victim_id, role=role, actor=account.username)
    if not updated_victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    return updated_victim


@backend.patch("/victims/{victim_id}/reject")
def reject_victim(
    victim_id: int,
    reason: Optional[str] = None,
    db: Session = Depends(database.get_db),
    account: models.Account = Depends(require_role("hospital", "municipality", "admin")),
):
    updated_victim = crud.reject_case(db=db, victim_id=victim_id, role=account.role, reason=reason, actor=account.username)
    if not updated_victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    return updated_victim


@backend.patch("/victims/{victim_id}/resubmit")
def resubmit_victim(
    victim_id: int,
    db: Session = Depends(database.get_db),
    account: models.Account = Depends(require_role("patient")),
):
    victim = crud.get_victim(db, victim_id)
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    if victim.account_id != account.id:
        raise HTTPException(status_code=403, detail="Not your case")
    victim.rejected = False
    victim.rejection_reason = None
    victim.rejected_by = None
    db.commit()
    crud.log_action(db, "case_resubmitted", account.username, "patient", victim_id, "Patient resubmitted case")
    return victim


# ──────────────────────────────────────────
# PDF download endpoint
# ──────────────────────────────────────────

@backend.get("/victims/{victim_id}/pdf")
def download_case_pdf(victim_id: int, base_url: str = Query("http://127.0.0.1:5173"), db: Session = Depends(database.get_db)):
    victim = crud.get_victim(db, victim_id)
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    pdf_data = pdfgen.generate_case_pdf(victim, base_url=base_url)
    return Response(
        content=bytes(pdf_data),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=TrustMed_{victim.case_id or victim.id}.pdf"},
    )
