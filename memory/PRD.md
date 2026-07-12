# EThree Agro Solutions - Drying Plant Management (v1)

## Overview
Professional Expo mobile app + FastAPI/MongoDB backend for a spice/produce drying plant. Role-based operations (Admin/Manager/Store Incharge), batch lifecycle with QR, partial payments, expenses, reports, multi-branch ready, full audit trail.

## Tech Stack
- **Frontend:** Expo Router (React Native), react-native-qrcode-svg, react-native-svg, secure storage via `@/src/utils/storage`
- **Backend:** FastAPI + Motor (async MongoDB), JWT (30-day) + bcrypt
- **State:** Local Auth context, per-screen fetch via `useFocusEffect`

## Roles (seeded)
| Role           | Mobile     | Password    |
|----------------|------------|-------------|
| Admin          | 9999999999 | admin123    |
| Manager        | 8888888888 | manager123  |
| Store Incharge | 7777777777 | store123    |

## Key Screens (Bottom Nav)
1. **Dashboard** — Today's profit hero + 6 metric cards + machine snapshot + recent activity from audit log
2. **Customers** — list/search, add form, detail w/ stats & history
3. **New Entry** — 5-step batch wizard (Customer → Product → Weight → Machine → Charges) → auto-generated batch #, receipt #, QR
4. **Machines** — 2x2 grid of 4 seeded dryers with status pills + detail with status controls
5. **More** — Batches, Payments, Expenses, Reports, Maintenance, Global Search, Audit Trail, Settings, Logout

## Batch Lifecycle
`Received → Loaded → Drying → Completed → Delivered`
- Loading a batch auto-sets its machine to Running + current_batch_id
- Delivery captures actual dry weight → recomputes bill, sets weight_loss, frees machine

## Backend Endpoints (prefix `/api`)
Auth: `/auth/login`, `/auth/me`, `/auth/users` (Admin)
Data: `/customers`, `/products`, `/machines` (+ `/status`), `/batches` (+ `/status`, `/delivery`), `/payments`, `/expenses`, `/expense-categories`, `/maintenance`, `/branches`, `/settings/company`
Ops: `/dashboard`, `/reports/summary`, `/search`, `/audit` (Admin/Manager)

## Validations
- raw_weight > 0, no negative charges/discount/advance
- advance ≤ bill_amount
- Auth required for all endpoints except `/auth/login`

## Additional Features Built In
- Multi-branch schema (branches collection + default "Main Branch")
- Complete audit trail (created_by, updated_by, timestamps; `audit_logs` for actions)
- QR code embedded on every batch detail (offline-scannable ID)
- Recent activity feed derived from audit log

## Not in v1 (per user choice)
- Push notifications (skipped)
- QR scanning (generate only)
- Cloudinary uploads (base64 in-DB)
- Offline SQLite sync (online-only)

## How to Extend
- Add offline sync: introduce a queue in `@/src/utils/storage`, resend on connectivity
- Enable QR scan: install `expo-camera`, add scan screen that calls `GET /api/batches/{id}`
- Enable push: run Emergent push integration; backend event hooks already have audit records to fan out
