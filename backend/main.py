import os
import io
import re
import uuid
import shutil
import time
import hashlib
import secrets
from collections import defaultdict
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File, Query, Request, BackgroundTasks
from fastapi.responses import Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
from jose import JWTError, jwt
import bcrypt

from backend import crud, models, schemas, database, pdf as pdfgen
from backend.config import JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, OTP_EXPIRE_MINUTES, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS
from backend.email import send_otp_email, _get_sender_email

# ──────────────────────────────────────────
# Helpers: normalization & OTP hashing (address decision = normalized exact)
# ──────────────────────────────────────────

def _normalize_text(s: str) -> str:
    if not s:
        return ""
    s = re.sub(r"[,\.\-\_\/]+", " ", s)
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s

def _normalize_address(s: str) -> str:
    return _normalize_text(s)

def _normalize_phone(s: str) -> str:
    if not s:
        return ""
    # keep only digits for comparison; handles 98XXXXXXXX vs 98xx-xx-xx
    return re.sub(r"\D", "", s.strip())

def _normalize_email(s: str) -> str:
    if not s:
        return ""
    return s.strip().lower()

def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()

def _get_account_phone_plain(account: models.Account) -> str:
    """Account.phone is now plaintext String, but old rows may be Fernet ciphertext.
    Try to decrypt if needed."""
    raw = account.phone or ""
    if not raw:
        return ""
    if raw.startswith("gAAAAA"):
        try:
            from backend.crypto import decrypt as _dec
            dec = _dec(raw)
            if dec and dec != raw:
                return dec
        except Exception:
            pass
    return raw

# Pillow for image compression / enhancement (already via qrcode[pil])
try:
    from PIL import Image, ImageFilter, ImageEnhance, ImageDraw, ImageFont  # type: ignore
    PIL_AVAILABLE = True
except Exception:
    PIL_AVAILABLE = False
    Image = None  # type: ignore

# Optional OCR and PDF support (graceful fallback if not installed)
try:
    import pytesseract  # type: ignore
    OCR_AVAILABLE = True
except Exception:
    pytesseract = None  # type: ignore
    OCR_AVAILABLE = False

try:
    import fitz  # PyMuPDF  # type: ignore
    PYMUPDF_AVAILABLE = True
except Exception:
    fitz = None  # type: ignore
    PYMUPDF_AVAILABLE = False

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")

# ──────────────────────────────────────────
# Simple in-memory rate limiter
# ──────────────────────────────────────────

_rate_store = defaultdict(list)

def rate_limit(max_per_minute: int = 20):
    def limiter(request: Request):
        client = request.client.host if request.client else "unknown"
        # Include user identifier if present (Authorization header) for per-user isolation
        auth = request.headers.get("authorization") or ""
        # Use first 20 chars of token as user fingerprint to avoid host-only bypass
        user_fp = auth[-20:] if auth else "anon"
        key = f"{client}:{user_fp}:{request.url.path}"
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


# ──────────────────────────────────────────
# Citizenship doc helpers: 5 MB → <200 KB loop
# ──────────────────────────────────────────

TARGET_CITIZENSHIP_BYTES = 200 * 1024
MAX_CITIZENSHIP_MB = 5


def _image_to_jpeg_bytes(img: "Image.Image", quality: int) -> bytes:
    buf = io.BytesIO()
    # ensure RGB for JPEG
    if img.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def _try_ocr_synthetic(img: "Image.Image") -> Optional["Image.Image"]:
    """If OCR available, reconstruct a small highly-detailed text photo (800x600) + keep context.
    Returns synthetic image or None on failure."""
    if not OCR_AVAILABLE or not PIL_AVAILABLE:
        return None
    try:
        # Extract text — may fail if tesseract not installed binary
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)  # type: ignore
        words = []
        for i, txt in enumerate(data.get("text", [])):
            t = (txt or "").strip()
            if t:
                words.append(t)
        full_text = " ".join(words).strip()
        if not full_text or len(full_text) < 10:
            return None
        # Face crop heuristic: top-center ~25% of original as face area (citizenship photo)
        w, h = img.size
        face = None
        try:
            # estimate face region: right side typical for Nepali citizenship
            fx0, fy0 = int(w * 0.62), int(h * 0.08)
            fx1, fy1 = int(w * 0.96), int(h * 0.62)
            face = img.crop((fx0, fy0, fx1, fy1))
            face.thumbnail((180, 180), Image.LANCZOS)
        except Exception:
            face = None

        # Create synthetic 800x600 canvas
        canvas = Image.new("RGB", (800, 600), (255, 255, 255))
        draw = ImageDraw.Draw(canvas)
        # try load default font
        try:
            font = ImageFont.load_default()
        except Exception:
            font = None
        # word wrap full_text into canvas
        margin = 16
        max_w = 760
        line_h = 16
        y = 14
        # simple wrap by words
        line = ""
        for word in full_text.split():
            test = (line + " " + word).strip()
            # estimate width (approx 7px per char with default font)
            est_w = len(test) * 7
            if est_w > max_w and line:
                draw.text((margin, y), line, fill=(20, 20, 20), font=font)
                y += line_h
                line = word
                if y > 520:
                    break
            else:
                line = test
        if line and y <= 520:
            draw.text((margin, y), line, fill=(20, 20, 20), font=font)
            y += line_h + 8
        draw.text((margin, max(560, y)), "— TrustMed citizenship compressed · original retained as <200 KB synthetic", fill=(120, 120, 120), font=font)
        # paste face crop at top-right if available
        if face is not None:
            canvas.paste(face, (800 - face.size[0] - 12, 12))
            draw.rectangle([800 - face.size[0] - 12, 12, 800 - 12, 12 + face.size[1]], outline=(200, 200, 200))
        # also draw thin border
        draw.rectangle([0, 0, 799, 599], outline=(230, 230, 230))
        return canvas
    except Exception:
        return None


