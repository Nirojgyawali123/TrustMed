# Main Dashboard

**Access:** Public (Everyone)

The landing page of TrustMed. Accessible without login.

| Element | Description |
|---------|-------------|
| Logo | Brand mark + TrustMed name |
| Tagline | Small text highlighting the website |
| Login / Signup | Authentication buttons |
| Success Stories | Fully funded / cured patients |
| Active Cases | Patients currently needing help with progress bars |
| Search | Find a case by serial number (case ID) or QR code scan |

---

# Patient Login & Signup

## Signup

**Access:** Public (any citizen can register as patient)

| Field | Unique? |
|-------|---------|
| Full Name | — |
| Date of Birth | — |
| Address | — |
| Phone Number | — |
| Citizenship Number | ✅ Yes |
| Username | ✅ Yes |
| Password | — |

**Rule:** Citizenship is checked for duplicates. Two people can share name, DOB, and address — but never citizenship number.

## Login

| Method | Fields | Redirect |
|--------|--------|----------|
| Normal | Username + Password | `dashboard.html` |

## Forgot Password

| Step | Input | Verification |
|------|-------|-------------|
| 1 | Citizenship + Phone | Match against account |
| 2 | SMS code to phone | User enters code |
| 3 | New password | Password updated |

---

# Patient Case Submission

**Access:** Logged-in patients only

## Step 1 — Patient Information (compulsory)

| Field |
|-------|
| Full Name (pre-filled) |
| Date of Birth (pre-filled) |
| Address (pre-filled) |
| Phone (pre-filled) |
| Citizenship (pre-filled) |
| Patient Photo |
| Municipality |
| Hospital Name |
| Estimated Cost (NPR) |

## Step 2 — Bank Details (compulsory)

| Field |
|-------|
| Bank Name |
| Account Holder Name |
| Account Number |
| Branch |

## Step 3 — Medical Reports

- At least 1 image required (JPG/PNG)
- No upper limit
- Rate limited: ~1 upload per 4-5 seconds

## Step 4 — Collectors (optional, can add multiple)

Toggle: "Someone collecting cash donations on behalf of the patient?"

If yes, each collector needs:

| Field |
|-------|
| Full Name |
| Address |
| Contact Number |
| Face Photo |
| Relation to Victim |
| Citizenship Details (if possible) |

Button: **+ Add Another Collector**

## Step 5 — Note to Donors (optional)

A short message for people who donate.

---

# Patient Dashboard

**Access:** Logged-in patients only

After login, patient lands on `dashboard.html`. All submitted cases are displayed.

| Element |
|---------|
| Patient Photo |
| Patient Details (name, address, phone, municipality, hospital — neat, not paragraph) |
| Medical Documents (viewable/downloadable) |
| Estimated Cost |
| Total Collected (tracked periodically) |
| Progress Bar (collected vs goal) |
| Collectors Count (e.g. "3 collectors") |
| Status Badge (Pending Hospital / Pending Municipality / Verified & Live / Paused) |

---

# Hospital View

**Access:** Hospital staff (logged in with hospital account)

Hospital only sees cases that belong to **their hospital**.

## Case Display

All patient details displayed in clean, scannable layout:

| Element |
|---------|
| Patient Photo |
| Full Name |
| Address |
| Phone |
| DOB |
| Municipality |
| Diagnosis |
| Estimated Cost |
| Bank Details |
| Medical Reports (viewable/downloadable) |
| Collectors (name, photo, relation, contact) |
| Note to Donors |
| Case ID + Status |

## Actions

| Button | Behavior |
|--------|----------|
| **Approve** | Verifies diagnosis → case moves to municipality queue |
| **Reject & Send Back** | Optional reason field (not compulsory) → case sent back to patient dashboard → patient can fix and resubmit |

---

# Municipality View

**Access:** Municipality staff (logged in with municipality account)

Municipality only sees cases that belong to **their municipality** and have already been **approved by the hospital**.

## Case Display

All patient details displayed in clean, scannable layout (same as hospital):

| Element |
|---------|
| Patient Photo |
| Full Name |
| Address |
| Phone |
| DOB |
| Municipality |
| Diagnosis |
| Estimated Cost |
| Bank Details |
| Medical Reports (viewable/downloadable) |
| Collectors (name, photo, relation, contact) |
| Note to Donors |
| Case ID + Status |

## Actions

| Button | Behavior |
|--------|----------|
| **Verify** | Confirms identity → case goes **LIVE** (publicly visible) |
| **Reject & Send Back** | Optional reason field (not compulsory) → case sent back to patient dashboard → patient can fix and resubmit |

---

# Hospital & Municipality Logo

- Each hospital and municipality account can **upload their own logo**
- Logo appears on the case card / detail page as a verification badge
- Before verification: no logo shown
- After hospital verification: hospital logo appears
- After municipality verification: municipality logo also appears
- Both logos are displayed together on verified (live) cases

---

# Verification Notification & Public Visibility

## Notification

When a case passes each verification stage:
- **Hospital approves** → patient dashboard updates
- **Municipality approves** → patient dashboard updates
- **Case goes live** → patient notified on dashboard
- **Rejected & sent back** → patient sees the reason on dashboard, can fix and resubmit

## Public Case Display — What to SHOW vs HIDE

