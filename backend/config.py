import os

# Load .env if present (local dev). Render injects env directly, so no file needed there.
try:
    from dotenv import load_dotenv
    # root .env is one level above backend/
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
    load_dotenv()  # also try cwd
except ImportError:
    pass

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET or JWT_SECRET == "techmed-dev-secret-change-in-production":
    # Fail fast in production, allow dev with warning
    if os.getenv("ENV", "development") == "production":
        raise RuntimeError("JWT_SECRET must be set in production (no fallback allowed)")
    # dev fallback only if no .env present — warn
    if not JWT_SECRET:
        JWT_SECRET = "techmed-dev-secret-change-in-production"
        print("WARNING: Using weak fallback JWT_SECRET — set JWT_SECRET in .env for tight security")

FILE_ENC_KEY = os.environ.get("FILE_ENC_KEY", JWT_SECRET)

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8 hours (was 30 days) — short-lived for tight isolation

# Email / OTP settings
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "")  # e.g. trustmed66@gmail.com
SMTP_PASS = os.getenv("SMTP_PASS", "")  # Gmail App Password (16 chars, no spaces)
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "trustmed66@gmail.com")
OTP_EXPIRE_MINUTES = int(os.getenv("OTP_EXPIRE_MINUTES", "3"))
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "2"))
OTP_RESEND_COOLDOWN_SECONDS = int(os.getenv("OTP_RESEND_COOLDOWN_SECONDS", "60"))

# CORS origins: comma-separated list. Example: https://trust-med-fyvy.vercel.app,http://localhost:5173
_raw_frontend = os.getenv("FRONTEND_ORIGIN", "").strip()
if _raw_frontend:
    FRONTEND_ORIGINS = [o.strip().rstrip("/") for o in _raw_frontend.split(",") if o.strip()]
else:
    # sensible defaults: production locked to Vercel + Render, dev allows localhost + Vercel
    if os.getenv("ENV", "development") == "production":
        FRONTEND_ORIGINS = ["https://trust-med-fyvy.vercel.app", "https://trustmed-uzm1.onrender.com"]
    else:
        FRONTEND_ORIGINS = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://trust-med-fyvy.vercel.app",
        ]