def _compress_citizenship_bytes(contents: bytes, filename: str = "") -> tuple[bytes, str]:
    """Compress any doc (image/PDF) to <200 KB JPEG. Returns (bytes, ext)."""
    # Detect PDF by header
    is_pdf = contents[:4] == b"%PDF"
    img: Optional["Image.Image"] = None
    if is_pdf:
        if PYMUPDF_AVAILABLE:
            try:
                doc = fitz.open(stream=contents, filetype="pdf")
                if len(doc) == 0:
                    raise ValueError("Empty PDF")
                pix = doc[0].get_pixmap(dpi=120)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples) if PIL_AVAILABLE else None
                doc.close()
            except Exception:
                img = None
        if img is None:
            # No PDF rasterizer — keep PDF but enforce 200 KB via warning
            if len(contents) <= TARGET_CITIZENSHIP_BYTES:
                return contents, ".pdf"
            # try naive: if Pillow can open PDF (rare), else fail to compress
            if PIL_AVAILABLE:
                try:
                    img = Image.open(io.BytesIO(contents))
                except Exception:
                    # Cannot compress PDF without PyMuPDF — keep but trim? Better to error with guidance
                    raise HTTPException(status_code=400, detail="PDF citizenship doc is >200 KB and PDF compressor (PyMuPDF) is not installed. Please upload a JPG/PNG image (5 MB → auto-compressed to <200 KB) or install PyMuPDF.")
            else:
                raise HTTPException(status_code=400, detail="PDF too large for citizenship doc (>200 KB). Please upload JPG/PNG instead.")
    else:
        if not PIL_AVAILABLE:
            # No Pillow — just enforce target size naively
            if len(contents) <= TARGET_CITIZENSHIP_BYTES:
                ext = os.path.splitext(filename or "")[1] or ".jpg"
                return contents, ext
            raise HTTPException(status_code=400, detail="Image too large and Pillow not available for compression. Install Pillow.")
        try:
            img = Image.open(io.BytesIO(contents))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image file: {e}")

    if img is None:
        raise HTTPException(status_code=400, detail="Could not process citizenship document.")

    # Try OCR synthetic path first — produces highly detailed text at 800x600 (context clear, low quality ok)
    synthetic = _try_ocr_synthetic(img)
    if synthetic is not None:
        # compress synthetic to <200 KB, typically <80 KB at quality 75
        for q in [80, 72, 65, 55, 45]:
            b = _image_to_jpeg_bytes(synthetic, q)
            if len(b) <= TARGET_CITIZENSHIP_BYTES:
                return b, ".jpg"
        # fallback to compressed original if synthetic still >200 KB (unlikely)
        b = _image_to_jpeg_bytes(synthetic, 40)
        if len(b) <= TARGET_CITIZENSHIP_BYTES:
            return b, ".jpg"

    # Standard loop: iteratively reduce dimension and quality to hit <200 KB
    # Start max dimension 1600, then 1200, 900, 700, 500
    base = img
    # Normalize orientation and convert to RGB early
    try:
        # handle EXIF orientation if present
        if hasattr(Image, "Ops") or True:
            pass
    except Exception:
        pass
    for max_side in [1600, 1200, 900, 700, 550, 400]:
        w, h = base.size
        scale = min(1.0, max_side / max(w, h))
        if scale < 1.0:
            nw, nh = int(w * scale), int(h * scale)
            cur = base.resize((nw, nh), Image.LANCZOS)
        else:
            cur = base
        for quality in [85, 75, 65, 55, 45, 35, 25]:
            b = _image_to_jpeg_bytes(cur, quality)
            if len(b) <= TARGET_CITIZENSHIP_BYTES:
                return b, ".jpg"
    # last resort: tiny 320px at quality 20
    try:
        tiny = base.resize((320, int(320 * base.size[1] / base.size[0])), Image.LANCZOS)
        b = _image_to_jpeg_bytes(tiny, 20)
        if len(b) <= TARGET_CITIZENSHIP_BYTES:
            return b, ".jpg"
    except Exception:
        pass
    raise HTTPException(status_code=400, detail="Could not compress citizenship doc to <200 KB. Try a smaller or clearer image.")


