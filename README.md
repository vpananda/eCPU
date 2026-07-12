# E3 — Post Harvest Processing Unit

Professional mobile app + API for managing an industrial spice/produce drying operation. Multi-branch, role-scoped, with complete audit trail.

**Meaning:** Energy · Efficient · Environment
**Tagline:** Post Harvest Processing Unit

---

## Table of Contents
1. [Tech Stack](#tech-stack)
2. [Repository Layout](#repository-layout)
3. [Prerequisites](#prerequisites)
4. [Local Development](#local-development)
5. [Environment Variables](#environment-variables)
6. [Seeded Data](#seeded-data)
7. [Testing](#testing)
8. [Deployment](#deployment)
9. [Key Features](#key-features)
10. [API Overview](#api-overview)
11. [Frontend Routes](#frontend-routes)
12. [Troubleshooting](#troubleshooting)

---

## Tech Stack

**Frontend**
- Expo SDK 54 (React Native, TypeScript)
- Expo Router — file-based navigation
- `@expo/vector-icons` (Material Community)
- `expo-image-picker` — camera + gallery (photos stored as base64 in v1)
- `expo-web-browser` + `expo-linking` — Google auth callback
- `react-native-qrcode-svg` + `react-native-svg`
- Poppins Black / SemiBold bundled via `expo-font`
- `@/src/utils/storage` wrapper (SecureStore on native, localStorage on web)

**Backend**
- FastAPI + Uvicorn
- Motor (async MongoDB driver)
- passlib[bcrypt] — password hashing
- PyJWT — token issuance
- httpx — outbound HTTP for Google session verification

**Database:** MongoDB. Images are base64 in v1 — recommend migrating to Cloudflare R2 / Cloudinary for production.

---

## Repository Layout

```
app/
├── backend/
│   ├── server.py              # Single-file FastAPI service (all endpoints)
│   ├── .env                   # MONGO_URL, DB_NAME, JWT_SECRET
│   ├── requirements.txt
│   └── tests/
│       ├── test_ethree_api.py   # 29 tests (iteration 1)
│       └── test_ethree_iter2.py # 24 tests (iteration 2)
├── frontend/
│   ├── app/                   # File-based routes (Expo Router)
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── login.tsx
│   │   ├── (tabs)/            # Bottom nav
│   │   │   ├── _layout.tsx
│   │   │   ├── dashboard.tsx
│   │   │   ├── customers.tsx
│   │   │   ├── new-entry.tsx  # Quick Actions bottom sheet
│   │   │   ├── machines.tsx
│   │   │   └── more.tsx
│   │   ├── arrival-form.tsx
│   │   ├── arrivals.tsx
│   │   ├── batch/[id].tsx
│   │   ├── customer/[id].tsx
│   │   ├── customer-form.tsx
│   │   ├── delivery/[id].tsx
│   │   ├── delivery-picker.tsx
│   │   ├── expense-form.tsx
│   │   ├── expenses.tsx
│   │   ├── machine/[id].tsx
│   │   ├── maintenance-form.tsx
│   │   ├── maintenance.tsx
│   │   ├── payment/[id].tsx
│   │   ├── payment-picker.tsx
│   │   ├── payments.tsx
│   │   ├── reports.tsx
│   │   ├── search.tsx
│   │   ├── settings.tsx
│   │   ├── audit.tsx
│   │   ├── users-admin.tsx    # Admin only
│   │   ├── branches-admin.tsx # Admin only
│   │   └── batches.tsx
│   ├── assets/
│   │   ├── fonts/             # Poppins-Black, Poppins-SemiBold, SpaceMono
│   │   └── images/            # icon.png, adaptive-icon.png, splash-image.png, e3logo.png
│   ├── src/
│   │   ├── api.ts             # Fetch wrapper with auth header
│   │   ├── auth.tsx           # Auth context (JWT + Google)
│   │   ├── google-auth.ts     # Emergent Google OAuth helpers
│   │   ├── theme.ts           # Colors, spacing, radius, shadow
│   │   ├── components/        # Button, Input, Picker, Toast, ui.tsx
│   │   ├── hooks/             # use-brand-fonts, use-icon-fonts
│   │   └── utils/storage/     # Cross-platform secure/plain KV store
│   ├── app.json               # Expo config (name=E3, icons, permissions)
│   ├── package.json
│   └── tsconfig.json
├── memory/
│   ├── PRD.md
│   └── test_credentials.md
├── e3-openapi.json            # Full OpenAPI 3.0 spec (29 endpoints)
├── e3-postman-collection.json # Postman v2.1 collection
└── README.md                  # (this file)
```

---

## Prerequisites

- Node.js 18+ and Yarn 1.x
- Python 3.11+
- MongoDB 6+ running locally on `mongodb://localhost:27017` (or MongoDB Atlas)
- **Expo Go** on iOS/Android for on-device preview (or an emulator)

---

## Local Development

### 1. Clone & install

```bash
git clone <repo-url> e3
cd e3

# Backend
cd backend
pip install -r requirements.txt
cd ..

# Frontend
cd frontend
yarn install
cd ..
```

### 2. Environment variables

**backend/.env**
```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="ethree_agro"
JWT_SECRET="change-this-in-production-please"
```

**frontend/.env**
```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
# Managed by platform — do not modify:
EXPO_PACKAGER_PROXY_URL=<managed>
EXPO_PACKAGER_HOSTNAME=<managed>
```

### 3. Run

```bash
# Terminal 1 — MongoDB
mongod

# Terminal 2 — Backend (http://localhost:8001, docs at /docs)
cd backend
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Terminal 3 — Expo Metro bundler
cd frontend
yarn start        # QR code for Expo Go; press "w" for web
```

### 4. First login

Backend seeds 3 users on startup:

| Role | Mobile | Password |
|---|---|---|
| Admin | `9999999999` | `admin123` |
| Manager | `8888888888` | `manager123` |
| Store Incharge | `7777777777` | `store123` |

The login screen has one-tap "demo" buttons for each.

---

## Environment Variables

### Backend `.env`
| Key | Purpose | Example |
|---|---|---|
| `MONGO_URL` | Mongo connection string | `mongodb://localhost:27017` |
| `DB_NAME` | Database name | `ethree_agro` |
| `JWT_SECRET` | HS256 signing secret (≥ 32 chars) | random string |

### Frontend `.env`
| Key | Purpose | Example |
|---|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | Base URL for the API | `https://api.e3.example.com` |
| `EXPO_PACKAGER_PROXY_URL` | Managed by platform | *do not modify* |
| `EXPO_PACKAGER_HOSTNAME` | Managed by platform | *do not modify* |

The API client (`src/api.ts`) prepends `/api` automatically. All API routes are prefixed `/api` to match the ingress rule that redirects `/api/*` → backend port 8001.

---

## Seeded Data

On first backend startup, the following is created (idempotent):

- **1 branch**: "Main Branch"
- **3 users**: Admin, Manager, Store Incharge — all on Main Branch
- **8 products**: Cardamom (₹15), Coffee (₹12), Pepper (₹18), Turmeric (₹10), Cloves (₹20), Vegetables (₹8), Fruits (₹8), Other (₹10)
- **4 machines**: Dryer 1 (500 kg), Dryer 2 (500 kg), Dryer 3 (750 kg), Dryer 4 (1000 kg)
- **10 expense categories**: Electricity, Diesel, Machine Maintenance, Repair, Transport, Packing, Salary, Tea, Office Expense, Miscellaneous
- **Company info**: name "E3", tagline "Post Harvest Processing Unit"

Sequence counters and TTL indexes are also initialized. `user_sessions` has a TTL index that auto-purges expired Google sessions after 7 days.

---

## Testing

### Backend (pytest)
```bash
cd backend
python -m pytest tests -q
# Expected: 53 passed
```

Two test files:
- `tests/test_ethree_api.py` — 29 tests: auth, CRUD, batch lifecycle, dashboard shape
- `tests/test_ethree_iter2.py` — 24 tests: branch scoping, arrivals endpoint, delivery flow, users/branches admin, RBAC

### Manual QA
Postman collection (`e3-postman-collection.json`) auto-captures the auth token on login and reuses it for all authenticated routes.

---

## Deployment

### Emergent Preview
Push to `main` — preview auto-deploys at `https://<slug>.preview.emergentagent.com`. Both frontend (Metro) and backend (FastAPI) are served from that hostname; `/api/*` routes to backend automatically.

### Native builds
Click **Publish** in the Emergent dashboard to trigger iOS/Android builds. `app.json` is pre-configured:
- Bundle identifier `com.emergent.cardamombatchpro.h3n1hn`
- iOS `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription`
- Android permissions: `CAMERA`, `READ_EXTERNAL_STORAGE`

### Production checklist
- [ ] Rotate `JWT_SECRET` to a strong random value
- [ ] Point `MONGO_URL` at MongoDB Atlas (or self-hosted with auth + TLS)
- [ ] Migrate base64 photos → Cloudflare R2 / Cloudinary (URLs in DB)
- [ ] Enable HTTPS via nginx / Cloudflare
- [ ] Rate-limit `/auth/login` (5 attempts / 5 min)
- [ ] Turn on MongoDB backups (daily snapshot + PITR on Atlas)

---

## Key Features

- **Role-based access** (Admin, Manager, Store Incharge) with **branch scoping** on every list endpoint
- **Batch lifecycle** with QR: Received → Loaded → Drying → Completed → Delivered; machine assigned at Loaded step
- **Simplified Arrival** form: customer, product, weight, bags, rate (₹12 default), photos from **camera or gallery**, "Received From" auto-fills from customer name but stays editable
- **Delivery**: processed weight, live weight-loss %, inline payment, handed-over person + phone
- **Partial payments** supported (Cash / UPI / Bank / Credit); auto-recomputes batch balance
- **Expenses** with 10 seeded categories
- **Dashboard** with report-period selector (default: this month), Processing hero (IN/OUT today), branch-scoped metric grid
- **Processing Details** screen (3 tabs — Arrivals / Processing / Delivered) with branch name on every row
- **Global Search** across customers, batches, receipt numbers
- **Complete Audit Trail** (created_by / updated_by / timestamps everywhere; `audit_logs` collection)
- **Admin management**: Users (with role + branch), Branches (CRUD)
- **Google Sign-In** (Emergent-managed OAuth) alongside mobile + password JWT

---

## API Overview

Two artefacts:
- **`e3-openapi.json`** — full OpenAPI 3.0 spec (29 endpoints) importable into Swagger UI / Redoc / Insomnia
- **`e3-postman-collection.json`** — ready-to-run Postman v2.1 collection with example bodies and auto-token capture

FastAPI also serves live docs:
- Swagger UI: `${BACKEND_URL}/docs`
- ReDoc: `${BACKEND_URL}/redoc`
- OpenAPI JSON: `${BACKEND_URL}/openapi.json`

Base path: `/api`. All authenticated endpoints expect `Authorization: Bearer <token>`.

Route index:

**Auth** `/auth/login` `/auth/google` `/auth/logout` `/auth/me` `/auth/users` `/auth/users/{id}`
**Masters** `/branches` `/branches/{id}` `/products` `/machines` `/machines/{id}/status`
**Customers** `/customers` `/customers/{id}`
**Operations** `/arrivals` `/batches` `/batches/{id}` `/batches/{id}/status` `/batches/{id}/delivery`
**Money** `/payments` `/expenses` `/expense-categories`
**Maintenance** `/maintenance`
**Insight** `/dashboard` `/dashboard/arrivals` `/reports/summary` `/search` `/audit`
**Settings** `/settings/company`

---

## Frontend Routes

| Route | Purpose | Access |
|---|---|---|
| `/login` | Sign-in screen | Anon |
| `/(tabs)/dashboard` | Home | All |
| `/(tabs)/customers` | Customer directory | All |
| `/(tabs)/new-entry` | Quick Actions sheet | All |
| `/(tabs)/machines` | Machine grid | All |
| `/(tabs)/more` | Master menu | All |
| `/arrival-form` | New arrival | All |
| `/delivery-picker` `/delivery/[id]` | Delivery flow | All |
| `/expense-form` | New expense | All |
| `/payment-picker` `/payment/[id]` | Collect payment | All |
| `/batch/[id]` | Batch detail | All |
| `/batches` | All batches list | All |
| `/customer/[id]` `/customer-form` | Customer profile / new | All |
| `/machine/[id]` | Machine detail | All |
| `/payments` `/expenses` `/reports` `/search` `/audit` `/settings` | Section screens | Audit: Admin/Manager |
| `/maintenance` `/maintenance-form` | Maintenance log | All |
| `/users-admin` `/branches-admin` | Master data mgmt | **Admin only** |
| `/arrivals?start=&end=&tab=` | Processing details | Branch-scoped |

---

## Troubleshooting

**"Invalid token" after using Google Sign-In**
The Emergent session has a 7-day TTL. Sign in again. If it persists, delete the `user_sessions` document with that token.

**Backend can't start — bcrypt / passlib error**
Some passlib/bcrypt combos throw a benign `AttributeError: __about__` warning. It doesn't stop the app. To silence, pin `bcrypt==4.0.1` in requirements.txt.

**Frontend shows blank white screen**
The Metro bundler is still compiling. Wait 5-15 seconds after `yarn start`. Look for the "iOS Bundling complete" line.

**`Cannot resolve entry file`**
Someone modified `metro.config.js` or `package.json`'s `main` field. Revert them.

**Admin can't see new users' batches**
Users created via the admin screen without a `branch_id` will effectively be branchless (see everything). Assign them a branch in the edit sheet.

**MongoDB dropIndex error at startup**
Safe to ignore — the seed helper tries to drop an old unique-mobile index to allow Google-auth users (who have no mobile). It only warns if no such index exists.

---

## License

Proprietary — © 2026 E3. All rights reserved.

## Support

Issues, feature requests, or questions: open an issue on this repo or contact the maintainers.
