import os
import re
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from sqlalchemy.orm import Session

from backend.config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM


def _get_sender_email(db: Optional[Session] = None) -> str:
    """Resolve sender email: DB app_settings overrides env."""
    if db is not None:
        try:
            from backend.models import AppSettings
            row = db.query(AppSettings).filter(AppSettings.key == "smtp_from_email").first()
            if row and row.value:
                v = row.value.strip()
                if v and "@" in v:
                    return v
        except Exception:
            pass
    # Fallback to env
    env_sender = (os.getenv("SMTP_FROM") or SMTP_FROM or SMTP_USER or "nirojgyawali45@gmail.com").strip()
    return env_sender


def _build_otp_html(code: str) -> str:
    # Exact text per spec, code in blue
    return f"""\
<div style="font-family:Inter,system-ui,-apple-system,sans-serif;color:#111827;line-height:1.6;max-width:480px;">
  <p style="font-size:14px;color:#374151;">Here is your one time verification otp code.</p>
  <p style="font-size:28px;font-weight:800;color:#2563eb;letter-spacing:4px;background:#eff6ff;display:inline-block;padding:12px 20px;border-radius:10px;margin:14px 0 8px 0;">{code}</p>
  <p style="color:#6b7280;font-size:13px;margin-top:12px;">note: donot share your code with other</p>
  <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
  <p style="font-size:11px;color:#9ca3af;">TrustMed • This code expires in 3 minutes. If you did not request this, ignore this email.</p>
</div>
"""


def send_otp_email(to_email: str, code: str, db: Optional[Session] = None, recipient_name: str = "") -> bool:
    """Send OTP email via Gmail SMTP. Returns True on success, False on dev fallback.
    If SMTP_USER/PASS empty, logs to console and returns False (dev mode)."""
    to_email = (to_email or "").strip()
    if not to_email or "@" not in to_email:
        print(f"[email] invalid recipient: {to_email}")
        return False

    sender = _get_sender_email(db)
    subject = f"TrustMed OTP — {code}"

    # Dev fallback: if no credentials, log and pretend success for flow
    smtp_user = (os.getenv("SMTP_USER") or SMTP_USER or "").strip()
    smtp_pass = (os.getenv("SMTP_PASS") or SMTP_PASS or "").strip()
    if not smtp_user or not smtp_pass:
        # No SMTP configured — log OTP for dev testing
        print(f"\n{'='*60}\n[DEV MODE] OTP for {to_email} (from {sender}): {code}\n{'='*60}\nHTML preview available in logs.\n")
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = sender
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(_build_otp_text(code), "plain", "utf-8"))
    msg.attach(MIMEText(_build_otp_html(code), "html", "utf-8"))

    try:
        host = os.getenv("SMTP_HOST") or SMTP_HOST or "smtp.gmail.com"
        port = int(os.getenv("SMTP_PORT") or SMTP_PORT or 465)
        if port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=20) as server:
                server.login(smtp_user, smtp_pass)
                server.sendmail(sender, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=20) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                server.login(smtp_user, smtp_pass)
                server.sendmail(sender, [to_email], msg.as_string())
        print(f"[email] OTP sent to {to_email} from {sender}")
        return True
    except Exception as e:
        print(f"[email] failed to send to {to_email}: {e}")
        # Fallback log so dev flow not blocked
        print(f"[email fallback] OTP for {to_email}: {code}")
        return False


def _build_otp_text(code: str) -> str:
    return f"Here is your one time verification otp code. {code}\nnote: donot share your code with other\nThis code expires in 3 minutes."
