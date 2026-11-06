# Project: BonCore POS & Restaurant Management System

## Architecture
BonCore is a multi-tenant POS and Restaurant Management System composed of:
1. **Database Layer**: SQLite databases with multi-tenant isolation.
   - Master Database: `backend/data/master.db` (SaaS tenants, subscriptions, invoices, global admins).
   - Active Tenant Database: `backend/data/tenants/fatihciftligi.db` (8 areas, 141 tables, 262 products, categories, orders, payments, staff).
   - PRAGMA settings: WAL mode, foreign keys ON, synchronous NORMAL, busy_timeout 5000ms.
2. **Backend Layer**: High-performance Go Fiber server (`backend-go/cmd/server`) on port 8000.
   - REST endpoints (65+) across Auth, Tables, Orders, Payments, KDS, Reports, Settings, Inventory, Products, Users, Master Admin.
   - WebSockets for real-time order and table synchronization (`/ws/:channel`, `/ws/table/:table_id`).
   - Multi-tenant resolution via `X-Restaurant-Code` header, subdomain, or fallback tenant.
3. **Frontend Layer**: React 18 + TypeScript SPA (`frontend/`) on port 80.
   - Hash-based responsive routing (`#landing`, `#login`, `#tables`, `#pos`, `#kds`, `#cashier`, `#reports`, `#definitions`, `#master_admin`).
   - Dexie.js (IndexedDB) offline-first cache with auto-synchronization.
   - Role-based views: Waiter (Garson), Cashier (Kasiyer), Kitchen (Mutfak/KDS), Manager (Yönetici), Admin, SuperAdmin.
4. **Automated Testing & CLI Regression Suite**: Command-line repeatable test scripts validating end-to-end API workflows, role permissions, payment transactions, and table state transitions.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | SQLite Tenant DB Integrity | Clean up deleted product FK references, run PRAGMA foreign_key_check, WAL checkpoint | M1 | DB Survey |
| 2 | Staff Role PIN Seeding | Seed standard staff PINs (1111: Garson, 2222: Cashier, 3333: Şef, 9999: Manager) into fatihciftligi.db | M1 | DB Survey |
| 3 | Query Performance Indexes | Build 34 missing indexes on orders, order_items, tables, products, categories in tenant DB | M1 | DB Survey |
| 4 | Master DB Path Unification | Point Go Fiber backend master database path to `backend/data/master.db` | M1 / M2 | DB & Backend Survey |
| 5 | Default Tenant Code Alignment | Set default tenant fallback in Go Fiber server to `fatihciftligi` | M2 | DB & Backend Survey |
| 6 | Table Status Enum Normalization | Ensure table release and settlement set status to `"empty"` (not `"free"`) | M2 | Backend & Frontend Survey |
| 7 | Order Response JSON Key Alignment | Include `"order_id"` alongside `"id"` in order creation and ensure status is `"success"` | M2 | Backend & Frontend Survey |
| 8 | RBAC & Role Verification | Verify all 6 roles (Waiter, Cashier, Kitchen, Manager, Admin, SuperAdmin) on backend APIs | M2 | Backend Survey |
| 9 | Root Error Boundary | Implement global error boundary in `frontend/src/main.tsx` to prevent any white-screen crashes | M3 | Frontend Survey |
| 10 | Unsafe `.toFixed()` and Parsing Fixes | Guard numbers in `MenuIntegrationOperations.tsx` and `CashierManagement.tsx`, safe JSON parse in `AdisyoSettings.tsx` | M3 | Frontend Survey |
| 11 | API Error Interceptor & Promise Rejection Handling | Gracefully handle non-JSON 500/502/504 errors in `frontend/src/services/api.ts` | M3 | Frontend Survey |
| 12 | Role UI Workflow End-to-End Verification | Verify Waiter ordering, Cashier checkout/split, Kitchen KDS ticket lifecycle, Manager & Admin dashboards | M3 | Frontend Survey |
| 13 | Automated CLI Regression Test Suite | Implement standalone CLI test runner verifying all critical API journeys and role workflows | M4 | R3 Requirement |
| 14 | Stress Testing & Adversarial Hardening | Challenge concurrency, concurrent orders, partial payments, edge-case table transfers | M5 | R1 & R2 Acceptance |
| 15 | Forensic Integrity Audit & Final Verification | Binary veto verification of genuine implementations without facades or stubs | M5 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Database Layer Optimization & Integrity | Seed standard role PINs, fix FK violations, create 34 missing indexes, sync master DB path, checkpoint WAL | none | DONE |
| M2 | Backend Go Fiber API & Role Alignment | Default tenant fallback to fatihciftligi, master DB path fix, table status "empty" normalization, order_id JSON key compatibility | M1 | DONE |
| M3 | Frontend React/TS Error Handling & Role Workflows | Root error boundary, safe number/JSON parsing, API error handling, role journeys (Waiter, Cashier, Kitchen, Admin/Manager) | M2 | DONE |
| M4 | Automated CLI Regression Suite & E2E Testing | Executable CLI test scripts testing all role APIs, auth, orders, payments, KDS, and tables | M2, M3 | DONE |
| M5 | Final CEO End-to-End Verification & Forensic Audit | CEO / Tester comprehensive end-to-end audit, Challenger stress test, Forensic Auditor integrity verification | M4 | DONE |

## Interface Contracts
### Database ↔ Backend
- Master DB path: `backend/data/master.db` (SQLite)
- Tenant DB path pattern: `backend/data/tenants/<tenant_code>.db` (SQLite)
- Active default tenant: `fatihciftligi`
- SQLite PRAGMAs: `journal_mode=WAL; foreign_keys=ON; busy_timeout=5000; synchronous=NORMAL;`
- Staff PINs:
  - 1111: Role `garson` (Waiter)
  - 2222: Role `kasiyer` (Cashier)
  - 3333: Role `mutfak` (Kitchen)
  - 9999: Role `yonetici` (Manager)
  - 0000: Role `admin` (Tenant Admin)

### Backend ↔ Frontend
- Base URL: `http://localhost:8000/api` (or relative `/api` via proxy)
- Headers:
  - `X-Restaurant-Code`: `fatihciftligi` (fallback: `fatihciftligi`)
  - `Authorization`: `Bearer <token>` (if authenticated)
  - `X-User-Role`: `<role>`
- Table Status values: `"empty"`, `"occupied"`, `"bill_requested"`, `"reserved"`
- Order Creation Response:
  ```json
  {
    "status": "success",
    "id": 123,
    "order_id": 123,
    "order_number": 45,
    "table_id": 10,
    "total_amount": 350.00
  }
  ```
- Payment Settlement Response:
  ```json
  {
    "status": "success",
    "message": "Payment recorded successfully",
    "table_status": "empty"
  }
  ```

## Code Layout
- `backend-go/`: Go Fiber backend service
  - `cmd/server/main.go`: Server entrypoint
  - `internal/api/`: Handlers and routing
  - `internal/models/`: Domain structs and database models
  - `internal/repository/`: SQLite database access and multi-tenant manager
  - `internal/ws/`: WebSocket hub and client handlers
- `backend/data/`: SQLite databases
  - `master.db`: SaaS master database
  - `tenants/`: Tenant databases (`fatihciftligi.db`, etc.)
- `frontend/`: React + TypeScript frontend
  - `src/App.tsx`: Main routing and shell
  - `src/main.tsx`: App bootstrapping
  - `src/components/`: Role-specific views (`pos/`, `kds/`, `cashier/`, `reports/`, `settings/`, `master/`)
  - `src/services/api.ts`: API client and HTTP interceptors
- `tests/`: Automated test suites and regression scripts
