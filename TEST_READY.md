# BonCore SaaS Master Admin Expansion - Automated Test Suite Documentation (`TEST_READY.md`)

**Date**: 2026-11-04  
**Author**: E2E Test Writer Worker (`worker_m4_test_writer_saas`)  
**Status**: `TEST_READY` (100% Green across all 4 Tiers, Zero Regressions)  
**Target Environment**: Windows 11 / Go Fiber (Port 8000) / React 19 + TypeScript / SQLite WAL Mode  

---

## 1. Executive Summary

Milestone 4 delivers a fully automated, completely non-interactive CLI regression and End-to-End (E2E) verification runner for all 7 SaaS Master Admin expansion modules:
- **R1: Feature Flags & Plan Management** (Starter, Pro, Enterprise tiers, 7 module toggles, `RequireFeature` middleware)
- **R2: Live Fleet Monitoring & Radar** (Device telemetry ingestion, online/offline status, device counts, live pulse turnover)
- **R3: Billing, Invoicing & VPOS** (PayTR & iyzico configurations, masked secrets, invoices, tax calculations, delinquency enforcement)
- **R4: Multi-Branch & Franchise Management** (Corporate brand grouping, consolidated chain analytics, menu template cloning with markup)
- **R5: Broadcast Announcements** (Master Admin broadcast dispatcher, WebSocket fan-out, POS active query & dismissal receipts)
- **R6: Support Ticketing** (POS ticket submission with screenshot uploads, static file serving, lifecycle transitions, immutable audit logs)
- **R7: Database Backup & Storage Quota** (Atomic WAL-checkpointed snapshots, SHA256 checksums, downloads, live safe restores, quota bars)

The test suite runs with **zero mocks**, operates directly against the live Go Fiber backend (`boncore-pos-server.exe`) on port 8000, and verifies physical SQLite tables across both Master DB (`backend/data/master.db`) and tenant databases (`backend/data/tenants/*.db`).

---

## 2. Test Runner Invocation

The test suite is completely automated and executable with a single command from the project root:

```powershell
python tests/run_saas_expansion_suite.py
```

### Server Auto-Detection & Self-Healing
If the Go backend server is not active on port 8000, `run_saas_expansion_suite.py` automatically launches `backend-go/boncore-pos-server.exe`, polls `/health` with timeout until healthy, executes all tests, and cleanly cleans up any temporary test artifacts.

---

## 3. Four-Tier Coverage Architecture

| Tier | Name | Target Scope | Assertions | Status |
|:---:|:---|:---|:---:|:---:|
| **Tier 1** | **Feature Coverage** | R1–R7 Happy paths: plans, toggles, heartbeats, billing/invoices, brands, broadcast, tickets, backups, quotas | 78 / 78 | **PASS** |
| **Tier 2** | **Boundary & Corner Cases** | Invalid VPOS provider, 404 nonexistent tenants/brands/tickets/backups, 403 unauthorized features, read-only GET vs POST/PUT enforcement, malformed inputs, empty status transitions | 40 / 40 | **PASS** |
| **Tier 3** | **Cross-Feature Interactions** | Delinquency suspension cascading across modules, menu cloning between branches with +20% price markup, ticket submission with image upload & audit logs, announcement dismissal & receipt tracking | 37 / 37 | **PASS** |
| **Tier 4** | **Real-world E2E Operational Lifecycle** | 1. Franchise Onboarding (brand + 2 child branches + menu cloning + analytics)<br>2. Multi-Device Fleet Pulse (POS, Tablet, Handheld, KDS)<br>3. Billing Invoice Due Cycle (future invoice -> overdue -> suspension -> payment -> restoration)<br>4. Disaster Recovery (WAL backup -> mutation -> safe restore -> integrity check) | 45 / 45 | **PASS** |
| **TOTAL** | **Comprehensive Suite** | **All 4 Tiers Combined (Zero-Mock E2E)** | **200 / 200** | **100% PASS** |

---

## 4. Test Matrix by Module

### R1. Feature Flags & Plan Management
- `GET /api/master/plans`: Asserts >= 3 subscription tiers (`starter`, `pro`, `enterprise`) with pricing and storage quota.
- `GET /api/master/tenants/:id/features`: Validates all 7 module boolean flags (`feature_qr_menu`, `feature_kds`, `feature_delivery`, `feature_integrations`, `feature_e_invoice`, `feature_stock_recipe`, `feature_loyalty`).
- `PUT /api/master/tenants/:id/features`: Dynamically updates module toggles and persists to Master DB.
- `GET /api/modules/status`: Validates caller tenant active module status payload.
- `RequireFeature` Guard: Accessing `/api/qr/*` or `/api/kds/*` with disabled flag returns HTTP 403 Forbidden with `code: "FEATURE_DISABLED"`.

### R2. Live Fleet Monitoring & Radar
- `POST /api/heartbeat`: Ingests device telemetry (`pos`, `tablet`, `handheld`, `kds`), updates `fleet_heartbeats` and `tenant_live_metrics`.
- `GET /api/master/fleet`: Returns online status (`is_online: true`), relative timestamps, device breakdown counters (`pos`, `tablets`, `handhelds`, `kds`, `total`), and live financial turnover metrics.

