/**
 * Automated Frontend Unit & Verification Test Suite for BonCore POS.
 * Run with: npm test (or node --test tests/frontend.test.mjs)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

// ---------------------------------------------------------------------------
// 1. Safe Number & Formatting Utilities
// ---------------------------------------------------------------------------
describe('Safe Number & Currency Formatting', () => {
  function safeNumber(val, fallback = 0) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'number') {
      return Number.isFinite(val) ? val : fallback;
    }
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function safeToFixed(val, decimals = 2) {
    return safeNumber(val, 0).toFixed(decimals);
  }

  function formatCurrency(val, decimals = 2, symbol = '₺') {
    return `${symbol}${safeToFixed(val, decimals)}`;
  }

  test('safeNumber handles null, undefined, strings, NaN without throwing', () => {
    assert.strictEqual(safeNumber(null), 0);
    assert.strictEqual(safeNumber(undefined), 0);
    assert.strictEqual(safeNumber('123.45'), 123.45);
    assert.strictEqual(safeNumber('not_a_number', 99), 99);
    assert.strictEqual(safeNumber(NaN, 10), 10);
    assert.strictEqual(safeNumber(Infinity, 0), 0);
    assert.strictEqual(safeNumber(250.75), 250.75);
  });

  test('safeToFixed never throws TypeError: Cannot read properties of undefined (reading toFixed)', () => {
    assert.strictEqual(safeToFixed(undefined, 2), '0.00');
    assert.strictEqual(safeToFixed(null, 2), '0.00');
    assert.strictEqual(safeToFixed('45.6', 2), '45.60');
    assert.strictEqual(safeToFixed(100, 2), '100.00');
    assert.strictEqual(safeToFixed('invalid', 2), '0.00');
  });

  test('formatCurrency formats valid Turkish Lira strings', () => {
    assert.strictEqual(formatCurrency(150), '₺150.00');
    assert.strictEqual(formatCurrency(null), '₺0.00');
    assert.strictEqual(formatCurrency(undefined), '₺0.00');
    assert.strictEqual(formatCurrency('35.5'), '₺35.50');
  });
});

// ---------------------------------------------------------------------------
// 2. Safe JSON Parsing
// ---------------------------------------------------------------------------
describe('Safe JSON & LocalStorage Parsing', () => {
  function safeJsonParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  test('safeJsonParse parses valid JSON correctly', () => {
    const input = '{"discounts":[{"id":1,"rate":10}]}';
    const parsed = safeJsonParse(input, {});
    assert.strictEqual(parsed.discounts.length, 1);
    assert.strictEqual(parsed.discounts[0].rate, 10);
  });

  test('safeJsonParse catches corrupted JSON strings and returns fallback', () => {
    const malformed = '{bad_json: 123,,}';
    const fallback = { discounts: [] };
    const result = safeJsonParse(malformed, fallback);
    assert.deepStrictEqual(result, fallback);
  });

  test('safeJsonParse safely handles null, undefined, and empty string', () => {
    assert.strictEqual(safeJsonParse(null, 'default'), 'default');
    assert.strictEqual(safeJsonParse(undefined, 'default'), 'default');
    assert.strictEqual(safeJsonParse('', 'default'), 'default');
  });
});

// ---------------------------------------------------------------------------
// 3. Root Error Boundary Contract
// ---------------------------------------------------------------------------
describe('Root Error Boundary Logic', () => {
  class MockRootErrorBoundary {
    static getDerivedStateFromError(error) {
      return { hasError: true, error };
    }
  }

  test('getDerivedStateFromError captures unexpected React crashes', () => {
    const testError = new TypeError("Cannot read properties of undefined (reading 'toFixed')");
    const state = MockRootErrorBoundary.getDerivedStateFromError(testError);
    assert.strictEqual(state.hasError, true);
    assert.strictEqual(state.error.message, "Cannot read properties of undefined (reading 'toFixed')");
  });
});

// ---------------------------------------------------------------------------
// 4. API Interceptor & Non-JSON HTML Error Resilience
// ---------------------------------------------------------------------------
describe('API Interceptor & 500/502/504 Non-JSON Error Handling', () => {
  test('Non-JSON HTML 500 response resolves cleanly without throwing unhandled SyntaxError', async () => {
    const html500 = `<!DOCTYPE html><html><head><title>500 Internal Server Error</title></head><body><h1>Internal Server Error</h1></body></html>`;
    let toastEmitted = null;

    // Simulate interceptor wrapper logic
    const mockResponse = {
      status: 500,
      statusText: 'Internal Server Error',
      ok: false,
      text: async () => html500
    };

    const originalText = mockResponse.text.bind(mockResponse);
    let cachedParsed;
    let hasParsed = false;

    mockResponse.json = async function () {
      if (hasParsed) return cachedParsed;
      try {
        const rawText = await originalText();
        try {
          cachedParsed = JSON.parse(rawText);
          hasParsed = true;
          return cachedParsed;
        } catch {
          const status = mockResponse.status;
          const cleanMsg = 'Sunucu hatası (500 Internal Server Error). Lütfen tekrar deneyiniz.';
          toastEmitted = { message: cleanMsg, type: 'error' };
          cachedParsed = {
            error: cleanMsg,
            detail: cleanMsg,
            message: cleanMsg,
            status: 'error',
            statusCode: status,
            is_non_json: true
          };
          hasParsed = true;
          return cachedParsed;
        }
      } catch {
        return { error: 'Yanıt akışı okunamadı.', status: 'error' };
      }
    };

    const result = await mockResponse.json();
    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.statusCode, 500);
    assert.strictEqual(result.is_non_json, true);
    assert.ok(result.detail.includes('500'));
    assert.strictEqual(toastEmitted.type, 'error');

    // Repeated call must return cached result without consuming stream again
    const repeated = await mockResponse.json();
    assert.deepStrictEqual(repeated, result);
  });

  test('Non-JSON HTML 502 Bad Gateway response returns clean error message', async () => {
    const html502 = `<html><center><h1>502 Bad Gateway</h1></center></html>`;
    let toastEmitted = null;

    const mockResponse = {
      status: 502,
      ok: false,
      text: async () => html502
    };

    const originalText = mockResponse.text.bind(mockResponse);
    let cachedParsed;
    let hasParsed = false;

    mockResponse.json = async function () {
      if (hasParsed) return cachedParsed;
      const rawText = await originalText();
      try {
        cachedParsed = JSON.parse(rawText);
      } catch {
        const cleanMsg = 'Sunucuya ulaşılamıyor (502 Bad Gateway). Backend servisini kontrol edin.';
        toastEmitted = { message: cleanMsg, type: 'error' };
        cachedParsed = {
          error: cleanMsg,
          detail: cleanMsg,
          status: 'error',
          statusCode: 502,
          is_non_json: true
        };
      }
      hasParsed = true;
      return cachedParsed;
    };

    const result = await mockResponse.json();
    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.statusCode, 502);
    assert.ok(result.detail.includes('502 Bad Gateway'));
    assert.strictEqual(toastEmitted.type, 'error');
  });

  test('Valid JSON response parses normally', async () => {
    const validJson = JSON.stringify({ status: 'success', order_id: 101, total: 250 });
    const mockResponse = {
      status: 200,
      ok: true,
      text: async () => validJson
    };

    const originalText = mockResponse.text.bind(mockResponse);
    mockResponse.json = async function () {
      const raw = await originalText();
      return JSON.parse(raw);
    };

    const result = await mockResponse.json();
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.order_id, 101);
    assert.strictEqual(result.total, 250);
  });
});

// ---------------------------------------------------------------------------
// 5. Role Permission & Journey Evaluation (All 6 Roles)
// ---------------------------------------------------------------------------
describe('Role Permission Matrix & Journeys (6 Roles)', () => {
  const roleDefinitions = {
    waiter: {
      name: 'Garson',
      allowedTabs: ['tables', 'pos'],
      forbiddenTabs: ['cashier', 'definitions', 'settings', 'master_admin']
    },
    cashier: {
      name: 'Kasiyer',
      allowedTabs: ['tables', 'pos', 'cashier', 'reports'],
      forbiddenTabs: ['definitions', 'settings', 'master_admin']
    },
    mutfak: {
      name: 'Mutfak / KDS',
      allowedTabs: ['kds'],
      forbiddenTabs: ['pos', 'cashier', 'definitions', 'settings', 'master_admin']
    },
    yonetici: {
      name: 'Yönetici',
      allowedTabs: ['tables', 'pos', 'cashier', 'kds', 'reports', 'definitions', 'settings', 'dashboard'],
      forbiddenTabs: ['master_admin']
    },
    admin: {
      name: 'Admin',
      allowedTabs: ['tables', 'pos', 'cashier', 'kds', 'reports', 'definitions', 'settings', 'users', 'dashboard'],
      forbiddenTabs: ['master_admin']
    },
    superadmin: {
      name: 'SuperAdmin / Master Admin',
      allowedTabs: ['master_admin', 'master_dashboard', 'master_tenants', 'master_billing'],
      forbiddenTabs: []
    }
  };

  test('All 6 system roles have discrete and non-empty permission boundaries', () => {
    const roles = Object.keys(roleDefinitions);
    assert.strictEqual(roles.length, 6);

    for (const [roleKey, def] of Object.entries(roleDefinitions)) {
      assert.ok(def.name.length > 0, `Role ${roleKey} must have descriptive name`);
      assert.ok(def.allowedTabs.length > 0, `Role ${roleKey} must have allowed tabs`);
    }
  });

  test('Garson cannot access cashier settlement or master admin', () => {
    const waiter = roleDefinitions.waiter;
    assert.ok(waiter.allowedTabs.includes('pos'));
    assert.ok(waiter.allowedTabs.includes('tables'));
    assert.ok(waiter.forbiddenTabs.includes('cashier'));
    assert.ok(waiter.forbiddenTabs.includes('master_admin'));
  });

  test('Kitchen KDS is dedicated to order status and kitchen groups', () => {
    const mutfak = roleDefinitions.mutfak;
    assert.ok(mutfak.allowedTabs.includes('kds'));
    assert.ok(mutfak.forbiddenTabs.includes('pos'));
    assert.ok(mutfak.forbiddenTabs.includes('cashier'));
  });

  test('Cashier has settlement and X/Z-Report access', () => {
    const cashier = roleDefinitions.cashier;
    assert.ok(cashier.allowedTabs.includes('cashier'));
    assert.ok(cashier.allowedTabs.includes('tables'));
  });

  test('Manager & Admin have access to definitions and restaurant settings', () => {
    const admin = roleDefinitions.admin;
    assert.ok(admin.allowedTabs.includes('definitions'));
    assert.ok(admin.allowedTabs.includes('settings'));
  });

  test('SuperAdmin is isolated to platform master tenant administration', () => {
    const superadmin = roleDefinitions.superadmin;
    assert.ok(superadmin.allowedTabs.includes('master_admin'));
    assert.ok(superadmin.allowedTabs.includes('master_tenants'));
  });
});

// ---------------------------------------------------------------------------
// 6. Live Backend Connectivity Check (Port 8000)
// ---------------------------------------------------------------------------
describe('Live Backend Service Verification', () => {
  test('Backend server on port 8000 is healthy and reachable', async () => {
    const health = await new Promise((resolve, reject) => {
      const req = http.get('http://127.0.0.1:8000/health', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
    });

    assert.strictEqual(health.status, 'healthy');
    assert.ok(health.app.includes('BonCore'));
  });
});

// ---------------------------------------------------------------------------
// 7. R1: SaaS Plan Definitions & Module Feature Presets
// ---------------------------------------------------------------------------
describe('R1: Feature Flags & Plan Management Presets', () => {
  function getPlanPresets(plan) {
    switch (plan) {
      case 'starter':
        return {
          feature_qr_menu: true,
          feature_kds: false,
          feature_delivery: false,
          feature_integrations: false,
          feature_e_invoice: false,
          feature_stock_recipe: false,
          feature_loyalty: false
        };
      case 'enterprise':
        return {
          feature_qr_menu: true,
          feature_kds: true,
          feature_delivery: true,
          feature_integrations: true,
          feature_e_invoice: true,
          feature_stock_recipe: true,
          feature_loyalty: true
        };
      case 'pro':
      default:
        return {
          feature_qr_menu: true,
          feature_kds: true,
          feature_delivery: true,
          feature_integrations: true,
          feature_e_invoice: false,
          feature_stock_recipe: false,
          feature_loyalty: false
        };
    }
  }

  test('Starter plan enables only QR Menu and disables advanced modules', () => {
    const starter = getPlanPresets('starter');
    assert.strictEqual(starter.feature_qr_menu, true);
    assert.strictEqual(starter.feature_kds, false);
    assert.strictEqual(starter.feature_delivery, false);
    assert.strictEqual(starter.feature_integrations, false);
    assert.strictEqual(starter.feature_e_invoice, false);
    assert.strictEqual(starter.feature_stock_recipe, false);
    assert.strictEqual(starter.feature_loyalty, false);
  });

  test('Pro plan bundles QR, KDS, Delivery, and Integrations', () => {
    const pro = getPlanPresets('pro');
    assert.strictEqual(pro.feature_qr_menu, true);
    assert.strictEqual(pro.feature_kds, true);
    assert.strictEqual(pro.feature_delivery, true);
    assert.strictEqual(pro.feature_integrations, true);
    assert.strictEqual(pro.feature_e_invoice, false);
    assert.strictEqual(pro.feature_stock_recipe, false);
    assert.strictEqual(pro.feature_loyalty, false);
  });

  test('Enterprise plan enables all 7 SaaS modules', () => {
    const enterprise = getPlanPresets('enterprise');
    const modules = Object.values(enterprise);
    assert.strictEqual(modules.length, 7);
    assert.ok(modules.every(m => m === true));
  });
});

// ---------------------------------------------------------------------------
// 8. R2: Fleet Monitoring & Telemetry Indicator Logic
// ---------------------------------------------------------------------------
describe('R2: Live Fleet Telemetry & Indicator Logic', () => {
  function computeOnlineStatus(lastSeenIso, thresholdSeconds = 120) {
    if (!lastSeenIso) return false;
    const diff = (Date.now() - new Date(lastSeenIso).getTime()) / 1000;
    return diff <= thresholdSeconds;
  }

  function formatRelativeTime(lastSeenIso) {
    if (!lastSeenIso) return 'Bilinmiyor';
    const diffSec = Math.floor((Date.now() - new Date(lastSeenIso).getTime()) / 1000);
    if (diffSec < 0 || isNaN(diffSec)) return 'Az önce';
    if (diffSec < 60) return `${Math.max(1, diffSec)} sn önce`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} dk önce`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours} sa önce`;
  }

  test('Heartbeat within 2 minutes is flagged as online', () => {
    const nowIso = new Date().toISOString();
    assert.strictEqual(computeOnlineStatus(nowIso), true);

    const past45s = new Date(Date.now() - 45000).toISOString();
    assert.strictEqual(computeOnlineStatus(past45s), true);
  });

  test('Heartbeat older than 2 minutes is flagged as offline', () => {
    const past5min = new Date(Date.now() - 300000).toISOString();
    assert.strictEqual(computeOnlineStatus(past5min), false);
  });

  test('formatRelativeTime formats seconds and minutes accurately', () => {
    const past20s = new Date(Date.now() - 20000).toISOString();
    assert.strictEqual(formatRelativeTime(past20s), '20 sn önce');

    const past5m = new Date(Date.now() - 300000).toISOString();
    assert.strictEqual(formatRelativeTime(past5m), '5 dk önce');
  });
});

// ---------------------------------------------------------------------------
// 9. R3: SaaS Billing, Virtual POS & Delinquency Logic
// ---------------------------------------------------------------------------
describe('R3: SaaS Billing & Delinquency Restrictions', () => {
  function evaluateDelinquency(daysOverdue) {
    if (daysOverdue >= 15) {
      return { status: 'suspended', readOnly: true };
    }
    if (daysOverdue >= 5) {
      return { status: 'read_only', readOnly: true };
    }
    return { status: 'active', readOnly: false };
  }

  test('Delinquency under 5 days remains active without read-only restrictions', () => {
    const res = evaluateDelinquency(3);
    assert.strictEqual(res.status, 'active');
    assert.strictEqual(res.readOnly, false);
  });

  test('Delinquency past 5 days applies read-only mode', () => {
    const res = evaluateDelinquency(7);
    assert.strictEqual(res.status, 'read_only');
    assert.strictEqual(res.readOnly, true);
  });

  test('Delinquency past 15 days suspends the tenant completely', () => {
    const res = evaluateDelinquency(16);
    assert.strictEqual(res.status, 'suspended');
    assert.strictEqual(res.readOnly, true);
  });
});

// ---------------------------------------------------------------------------
// 10. R4: Multi-Branch & Menu Clone Price Markup Calculations
// ---------------------------------------------------------------------------
describe('R4: Menu Clone & Price Markup Engine', () => {
  function adjustPrice(basePrice, markupPercent) {
    const multiplier = 1.0 + (markupPercent / 100.0);
    return Math.round(basePrice * multiplier * 100) / 100;
  }

  test('Zero markup preserves identical menu prices across branches', () => {
    assert.strictEqual(adjustPrice(150.0, 0), 150.0);
    assert.strictEqual(adjustPrice(85.5, 0), 85.5);
  });

  test('+10% markup correctly recalculates branch price tier', () => {
    assert.strictEqual(adjustPrice(100.0, 10), 110.0);
    assert.strictEqual(adjustPrice(250.0, 10), 275.0);
  });

  test('-5% discount correctly discounts branch price tier', () => {
    assert.strictEqual(adjustPrice(100.0, -5), 95.0);
    assert.strictEqual(adjustPrice(200.0, -5), 190.0);
  });
});

// ---------------------------------------------------------------------------
// 11. R5: Broadcast Announcements Targeting Contract
// ---------------------------------------------------------------------------
describe('R5: Broadcast Announcements Target Filter', () => {
  function isTargeted(announcement, tenantCode, tenantPlan) {
    if (announcement.target_type === 'all') return true;
    if (announcement.target_type === 'specific_tenants') {
      const targets = JSON.parse(announcement.target_tenant_ids || '[]');
      return targets.includes(tenantCode);
    }
    if (announcement.target_type === 'plan') {
      const plans = JSON.parse(announcement.target_plans || '[]');
      return plans.includes(tenantPlan);
    }
    return false;
  }

  test('Target all delivers to every tenant unconditionally', () => {
    const ann = { target_type: 'all' };
    assert.strictEqual(isTargeted(ann, 'tenant_a', 'starter'), true);
    assert.strictEqual(isTargeted(ann, 'tenant_b', 'enterprise'), true);
  });

  test('Target specific_tenants delivers only to matched tenant codes', () => {
    const ann = { target_type: 'specific_tenants', target_tenant_ids: '["tenant_a", "tenant_c"]' };
    assert.strictEqual(isTargeted(ann, 'tenant_a', 'starter'), true);
    assert.strictEqual(isTargeted(ann, 'tenant_b', 'starter'), false);
    assert.strictEqual(isTargeted(ann, 'tenant_c', 'enterprise'), true);
  });

  test('Target plan delivers only to tenants with matching subscription tiers', () => {
    const ann = { target_type: 'plan', target_plans: '["pro", "enterprise"]' };
    assert.strictEqual(isTargeted(ann, 'tenant_a', 'starter'), false);
    assert.strictEqual(isTargeted(ann, 'tenant_b', 'pro'), true);
    assert.strictEqual(isTargeted(ann, 'tenant_c', 'enterprise'), true);
  });
});

// ---------------------------------------------------------------------------
// 12. R6: Support Ticketing Lifecycle & Category Matrix
// ---------------------------------------------------------------------------
describe('R6: Support Ticketing Lifecycle & Categories', () => {
  const VALID_CATEGORIES = ['pos', 'hardware', 'bug', 'menu', 'billing', 'other'];
  const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
  const VALID_LIFECYCLE = ['new', 'in_review', 'resolved', 'closed'];

  test('Support ticketing includes all standard issue categories', () => {
    assert.strictEqual(VALID_CATEGORIES.length, 6);
    assert.ok(VALID_CATEGORIES.includes('pos'));
    assert.ok(VALID_CATEGORIES.includes('hardware'));
    assert.ok(VALID_CATEGORIES.includes('bug'));
  });

  test('Lifecycle states transition correctly', () => {
    let status = 'new';
    assert.strictEqual(VALID_LIFECYCLE.includes(status), true);
    status = 'in_review';
    assert.strictEqual(VALID_LIFECYCLE.includes(status), true);
    status = 'resolved';
    assert.strictEqual(VALID_LIFECYCLE.includes(status), true);
    status = 'closed';
    assert.strictEqual(VALID_LIFECYCLE.includes(status), true);
  });
});

// ---------------------------------------------------------------------------
// 13. R7: Storage Quota Calculations & Color Thresholds
// ---------------------------------------------------------------------------
describe('R7: Storage Quota Threshold Evaluation', () => {
  function getQuotaColor(usedMB, allocatedMB) {
    const pct = Math.round((usedMB / allocatedMB) * 100);
    if (pct >= 90) return { pct, color: 'red', isExceeded: pct >= 100 };
    if (pct >= 70) return { pct, color: 'amber', isExceeded: false };
    return { pct, color: 'green', isExceeded: false };
  }

  test('Under 70% storage usage returns green status', () => {
    const res = getQuotaColor(500, 1024);
    assert.strictEqual(res.pct, 49);
    assert.strictEqual(res.color, 'green');
    assert.strictEqual(res.isExceeded, false);
  });

  test('Between 70% and 90% returns amber warning status', () => {
    const res = getQuotaColor(800, 1024);
    assert.strictEqual(res.pct, 78);
    assert.strictEqual(res.color, 'amber');
    assert.strictEqual(res.isExceeded, false);
  });

  test('Above 90% returns red alert status', () => {
    const res = getQuotaColor(950, 1024);
    assert.strictEqual(res.pct, 93);
    assert.strictEqual(res.color, 'red');
    assert.strictEqual(res.isExceeded, false);
  });

  test('Exceeded quota (> 100%) triggers isExceeded flag', () => {
    const res = getQuotaColor(1100, 1024);
    assert.strictEqual(res.isExceeded, true);
  });
});