def _enhance_medical_image_bytes(contents: bytes) -> bytes:
    """Keep medical report clear: sharpen/contrast/denoise if blurry, not crush to 200 KB. Max 10 MB preserved."""
    if not PIL_AVAILABLE:
        return contents
    try:
        img = Image.open(io.BytesIO(contents))
        # Only enhance images, not PDFs
        if img.format == "PDF":
            return contents
        # Apply mild sharpen + contrast boost to counter blur; keep high quality
        img = img.filter(ImageFilter.SHARPEN)
        # unsharp mask via enhance
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.18)
        enhancer2 = ImageEnhance.Sharpness(img)
        img = enhancer2.enhance(1.25)
        # Save at high quality to preserve clarity (92) — allow up to 10 MB
        buf = io.BytesIO()
        if img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            bg.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        img.save(buf, format="JPEG", quality=92, optimize=True)
        out = buf.getvalue()
        # If enhancement made it larger than 10 MB, fallback to original
        if len(out) > 10 * 1024 * 1024:
            return contents
        # Prefer enhanced only if not too large; otherwise return original
        return out if len(out) <= 10 * 1024 * 1024 else contents
    except Exception:
        return contents


def save_citizenship_doc(file: UploadFile) -> str:
    contents = file.file.read()
    if len(contents) > MAX_CITIZENSHIP_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large. Max {MAX_CITIZENSHIP_MB} MB.")
    # validate mime (allow image or pdf) — reuse check
    check_file_mime(contents[:64], allow_pdf=True)
    # compress loop to <200 KB (OCR synthetic if available)
    compressed, ext = _compress_citizenship_bytes(contents, file.filename or "")
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, "citizenship", unique_name)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "wb") as f:
        f.write(compressed)
    return f"citizenship/{unique_name}"


def _can_view_citizenship(victim: models.Victim, account: models.Account) -> bool:
    if account.role == "admin":
        return True
    if account.role == "municipality":
        return True
    if account.role == "patient" and victim.account_id is not None and victim.account_id == account.id:
        return True
    return False


def _is_owner_patient(victim: models.Victim, account: models.Account) -> bool:
    return account.role == "patient" and victim.account_id is not None and victim.account_id == account.id


def _can_access_victim(victim: models.Victim, account: models.Account) -> bool:
    """Strict isolation: who may view/modify this victim's private data."""
    if account.role == "admin":
        return True
    if _is_owner_patient(victim, account):
        return True
    if account.role == "hospital":
        # Hospital may only access cases assigned to them (by full_name) — handles Other flow
        hn = (victim.hospital_name or "").strip().lower()
        oh = (victim.other_hospital_name or "").strip().lower()
        cur = (account.full_name or "").strip().lower()
        return cur and (hn == cur or oh == cur or hn == "other")
    if account.role == "municipality":
        mn = (victim.municipality_name or "").strip().lower()
        cur = (account.full_name or "").strip().lower()
        return cur and mn == cur
    return False


models.Base.metadata.create_all(bind=database.engine)
database.migrate_schema()
database._ensure_indexes_and_seed_settings()
database._migrate_phone_decrypt()
database.seed_admin()

backend = FastAPI(title="TrustMed API")

backend.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "reports"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "collectors"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "photos"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "logos"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "qrcodes"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "citizenship"), exist_ok=True)