### R3. Billing, Invoicing & Delinquency
- `GET /api/master/billing/gateway-settings`: Retrieves PayTR and iyzico configurations with masked secrets (`***`).
- `PUT /api/master/billing/gateway-settings`: Updates sandbox/production credentials, rejects unsupported providers with HTTP 400.
- `POST /api/master/billing/test-connection`: Simulates live gateway latency ping.
- `POST /api/master/invoices`: Generates subscription invoices with automatic tax and subtotal computation.
- `PUT /api/master/invoices/:id/pay`: Marks invoice paid and restores delinquent tenant to active status.
- `POST /api/master/invoices/run-due-check`: Scans overdue invoices, marks `is_overdue = true`, applies read-only mode (>5 days) and account suspension (>15 days).
- Delinquency Middleware: Suspended tenants receive HTTP 403 (`ACCOUNT_SUSPENDED`); read-only tenants receive HTTP 403 (`READ_ONLY_MODE`) on POST/PUT while GET is permitted.

### R4. Multi-Branch & Franchise Management
- `POST /api/master/brands`: Creates corporate franchise holding brand, binds master tenant.
- `GET /api/master/brands`: Lists brands with branch counts.
- `GET /api/master/brands/:id/analytics`: Consolidates multi-branch turnover, today orders, and branch comparisons.
- `POST /api/master/menu/clone`: Clones categories, products, variants, and modifiers to target branches, recalculating product `base_price` with custom percentage markup/discount (-50% to +100%) inside isolated transactions.

### R5. Broadcast Announcements
- `POST /api/master/broadcast`: Dispatches global or targeted announcements to POS terminals.
- `GET /api/announcements/active`: POS terminal retrieves active unexpired announcements.
- `POST /api/announcements/:id/dismiss`: POS dismisses announcement, persisting receipt in `announcement_receipts`.

### R6. Support Ticketing Management
- `POST /api/support/tickets`: Accepts multipart form-data and screenshot images, saves to disk under `/static/uploads/tickets/`, generates tracking code (`TCK-2026-XXXX`).
- `GET /static/uploads/tickets/*`: Fiber static router serves uploaded screenshots.
- `GET /api/support/tickets`: Returns tenant's submitted support requests.
- `GET /api/master/tickets`: Master Admin ticket queue with category, priority, status filters.
- `GET /api/master/tickets/:id`: Retrieves ticket, replies, and audit trail logs.
- `PUT /api/master/tickets/:id/status`: Transitions lifecycle (`new` -> `in_review` -> `resolved` -> `closed`), sets `resolved_at`, and logs immutable audit records.
- `POST /api/master/tickets/:id/messages`: Appends admin replies.

### R7. Database Backup & Storage Quota
- `POST /api/master/tenants/:id/backup`: Flushes WAL journal via `PRAGMA wal_checkpoint(TRUNCATE)`, executes atomic backup, computes SHA256 checksum and file size.
- `GET /api/master/tenants/:id/backups`: Lists historical tenant backups.
- `GET /api/master/backups/:id/download`: Downloads binary archive, matching recorded SHA256 checksum 100%.
- `POST /api/master/backups/:id/restore`: Takes pre-restore safety snapshot, safely closes connection pool, overwrites database file, cleans WAL/SHM artifacts, re-opens connection, and executes `PRAGMA integrity_check`.
- `GET /api/master/tenants/:id/quota`: Computes SQLite database and media disk usage against plan quota (Starter 500 MB, Pro 2048 MB, Enterprise 10240 MB).
- `GET /api/master/storage/summary`: Aggregates platform-wide storage footprint and backup counts.

---

## 5. Verification Command Logs & Regression Proof

### 5.1 SaaS Expansion CLI Test Runner
```text
Command: python tests/run_saas_expansion_suite.py
Result:
  Total Duration   : 5.05 seconds
  Total Requests   : 91
  Total Assertions : 200
  Passed           : 200 (100%)
  Failed           : 0
  Exit Code        : 0
```

### 5.2 Go Backend Unit & Integration Tests
```text
Command: cd backend-go; go test ./...
Result:
  ok  github.com/boncore/pos-backend/internal/api         29.136s
  ok  github.com/boncore/pos-backend/internal/repository  3.463s
  ok  github.com/boncore/pos-backend/internal/ws          (cached)
  Exit Code: 0 (0 failures)
```

### 5.3 Frontend Unit Test Suite
```text
Command: cd frontend; npm test
Result:
  # tests 38
  # suites 13
  # pass 38
  # fail 0
  Exit Code: 0 (100% pass)
```

### 5.4 Frontend Production Build
```text
Command: cd frontend; npm run build
Result:
  ✓ 1669 modules transformed.
  dist/index.html                     1.98 kB
  dist/assets/index-4ug7dPq-.css    129.05 kB
  dist/assets/index-BrQPUr8T.js   1,617.67 kB
  ✓ built in 54.32s
  Exit Code: 0 (0 TypeScript errors, 0 Vite errors)
```

---

## 6. Conclusion
The BonCore SaaS Master Admin expansion is fully verified and regression-free across all tiers, ready for verification gate and forensic audit in Milestone 5.
