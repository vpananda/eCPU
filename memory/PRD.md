# E3 - Post Harvest Processing Unit

**Meaning:** Energy · Efficient · Environment

Expo (React Native) mobile app + FastAPI + MongoDB. Multi-branch, role-scoped drying/processing operations management.

## Roles
- **Admin** — full access; can create/edit/delete users and branches, and all business data
- **Manager** — scoped to assigned branch; can add customers, expenses, arrivals, deliveries, payments; read audit log
- **Store Incharge** — scoped to assigned branch; day-to-day operations only

Seeded users (all on "Main Branch"): Admin `9999999999/admin123`, Manager `8888888888/manager123`, Store Incharge `7777777777/store123`. Google Sign-In is also enabled — first-time Google users default to Store Incharge role.

## Home Screen (Dashboard)
- Date range pill (default: 1st of current month → today), with preset chips (Today, Last 7 days, This Month, Last 30 days) + custom
- **Processing hero card** (formerly "Today's Arrival of Spices"): IN weight/count · OUT weight/count. Tap opens Processing Details.
- 6 branch-scoped metric cards: Customers · Received · Deliveries · Collection · Expenses · Pending Dues
- Machine snapshot · Recent activity feed

## Processing Details Screen
Three tabs — Arrivals · Processing · Delivered — each row shows:
Customer name + code · Branch name · Product · Date · Phone · Batch # · Weight (raw/dried)

## Quick Actions (+ FAB)
Opens a bottom sheet with 4 tiles:
1. **Arrival** — simplified form: customer, product (type of spice), date (default today), weight, bags, bag weight, rate (default ₹12/kg), multiple photos, remarks
2. **Deliver** — customer/batch picker → delivery form with arrival summary + fields: processed weight, processed bags, rate (default 12), amount received (inline payment), payment mode, person receiving + phone, remarks. Live weight-loss %.
3. **Expense** — category chip picker (10 categories), amount, vendor, remarks
4. **Payment** — filtered picker showing only batches with balance > 0

## Batch Lifecycle
`Received → Loaded → Drying → Completed → Delivered`. Machine is assigned at the **Loaded** step (previously required at arrival).

## Admin-only screens
- **Users** (`/users-admin`): create/edit/delete users, assign role + branch, reset password
- **Branches** (`/branches-admin`): CRUD

## Branch Scoping (applied to all list endpoints)
- Admin — no scoping
- Manager / Store Incharge — sees `branch_id = user.branch_id` OR legacy records with `branch_id in (null, "")`

## Backend Endpoints (prefix `/api`)
Auth: `/auth/login`, `/auth/me`, `/auth/google`, `/auth/logout`, `/auth/users` (create/list/update/delete)
Masters: `/branches` (CRUD), `/products`, `/machines` (+ /status), `/customers` (CRUD)
Ops: `/arrivals` (new simplified), `/batches` (full form), `/batches/{id}/status` (machine_id required at Loaded), `/batches/{id}/delivery`, `/payments`, `/expenses`, `/expense-categories`, `/maintenance`
Reports: `/dashboard?start=&end=`, `/dashboard/arrivals?start=&end=`, `/reports/summary`, `/search?q=`, `/audit`

## Test suite
- 29 original tests (`tests/test_ethree_api.py`) — all green
- 24 new integration tests (`tests/test_ethree_iter2.py`) — all green
Total: **53/53 backend tests passing**

## Test Credentials
See `/app/memory/test_credentials.md`.
