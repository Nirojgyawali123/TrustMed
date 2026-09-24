# TrustMed — Verified Medical Crowdfunding

A medical crowdfunding platform where every case is **verified by the treating hospital** and **approved by the municipality** before going public, ensuring donations reach authentic patients.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3, FastAPI, SQLAlchemy, SQLite, bcrypt, python-jose (JWT), fpdf2 |
| Frontend | Vite, vanilla HTML/CSS/JS, Tailwind CSS v4 |
| Auth | JWT Bearer Tokens, bcrypt password hashing, role-based route guards |
| Assets | Static file uploads (enhanced medical reports, bank QR, compressed Gov ID <200KB, logos) |

> [!NOTE]
> **Complete System Workflows & Architecture Guide**: See [SYSTEM_WORKFLOWS_DOCUMENTATION.md](SYSTEM_WORKFLOWS_DOCUMENTATION.md) for full visual flowcharts, 5-step wizard details, security/privacy matrix, and role guides.

---

## Project Structure

```
TrustMed1/
├── backend/
│   ├── main.py          # FastAPI app, routes, auth logic
│   ├── database.py      # SQLAlchemy engine, session, seed_admin()
│   ├── models.py        # Account, Victim, Collector, MedicalReport
│   ├── schemas.py       # Pydantic request/response models
│   └── crud.py          # Database operations
├── frontend/
│   ├── src/
│   │   ├── pages/       # HTML pages
│   │   │   ├── index.html        # Home
│   │   │   ├── cases.html        # Browse all cases
│   │   │   ├── case.html         # Case detail
│   │   │   ├── login.html        # Login
│   │   │   ├── signup.html       # Signup
│   │   │   ├── submit.html       # Submit new case
│   │   │   ├── hospital.html     # Hospital verification dashboard
│   │   │   ├── municipality.html # Municipality verification dashboard
│   │   │   └── god.html          # Admin panel
│   │   ├── js/          # Page-specific JS (per-page logic)
│   │   ├── css/style.css
│   │   └── api.js       # API client (auth, victims, admin)
│   ├── vite.config.js   # Dev proxy to backend on port 8000
│   └── package.json
├── uploads/
│   ├── reports/         # Medical reports uploaded per victim
│   └── collectors/      # Collector profile photos
├── techmed.db           # SQLite database (auto-created)
├── run-backend.bat      # Windows batch script (backend)
├── run-backend.ps1      # Windows PowerShell script (backend)
├── package.json         # Root scripts (npm run backend)
└── requirements.txt     # Python dependencies
```

---

## Database Models

### Account
| Column | Type | Notes |
|--------|------|-------|
| id | Integer | PK |
| username | String | Unique, indexed |
| password | String | Plain text (dev only) |
| role | String | `admin`, `patient`, `hospital`, `municipality` |
| full_name | String | Patient full name |
| dob | String | Date of birth |
| address | String | Home address |
| phone | String | Contact number |
| citizenship | String | **Unique** — acts as real-world primary key (S2) |

### Victim
| Column | Type | Notes |
|--------|------|-------|
| id | Integer | PK |
| name | String | Victim's full name |
| phone | String | Contact number |
| address | String | Home address |
| disease | String | Medical condition |
| hospital_name | String | Treating hospital |
| municipality_name | String | Local ward/municipality |
| estimated_cost | Float | Treatment cost goal |
| total_collected | Float | Amount raised (default 0) |
| bank_name | String | Bank details |
| bank_account_number | String | Bank details |
| bank_account_holder | String | Bank details |
| bank_branch | String | Bank details |
| hospital_verified | Boolean | Verified by hospital |
| muni_verified | Boolean | Approved by municipality |
| paused | Boolean | Temporarily hidden |

### Collector (person raising funds on behalf of victim)
| Column | Type | Notes |
|--------|------|-------|
| id | Integer | PK |
| name | String | Collector name |
| address | String | Collector address |
| relation_to_victim | String | e.g. "brother", "friend" |
| contact | String | Phone/contact |
| photo | String | File path (optional) |
| victim_id | Integer | FK -> victims.id |

### MedicalReport
| Column | Type | Notes |
|--------|------|-------|
| id | Integer | PK |
| victim_id | Integer | FK -> victims.id |
| filename | String | Stored path in uploads/reports/ |
| original_name | String | Original uploaded filename |

---

## API Endpoints

### Auth
| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| POST | `/auth/login` | None | `{username, password}` | `{id, username, role}` |
| POST | `/auth/signup` | None | `{username, password}` | `{id, username, role}` (role=patient) |

### Admin (requires headers: `X-Admin-User`, `X-Admin-Pass`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/create-account` | Create hospital/municipality account |
| GET | `/admin/accounts` | List all accounts |
| GET | `/admin/victims` | List all victims |
| GET | `/admin/stats` | Summary statistics |
| PATCH | `/admin/victims/{id}/pause` | Pause a case |
| PATCH | `/admin/victims/{id}/unpause` | Unpause a case |

### Victims
| Method | Path | Description |
|--------|------|-------------|
| GET | `/victims/` | List all victims |
| GET | `/victims/{id}` | Get victim detail |
| POST | `/victims/` | Create new victim case |
| POST | `/victims/{id}/reports` | Upload medical report |
| POST | `/victims/{id}/collector-photo` | Upload collector photo |
| PATCH | `/victims/{id}/verify/{role}` | Verify case (role: `hospital` or `municipality`) |

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+

### Backend Setup

```bash
# Using run script (Windows)
run-backend.bat

# Or manually
python -m venv venv
venv\Scripts\pip install -r requirements.txt
set PYTHONPATH=%CD%
venv\Scripts\python -m uvicorn backend.main:backend --reload --host 127.0.0.1 --port 8000

# Or via npm
npm run backend
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/auth`, `/victims`, and `/admin` requests to the backend on `http://127.0.0.1:8000`.

### Default Admin Credentials
- **Username:** `niroj`
- **Password:** `niroj`

Admin is auto-seeded on first run in `backend/database.py:seed_admin()`.

---

## Verification Flow

```
Patient submits case
       │
       ▼
Hospital verifies diagnosis ──► PATCH /victims/{id}/verify/hospital
       │
       ▼
Municipality verifies identity ──► PATCH /victims/{id}/verify/municipality
       │
       ▼
  Case goes public (visible on home page)
```

Only cases with `hospital_verified=True`, `muni_verified=True`, and `paused=False` appear on the public home page.

---

## User Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Full access: manage accounts, pause/unpause cases, view stats |
| **Hospital** | Verify medical diagnosis for cases |
| **Municipality** | Verify patient identity and address |
| **Patient** | Submit new cases, upload reports |
