# TrustMed — Frontend Architecture & Developer Guide

Frontend application for **TrustMed** (Verified Medical Crowdfunding), built with Vite, Tailwind CSS v4, vanilla ES Modules, and HTML5.

---

## Tech Stack & Architecture

- **Bundler**: [Vite](https://vitejs.dev/) with multi-page HTML entry points.
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) via `@tailwindcss/vite` + CSS custom properties design tokens (`src/css/style.css`).
- **Scripts**: Native modern ES Modules (`src/js/*.js`, `src/api.js`).
- **Icons & Assets**: SVG sprite system (`public/icons.svg`) & static SVGs (`public/favicon.svg`).
- **Proxy**: Vite development proxy routing `/auth`, `/victims`, `/admin`, and `/uploads` to the FastAPI backend (`http://127.0.0.1:8000`).

---

## Directory Structure

```
frontend/
├── index.html                 # Root redirect entry (routes to src/pages/index.html)
├── vite.config.js             # Vite config: multi-page inputs & backend proxy
├── package.json               # Node dependencies & npm scripts
├── public/
│   ├── favicon.svg            # Platform shield favicon
│   └── icons.svg              # Core SVG sprite library
└── src/
    ├── api.js                 # Central HTTP client, JWT auth & device tracker
    ├── css/
    │   └── style.css          # Design tokens, CSS components & utility styles
    ├── js/
    │   ├── topbar.js          # Global responsive navbar with role switcher
    │   ├── cases.js           # Public catalog & search controller
    │   ├── case.js            # Public case detail & QR donation controller
    │   ├── dashboard.js       # Patient fundraiser management controller
    │   ├── submit.js          # 5-Step case submission wizard controller
    │   ├── hospital.js        # Hospital desk verification controller
    │   ├── municipality.js    # Municipal ward verification controller
    │   ├── god.js             # Superadmin console & audit log controller
    │   ├── login.js           # Login & role-based routing controller
    │   ├── signup.js          # Patient registration controller
    │   └── logout.js          # Global signout helper
    └── pages/
        ├── index.html         # Landing page & trust showcase
        ├── cases.html         # Public case directory
        ├── case.html          # Case detail & direct donation
        ├── dashboard.html     # Patient management console
        ├── submit.html        # 5-step submission wizard
        ├── hospital.html      # Hospital verification portal
        ├── municipality.html  # Municipality verification portal
        ├── god.html           # Superadmin console
        ├── login.html         # Login interface
        └── signup.html        # Registration interface
```

---

## Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Dev Server
```bash
npm run dev
```
The application will be accessible at `http://127.0.0.1:5173`. Requests to `/auth`, `/victims`, `/admin`, and `/uploads` will proxy directly to `http://127.0.0.1:8000`.

### 3. Production Build
```bash
npm run build
```
Generates production-ready static assets in `dist/`.

---

## Application Workflows & Pages

| Page | Path | Target Audience | Purpose |
|---|---|---|---|
| **Landing** | `src/pages/index.html` | Public | Platform value proposition, trust indicators, instant search, featured cases |
| **Catalog** | `src/pages/cases.html` | Public | Searchable, filterable directory of verified medical cases |
| **Detail** | `src/pages/case.html` | Public | Verified diagnosis, hospital & ward badges, Bank QR donation, authorized collectors, A4 PDF |
| **Dashboard** | `src/pages/dashboard.html` | Patient | Personal fundraiser list, status badges, progress bars, rejection feedback & resubmit |
| **Submit** | `src/pages/submit.html` | Patient | 5-step wizard (Patient info, Bank QR, Reports, Collectors, Note) with Gov ID compression |
| **Hospital** | `src/pages/hospital.html` | Hospital Staff | Scoped verification queue, medical reports viewer, logo upload, approval/rejection |
| **Municipality**| `src/pages/municipality.html` | Ward Officials | Scoped civic queue, Government ID inspector, logo upload, publish live/rejection |
| **Admin** | `src/pages/god.html` | Superadmin | Platform KPI metrics, pause/resume kill-switch, unregistered hospital resolution, audit trail |
| **Auth** | `login.html`, `signup.html` | All Users | JWT authentication, patient registration with unique citizenship number, role redirect |

For detailed system and operational workflow documentation, see [`SYSTEM_WORKFLOWS_DOCUMENTATION.md`](../SYSTEM_WORKFLOWS_DOCUMENTATION.md).