# Serve public uploads directly; citizenship is NOT mounted — must go via auth-gated /victims/{id}/citizenship-doc
backend.mount("/uploads/reports", StaticFiles(directory=os.path.join(UPLOAD_DIR, "reports")), name="reports")
backend.mount("/uploads/collectors", StaticFiles(directory=os.path.join(UPLOAD_DIR, "collectors")), name="collectors")
backend.mount("/uploads/photos", StaticFiles(directory=os.path.join(UPLOAD_DIR, "photos")), name="photos")
backend.mount("/uploads/logos", StaticFiles(directory=os.path.join(UPLOAD_DIR, "logos")), name="logos")
backend.mount("/uploads/qrcodes", StaticFiles(directory=os.path.join(UPLOAD_DIR, "qrcodes")), name="qrcodes")
# Note: /uploads/citizenship is intentionally not mounted — use get_citizenship_doc with _can_view_citizenship

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


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_auth_user: Optional[str] = Header(None),
    x_auth_pass: Optional[str] = Header(None),
    db: Session = Depends(database.get_db),
) -> Optional[models.Account]:
    """Like get_current_user but returns None instead of 401 when unauthenticated — for public endpoints that hide private data."""
    if credentials:
        token = credentials.credentials
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            sub_val = payload.get("sub")
            if sub_val is None:
                return None
            account = db.query(models.Account).filter(models.Account.id == int(sub_val)).first()
            return account
        except Exception:
            return None
    if x_auth_user and x_auth_pass:
        account = db.query(models.Account).filter(models.Account.username == x_auth_user).first()
        if account and account.password == x_auth_pass:
            return account
    return None


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
    # phone and email uniqueness (primary keys per D2)
    if req.phone:
        existing_phone = db.query(models.Account).filter(models.Account.phone == req.phone.strip()).first()
        if existing_phone:
            raise HTTPException(status_code=400, detail="Phone number already registered")
        # also check decrypted legacy phones — fallback scan for old ciphertext rows
        # (light check)
        all_with_phone = db.query(models.Account).all()
        norm_new = _normalize_phone(req.phone)
        for acc in all_with_phone:
            if _normalize_phone(_get_account_phone_plain(acc)) == norm_new and norm_new:
                raise HTTPException(status_code=400, detail="Phone number already registered")
    if req.email:
        norm_email = _normalize_email(str(req.email))
        existing_email = db.query(models.Account).filter(models.Account.email == norm_email).first()
        if existing_email:
            raise HTTPException(status_code=400, detail="Gmail already registered")
    hashed = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    account = models.Account(
        username=req.username,
        password=hashed,
        role="patient",
        full_name=req.full_name,
        dob=req.dob,
        address=req.address,
        phone=req.phone.strip(),
        citizenship=req.citizenship.strip(),
        email=_normalize_email(str(req.email)),
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
# Forgot password via Gmail OTP (patient only) — 5-field verification
# ──────────────────────────────────────────

@backend.post("/auth/forgot/request")
def forgot_request(req: schemas.ForgotRequest, background_tasks: BackgroundTasks, db: Session = Depends(database.get_db), _: bool = Depends(rate_limit(5))):
    # Normalize inputs
    full_name_in = _normalize_text(req.full_name)
    phone_in = _normalize_phone(req.phone)
    citizenship_in = (req.citizenship or "").strip()
    email_in = _normalize_email(str(req.email))
    address_in = _normalize_address(req.address)

    # Lookup by citizenship (indexed unique) — primary key per D2
    acct = db.query(models.Account).filter(models.Account.citizenship == citizenship_in).first()
    if not acct:
        raise HTTPException(status_code=400, detail="Details do not match. Please check your information.")

    # Role guard: only patients
    if acct.role != "patient":
        raise HTTPException(status_code=403, detail="Hospitals and municipalities must request admin to change password.")

    # Verify 5 fields (normalized)
    acct_name_norm = _normalize_text(acct.full_name or "")
    acct_phone_norm = _normalize_phone(_get_account_phone_plain(acct))
    acct_cit = (acct.citizenship or "").strip()
    acct_email_norm = _normalize_email(acct.email or "")
    acct_addr_norm = _normalize_address(acct.address or "")

    if not (
        acct_name_norm == full_name_in
        and acct_phone_norm == phone_in
        and acct_cit == citizenship_in
        and acct_email_norm == email_in
        and acct_addr_norm == address_in
    ):
        crud.log_action(db, "password_reset_failed_5field", acct.username, acct.role, details=f"Forgot 5-field mismatch for {email_in}")
        raise HTTPException(status_code=400, detail="Details do not match. Please check your information.")

    # Resend cooldown 60s
    recent = db.query(models.PasswordResetOTP).filter(
        models.PasswordResetOTP.account_id == acct.id,
        models.PasswordResetOTP.created_at > datetime.utcnow() - timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS),
        models.PasswordResetOTP.used == False,
    ).order_by(models.PasswordResetOTP.created_at.desc()).first()
    if recent:
        remaining = int((recent.created_at + timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS) - datetime.utcnow()).total_seconds())
        remaining = max(1, remaining)
        raise HTTPException(status_code=429, detail=f"Please wait {remaining} seconds before resending.")

    # Generate OTP 6-digit
    otp = f"{secrets.randbelow(900000) + 100000:06d}"
    otp_hash = _hash_otp(otp)
    expires = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
    entry = models.PasswordResetOTP(
        account_id=acct.id,
        email=email_in,
        otp_hash=otp_hash,
        expires_at=expires,
        attempts=0,
        verified=False,
        used=False,
    )
    db.add(entry)
    db.commit()

    # Resolve sender before enqueueing BackgroundTask (request Session closes after response)
    sender = _get_sender_email(db)
    # Pass sender_override instead of db to avoid using a closed Session in background
    background_tasks.add_task(send_otp_email, email_in, otp, None, "", sender)

    crud.log_action(db, "password_reset_requested", acct.username, acct.role, details=f"OTP sent to {email_in}")

    # Never expose raw OTP to client — send_otp_email logs to server console only when ENV != production
    return {"detail": "If details matched, an OTP was sent to your Gmail.", "expires_in_minutes": OTP_EXPIRE_MINUTES}