| Detail | Public | Hospital | Municipality | Admin |
|--------|--------|----------|-------------|-------|
| Patient Name | ✅ | ✅ | ✅ | ✅ |
| Patient Photo | ✅ | ✅ | ✅ | ✅ |
| Age (calculated) | ✅ | ✅ | ✅ | ✅ |
| **Full DOB** | ❌ | ✅ | ✅ | ✅ |
| Phone Number | ✅ | ✅ | ✅ | ✅ |
| Address | ✅ | ✅ | ✅ | ✅ |
| Municipality | ✅ | ✅ | ✅ | ✅ |
| Hospital Name | ✅ | ✅ | ✅ | ✅ |
| Diagnosis | ✅ | ✅ | ✅ | ✅ |
| Estimated Cost | ✅ | ✅ | ✅ | ✅ |
| Total Collected | ✅ | ✅ | ✅ | ✅ |
| Progress Bar | ✅ | ✅ | ✅ | ✅ |
| Medical Reports | ✅ | ✅ | ✅ | ✅ |
| Bank Details | ✅ | ✅ | ✅ | ✅ |
| Collectors (name, photo, relation) | ✅ | ✅ | ✅ | ✅ |
| Note to Donors | ✅ | ✅ | ✅ | ✅ |
| Hospital Logo (if verified) | ✅ | ✅ | ✅ | ✅ |
| Municipality Logo (if verified) | ✅ | ✅ | ✅ | ✅ |
| **Citizenship Number** | ❌ | ✅ | ✅ | ✅ |

---

# Admin View

**Access:** Admin only (logged in with admin account)

## Capabilities

| Capability | Detail |
|------------|--------|
| **View all patient details** | Full access to all cases, all roles |
| **View hospital info** | See which hospital each patient belongs to |
| **Pause a case** | Remove from public if suspected fake |
| **Resume a case** | Represent on public once confirmed legitimate |
| **Overall stats** | Total accepted/rejected by each hospital and municipality |
| **Create accounts** | Create hospital and municipality accounts (username + password) |
| **Redistribute overfunded money** | If a case collects more than its goal, admin can allocate excess to underfunded cases |

---

# Security & Encryption

## 1. Authentication & Authorization

| Issue | Fix |
|-------|-----|
| Passwords stored in plain text | ✅ Hash with bcrypt |
| Password sent in sessionStorage | ✅ JWT tokens with expiry |
| No session timeout | ✅ Token refresh + expiry |
| Admin uses raw headers | ✅ Replace with JWT + role-based middleware |

## 2. File Upload Security

| Threat | Fix |
|--------|-----|
| Random or fake images | ✅ Server-side MIME validation (check file bytes, not extension) |
| Malware disguised as images | ✅ Strip EXIF, re-encode images, block non-image MIME types |
| Bot spam uploading many files | ✅ Rate limiting (~1 per 4-5 sec + per-IP limits) |
| Unlimited file size | ✅ Max file size enforced (e.g. 5MB per image) |

## 3. Data Encryption

| Layer | Measure |
|-------|---------|
| In transit | ✅ HTTPS required for all API calls |
| Citizenship numbers | ✅ Encrypted at DB level (AES-256) — never exposed in API responses |
| DOB / Phone | ✅ Encrypted in DB, decrypted only for authorized roles |
| Passwords | ✅ bcrypt hash (one-way, never decryptable) |
| Database file | ✅ SQLite encryption at rest |

## 4. Access Control

| Vulnerability | Fix |
|---------------|-----|
| Anyone can call any API | ✅ Role middleware on every route |
| Patient A sees Patient B's case | ✅ Ownership checks |
| Hospital sees other hospital's cases | ✅ Scope filtering by hospital name |
| CORS allows all origins | ✅ Restrict to specific frontend origin only |

## 5. Rate Limiting & Abuse Prevention

| Measure | Detail |
|---------|--------|
| Login attempts | Max 5 failed attempts → 15 min lockout |
| File uploads | ~1 per 4-5 seconds per session |
| API calls | Global rate limit per IP |
| Signup | Max 3 accounts per IP per day |

## 6. Audit Logging

| Event | Logged? |
|-------|---------|
| Login attempts (success/fail) | ✅ Yes |
| Case submissions | ✅ Yes |
| Verifications (approve/reject) | ✅ Yes + who did it |
| Admin pause/resume | ✅ Yes |
| Account creation | ✅ Yes |
| Money redistribution | ✅ Yes (future) |

---

# Printable A4 Verification Document

**Access:** After full verification (hospital + municipality approved), anyone can print/download from the case detail page.

## Format

| Property | Value |
|----------|-------|
| Paper Size | **A4** (all pages) |
| Page Count | 2–3 pages |
| Button | "Download PDF" or "Print" on case detail page |

## Two QR Codes (highlighted, on all pages)

| QR | Label | When scanned |
|----|-------|-------------|
| 🔍 **QR 1 — Case Info** | "Scan to view this case online" | Opens public case detail page |
| 💰 **QR 2 — Donate** | "Scan to donate directly" | Opens payment link → funds go to victim's hospital bank account |

Both QR codes are placed side by side at the top or sidebar of every page, clearly labeled and large enough to scan.

## Page 1 — Patient Overview

| Element |
|---------|
| TrustMed Logo + Brand |
| Case ID |
| Two QR Codes (Info + Donate) |
| Patient Photo (small, passport-size) |
| Patient Name, Age, Address, Phone |
| Municipality Name |
| Hospital Name |
| Hospital Logo (if verified) |
| Municipality Logo (if verified) |
| Verification Badges ✅✅ |

## Page 2 — Medical & Financial

| Element |
|---------|
| Diagnosis / Disease |
| Medical Reports (small size images, 1-2) |
| Estimated Cost |
| Total Collected |
| Bank Details |
| Note to Donors (optional) |

## Page 3 — Collectors

Each collector on record:

| Element |
|---------|
| Collector Photo (small face image) |
| Full Name |
| Address |
| Contact Number |
| Relation to Victim |

Multiple collectors are listed on this page. This page serves as **authorization proof** for collectors collecting cash in person.