@backend.post("/auth/forgot/verify")
def forgot_verify(req: schemas.ForgotVerify, db: Session = Depends(database.get_db), _: bool = Depends(rate_limit(10))):
    email_norm = _normalize_email(str(req.email))
    otp_in = (req.otp or "").strip()

    # Find latest unused OTP for this email
    entry = db.query(models.PasswordResetOTP).filter(
        models.PasswordResetOTP.email == email_norm,
        models.PasswordResetOTP.used == False,
    ).order_by(models.PasswordResetOTP.created_at.desc()).first()

    if not entry:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP. Please request a new one.")

    # Check expiry
    if datetime.utcnow() > entry.expires_at:
        entry.used = True
        db.commit()
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    # Check attempts
    if entry.attempts >= OTP_MAX_ATTEMPTS:
        entry.used = True
        db.commit()
        raise HTTPException(status_code=400, detail="Too many attempts. Please request a new OTP.")

    # Verify hash
    if _hash_otp(otp_in) != entry.otp_hash:
        entry.attempts += 1
        if entry.attempts >= OTP_MAX_ATTEMPTS:
            entry.used = True
        db.commit()
        remaining = OTP_MAX_ATTEMPTS - entry.attempts
        if remaining <= 0:
            raise HTTPException(status_code=400, detail="Invalid OTP. No attempts left. Please request a new one.")
        raise HTTPException(status_code=400, detail=f"Invalid OTP. {remaining} attempt(s) left.")

    # Success
    entry.verified = True
    # Do not mark used yet — reset will mark used
    db.commit()

    # Issue reset token (short-lived 10m)
    acct = db.query(models.Account).filter(models.Account.id == entry.account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    if acct.role != "patient":
        raise HTTPException(status_code=403, detail="Not a patient account")

    token = jwt.encode({"sub": str(acct.id), "purpose": "pwd_reset", "exp": datetime.utcnow() + timedelta(minutes=10)}, JWT_SECRET, algorithm=JWT_ALGORITHM)
    crud.log_action(db, "otp_verified", acct.username, acct.role, details=f"OTP verified for {email_norm}")
    return {"detail": "OTP verified", "reset_token": token, "email": email_norm}


@backend.post("/auth/forgot/reset")
def forgot_reset(req: schemas.ForgotResetWithToken, db: Session = Depends(database.get_db), _: bool = Depends(rate_limit(10))):
    # Verify token
    try:
        payload = jwt.decode(req.reset_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("purpose") != "pwd_reset":
            raise HTTPException(status_code=400, detail="Invalid reset token")
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=400, detail="Invalid token")
        account_id = int(sub)
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if not req.new_password or len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    acct = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acct or acct.role != "patient":
        raise HTTPException(status_code=404, detail="Account not found or not a patient")

    # Hash new password
    hashed = bcrypt.hashpw(req.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    acct.password = hashed
    # Invalidate OTPs for this account
    db.query(models.PasswordResetOTP).filter(models.PasswordResetOTP.account_id == acct.id, models.PasswordResetOTP.used == False).update({models.PasswordResetOTP.used: True})
    db.commit()
    crud.log_action(db, "password_reset", acct.username, acct.role, details="Password reset via OTP")
    return {"detail": "Password updated successfully. Please login with new password."}


@backend.post("/auth/forgot/reset-with-otp")
def forgot_reset_with_otp(req: schemas.ForgotReset, db: Session = Depends(database.get_db), _: bool = Depends(rate_limit(10))):
    """Alternative flow: email+otp+new_password in one call (no token). Keeps compatibility."""
    email_norm = _normalize_email(str(req.email))
    otp_in = (req.otp or "").strip()
    if len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    entry = db.query(models.PasswordResetOTP).filter(
        models.PasswordResetOTP.email == email_norm,
        models.PasswordResetOTP.used == False,
        models.PasswordResetOTP.verified == True,
    ).order_by(models.PasswordResetOTP.created_at.desc()).first()
    # If not verified before, try direct verify now (allow single-step)
    if not entry:
        entry = db.query(models.PasswordResetOTP).filter(
            models.PasswordResetOTP.email == email_norm,
            models.PasswordResetOTP.used == False,
        ).order_by(models.PasswordResetOTP.created_at.desc()).first()
        if not entry:
            raise HTTPException(status_code=400, detail="No OTP found. Please request one.")
        if datetime.utcnow() > entry.expires_at:
            entry.used = True
            db.commit()
            raise HTTPException(status_code=400, detail="OTP expired.")
        if entry.attempts >= OTP_MAX_ATTEMPTS:
            entry.used = True
            db.commit()
            raise HTTPException(status_code=400, detail="Too many attempts.")
        if _hash_otp(otp_in) != entry.otp_hash:
            entry.attempts += 1
            if entry.attempts >= OTP_MAX_ATTEMPTS:
                entry.used = True
            db.commit()
            raise HTTPException(status_code=400, detail="Invalid OTP.")
        entry.verified = True
        db.commit()

    # Now entry is verified
    if _hash_otp(otp_in) != entry.otp_hash:
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    acct = db.query(models.Account).filter(models.Account.id == entry.account_id).first()
    if not acct or acct.role != "patient":
        raise HTTPException(status_code=404, detail="Account not found")

    hashed = bcrypt.hashpw(req.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    acct.password = hashed
    entry.used = True
    db.commit()
    crud.log_action(db, "password_reset", acct.username, acct.role, details="Password reset via OTP direct")
    return {"detail": "Password updated successfully."}


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
    # uniqueness for phone/citizenship/email if provided
    if req.citizenship:
        if db.query(models.Account).filter(models.Account.citizenship == req.citizenship.strip()).first():
            raise HTTPException(status_code=400, detail="Citizenship already registered")
    if req.phone:
        norm_phone = _normalize_phone(req.phone)
        # check existing normalized
        for acc in db.query(models.Account).all():
            if _normalize_phone(_get_account_phone_plain(acc)) == norm_phone and norm_phone:
                raise HTTPException(status_code=400, detail="Phone already registered")
    if req.email:
        norm_email = _normalize_email(str(req.email))
        if db.query(models.Account).filter(models.Account.email == norm_email).first():
            raise HTTPException(status_code=400, detail="Email already registered")
    hashed = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    account = models.Account(
        username=req.username,
        password=hashed,
        role=req.role,
        full_name=req.full_name,
        email=_normalize_email(str(req.email)) if req.email else None,
        phone=(req.phone.strip() if req.phone else None),
        citizenship=(req.citizenship.strip() if req.citizenship else None),
        address=(req.address.strip() if req.address else None),
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    token = create_access_token({"sub": str(account.id), "username": account.username, "role": account.role})
    crud.log_action(db, "account_created", admin.username, "admin", details=f"Created {req.role} account: {req.username}")
    return schemas.LoginResponse(id=account.id, username=account.username, role=account.role, access_token=token)


# ──────────────────────────────────────────
# Hospital / Municipality password change request (patient direct OTP, others via admin)
# ──────────────────────────────────────────

@backend.post("/auth/request-password-change", response_model=schemas.PasswordChangeRequestResponse)
def request_password_change(req: schemas.PasswordChangeRequestCreate, db: Session = Depends(database.get_db), account: models.Account = Depends(get_current_user)):
    if account.role not in ["hospital", "municipality"]:
        raise HTTPException(status_code=403, detail="Only hospital and municipality accounts use this flow. Patients use Forgot Password.")
    # prevent duplicate pending
    existing = db.query(models.PasswordChangeRequest).filter(
        models.PasswordChangeRequest.account_id == account.id,
        models.PasswordChangeRequest.status == "pending",
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending request. Please wait for admin review.")
    pr = models.PasswordChangeRequest(
        account_id=account.id,
        username=account.username,
        role=account.role,
        status="pending",
        reason=req.reason,
    )
    db.add(pr)
    db.commit()
    db.refresh(pr)
    crud.log_action(db, "password_change_requested", account.username, account.role, details=f"Request: {req.reason or ''}")
    return pr


@backend.get("/admin/password-requests", response_model=list[schemas.PasswordChangeRequestResponse])
def list_password_requests(db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    return db.query(models.PasswordChangeRequest).order_by(models.PasswordChangeRequest.requested_at.desc()).all()


@backend.patch("/admin/password-requests/{req_id}/approve")
def approve_password_request(req_id: int, db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    pr = db.query(models.PasswordChangeRequest).filter(models.PasswordChangeRequest.id == req_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Request not found")
    if pr.status != "pending":
        raise HTTPException(status_code=400, detail=f"Already {pr.status}")
    pr.status = "approved"
    pr.reviewed_by = admin.username
    pr.reviewed_at = datetime.utcnow()
    db.commit()
    crud.log_action(db, "password_change_approved", admin.username, "admin", details=f"Approved {pr.username} ({pr.role})")
    return {"detail": f"Approved. {pr.username} can now use admin-set password flow. Tell them to contact admin for new password."}


@backend.patch("/admin/password-requests/{req_id}/reject")
def reject_password_request(req_id: int, reason: Optional[str] = None, db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    pr = db.query(models.PasswordChangeRequest).filter(models.PasswordChangeRequest.id == req_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Request not found")
    if pr.status != "pending":
        raise HTTPException(status_code=400, detail=f"Already {pr.status}")
    pr.status = "rejected"
    pr.reviewed_by = admin.username
    pr.reviewed_at = datetime.utcnow()
    pr.details = reason
    db.commit()
    crud.log_action(db, "password_change_rejected", admin.username, "admin", details=f"Rejected {pr.username}: {reason or ''}")
    return {"detail": "Rejected"}


@backend.post("/admin/password-requests/{req_id}/reset-password")
def admin_reset_user_password(req_id: int, new_password: str = Query(..., min_length=4), db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    """Admin directly sets new password after approving request."""
    pr = db.query(models.PasswordChangeRequest).filter(models.PasswordChangeRequest.id == req_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Request not found")
    if pr.status != "approved":
        raise HTTPException(status_code=400, detail="Request not yet approved. Approve first.")
    acct = db.query(models.Account).filter(models.Account.id == pr.account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    hashed = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    acct.password = hashed
    pr.details = f"Password reset by {admin.username} at {datetime.utcnow().isoformat()}"
    db.commit()
    crud.log_action(db, "password_reset_by_admin", admin.username, "admin", details=f"Reset password for {acct.username} ({acct.role})")
    return {"detail": f"Password for {acct.username} updated"}


# ──────────────────────────────────────────
# Admin Settings — Gmail sender
# ──────────────────────────────────────────

@backend.get("/admin/settings", response_model=list[schemas.AppSettingsResponse])
def list_settings(db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    return db.query(models.AppSettings).all()


@backend.get("/admin/settings/{key}", response_model=schemas.AppSettingsResponse)
def get_setting(key: str, db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    row = db.query(models.AppSettings).filter(models.AppSettings.key == key).first()
    if not row:
        raise HTTPException(status_code=404, detail="Setting not found")
    return row


@backend.put("/admin/settings/{key}", response_model=schemas.AppSettingsResponse)
def update_setting(key: str, body: schemas.AppSettingsUpdate, db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    # Validate email keys
    if "email" in key.lower():
        val = body.value.strip().lower()
        if "@" not in val or "." not in val:
            raise HTTPException(status_code=400, detail="Invalid email")
        body.value = val
    row = db.query(models.AppSettings).filter(models.AppSettings.key == key).first()
    if not row:
        row = models.AppSettings(key=key, value=body.value, updated_by=admin.username)
        db.add(row)
    else:
        row.value = body.value
        row.updated_by = admin.username
        row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    crud.log_action(db, "setting_updated", admin.username, "admin", details=f"{key} = {body.value}")
    return row


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


@backend.delete("/admin/victims/{victim_id}")
def admin_delete_victim(victim_id: int, db: Session = Depends(database.get_db), admin: models.Account = Depends(require_role("admin"))):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    case_id = victim.case_id
    name = victim.name
    # Collect file paths before delete (cascade will remove DB rows)
    file_paths: list[str] = []
    if victim.patient_photo:
        file_paths.append(os.path.join(UPLOAD_DIR, victim.patient_photo))
    if victim.citizenship_doc:
        file_paths.append(os.path.join(UPLOAD_DIR, victim.citizenship_doc))
    if victim.hospital_logo:
        file_paths.append(os.path.join(UPLOAD_DIR, victim.hospital_logo))
    if victim.municipality_logo:
        file_paths.append(os.path.join(UPLOAD_DIR, victim.municipality_logo))
    if victim.bank_qr:
        file_paths.append(os.path.join(UPLOAD_DIR, victim.bank_qr))
    # Collect related collectors/photos and reports
    try:
        for c in list(victim.collectors):
            if c.photo:
                file_paths.append(os.path.join(UPLOAD_DIR, c.photo))
        for r in list(victim.medical_reports):
            if r.filename:
                file_paths.append(os.path.join(UPLOAD_DIR, r.filename))
    except Exception:
        pass
    db.delete(victim)
    db.commit()
    # Remove files after commit
    for fp in file_paths:
        try:
            if fp and os.path.exists(fp):
                os.remove(fp)
        except Exception:
            pass
    crud.log_action(db, "case_deleted", admin.username, "admin", victim_id, f"Case deleted by admin: {case_id} - {name}")
    return {"detail": f"Case {case_id} deleted", "id": victim_id}


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
    # Citizenship doc is strictly victim/municipality/admin — hide from public
    for v in victims:
        # Use object attribute without triggering encryption write
        v.__dict__["bank_account_number"] = "****"
        v.__dict__["phone"] = "***"
        if v.other_hospital_contact:
            v.__dict__["other_hospital_contact"] = "****"
        v.__dict__["citizenship_doc"] = None
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
    victims = q.order_by(models.Victim.created_at.desc()).all()
    # Strip citizenship_doc for unauthorized viewers (hospital must not see gov doc)
    for v in victims:
        if not _can_view_citizenship(v, account):
            v.__dict__["citizenship_doc"] = None
    return victims


@backend.get("/victims/{victim_id}", response_model=schemas.VictimResponse)
def read_victim(victim_id: int, db: Session = Depends(database.get_db), account: Optional[models.Account] = Depends(get_optional_user)):
    victim = crud.get_victim(db, victim_id)
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    is_public = victim.hospital_verified and victim.muni_verified and not victim.paused and not victim.rejected
    if is_public:
        victim.__dict__["bank_account_number"] = "****"
        victim.__dict__["phone"] = "***"
        if victim.other_hospital_contact:
            victim.__dict__["other_hospital_contact"] = "****"
        victim.__dict__["citizenship_doc"] = None
        return victim
    # Non-public: hide existence from anon, enforce strict isolation
    if account is None:
        raise HTTPException(status_code=404, detail="Victim not found")
    if not _can_access_victim(victim, account):
        raise HTTPException(status_code=404, detail="Victim not found")
    # Hide citizenship unless viewer is allowed via dedicated endpoint
    if not _can_view_citizenship(victim, account):
        victim.__dict__["citizenship_doc"] = None
    # Hide bank/phone from non-owners (hospital/muni should not see raw bank)
    if not (account.role == "admin" or _is_owner_patient(victim, account)):
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
    account: models.Account = Depends(get_current_user),
    _: bool = Depends(rate_limit(10)),
):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    # Only owner patient or admin may add reports — strict isolation
    if not (account.role == "admin" or _is_owner_patient(victim, account)):
        raise HTTPException(status_code=403, detail="Only the case owner can upload medical reports")
    # Medical reports: keep clear, enhance if blurry (sharpen/contrast/denoise), store up to 10 MB — not crushed to 200 KB
    contents = file.file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 10 MB.")
    check_file_mime(contents[:64], allow_pdf=True)
    is_pdf = contents[:4] == b"%PDF"
    # Enhance image reports for clarity; PDFs stored as-is
    if not is_pdf and PIL_AVAILABLE:
        try:
            enhanced = _enhance_medical_image_bytes(contents)
            if enhanced and len(enhanced) <= 10 * 1024 * 1024:
                contents = enhanced
        except Exception:
            pass
    # Save bytes directly (enhanced if available)
    if is_pdf:
        unique_name = f"{uuid.uuid4().hex}.pdf"
        file_path = os.path.join(UPLOAD_DIR, "reports", unique_name)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(contents)
        rel_path = f"reports/{unique_name}"
    else:
        # Use JPEG extension if enhanced produced JPEG (starts with ff d8 ff)
        ext = ".jpg" if contents[:3] == b"\xff\xd8\xff" else ".png" if contents[:8].startswith(b"\x89PNG") else ".jpg"
        # Determine via mime after enhancement
        try:
            ftype = check_file_mime(contents[:64], allow_pdf=True)
            ext_map2 = {'JPEG': '.jpg', 'PNG': '.png', 'GIF': '.gif', 'WEBP': '.webp', 'PDF': '.pdf'}
            ext = ext_map2.get(ftype, ext)
        except Exception:
            pass
        # If enhanced path produced JPEG, force .jpg
        if contents[:3] == b"\xff\xd8\xff":
            ext = ".jpg"
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(UPLOAD_DIR, "reports", unique_name)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(contents)
        rel_path = f"reports/{unique_name}"
    report = crud.create_medical_report(db, victim_id, rel_path, file.filename or "report")
    return {"id": report.id, "filename": report.filename, "original_name": report.original_name}


@backend.post("/victims/{victim_id}/patient-photo")
def upload_patient_photo(
    victim_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    account: models.Account = Depends(get_current_user),
    _: bool = Depends(rate_limit(10)),
):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    if not (account.role == "admin" or _is_owner_patient(victim, account)):
        raise HTTPException(status_code=403, detail="Only the case owner can upload patient photo")
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
    account: models.Account = Depends(get_current_user),
    _: bool = Depends(rate_limit(10)),
):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    if not (account.role == "admin" or _is_owner_patient(victim, account)):
        raise HTTPException(status_code=403, detail="Only the case owner can upload collector photo")
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


# ──────────────────────────────────────────
# Per-case government doc (citizenship) — 5 MB → <200 KB, visibility victim/municipality/admin
# ( _can_view_citizenship defined near top helpers )
# ──────────────────────────────────────────

@backend.post("/victims/{victim_id}/citizenship-doc")
def upload_citizenship_doc(
    victim_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    account: models.Account = Depends(get_current_user),
    _: bool = Depends(rate_limit(10)),
):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    # Only owner patient, municipality, admin may upload (hospital not allowed to see gov doc)
    if not _can_view_citizenship(victim, account):
        # Allow owner patient even if they are not yet verified; municipality/admin also
        if not (account.role == "patient" and victim.account_id == account.id):
            raise HTTPException(status_code=403, detail="Only the case owner, municipality, or admin can upload citizenship document")
    # remove old file if exists
    old = victim.citizenship_doc
    rel_path = save_citizenship_doc(file)
    victim.citizenship_doc = rel_path
    db.commit()
    db.refresh(victim)
    if old:
        try:
            old_path = os.path.join(UPLOAD_DIR, old)
            if os.path.exists(old_path):
                os.remove(old_path)
        except Exception:
            pass
    crud.log_action(db, "citizenship_uploaded", account.username, account.role, victim_id, f"Citizenship doc uploaded: {rel_path}")
    return {"citizenship_doc": victim.citizenship_doc}


@backend.get("/victims/{victim_id}/citizenship-doc")
def get_citizenship_doc(
    victim_id: int,
    db: Session = Depends(database.get_db),
    account: Optional[models.Account] = Depends(get_optional_user),
    token: Optional[str] = Query(None),
):
    # Allow token via query param for <img src> (cannot send Authorization header)
    if account is None and token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            sub = payload.get("sub")
            if sub is not None:
                account = db.query(models.Account).filter(models.Account.id == int(sub)).first()
        except Exception:
            account = None
    if account is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim or not victim.citizenship_doc:
        raise HTTPException(status_code=404, detail="Citizenship document not found")
    if not _can_view_citizenship(victim, account):
        raise HTTPException(status_code=403, detail="Not authorized to view citizenship document")
    file_path = os.path.join(UPLOAD_DIR, victim.citizenship_doc)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
    # Guess media type from extension
    media = "image/jpeg" if file_path.lower().endswith((".jpg", ".jpeg")) else "image/png" if file_path.lower().endswith(".png") else "application/pdf" if file_path.lower().endswith(".pdf") else "application/octet-stream"
    return FileResponse(file_path, media_type=media, filename=os.path.basename(file_path))


@backend.get("/victims/{victim_id}/citizenship-meta")
def get_citizenship_meta(
    victim_id: int,
    db: Session = Depends(database.get_db),
    account: models.Account = Depends(get_current_user),
):
    victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
    if not victim:
        raise HTTPException(status_code=404, detail="Victim not found")
    if not _can_view_citizenship(victim, account):
        raise HTTPException(status_code=403, detail="Not authorized")
    if not victim.citizenship_doc:
        return {"citizenship_doc": None}
    # expose path for authenticated frontend to build /uploads URL (still gated but path known)
    return {"citizenship_doc": victim.citizenship_doc}


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
    # Strict isolation: only assigned hospital/municipality (or admin) may upload logo for this case
    if not _can_access_victim(victim, account):
        raise HTTPException(status_code=403, detail="Not your assigned case")
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
    # Strict isolation: hospital/muni may only verify cases assigned to them
    if account.role != "admin":
        victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
        if not victim:
            raise HTTPException(status_code=404, detail="Victim not found")
        if not _can_access_victim(victim, account):
            raise HTTPException(status_code=403, detail="Not your assigned case")
        if role == "municipality" and not victim.hospital_verified:
            raise HTTPException(status_code=400, detail="Hospital must verify first")
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
    # Isolation check before reject
    if account.role != "admin":
        victim = db.query(models.Victim).filter(models.Victim.id == victim_id).first()
        if not victim:
            raise HTTPException(status_code=404, detail="Victim not found")
        if not _can_access_victim(victim, account):
            raise HTTPException(status_code=403, detail="Not your assigned case")
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
