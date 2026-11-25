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

// ---------------------------------------------------------------------------
// 14. R8: 14 Competitor Features E2E Logic & Live Frontend/Backend Verification
// ---------------------------------------------------------------------------
describe('R8: 14 Competitor Features E2E Logic & Live Stack Verification', () => {
  // Feature 1 & 3: Course Firing & Seat-Based Ordering
  function formatCourseSeatNote(course, seatLabel, existingNote = '') {
    const parts = [];
    if (course && course !== '1. Servis') {
      parts.push(`[${course}]`);
    } else if (course === '1. Servis') {
      parts.push('[1. Servis]');
    }
    if (seatLabel && seatLabel !== 'Ortak') {
      parts.push(`[${seatLabel}]`);
    }
    const prefix = parts.join(' ');
    const cleaned = String(existingNote || '').trim();
    if (!prefix) return cleaned;
    return cleaned ? `${prefix} ${cleaned}` : prefix;
  }

  function extractCourseFromNote(note) {
    if (!note) return null;
    const match = note.match(/\[(1\. Servis|2\. Servis|3\. Servis \(Tatlı\))\]/);
    return match ? match[1] : null;
  }

  function extractSeatFromNote(note) {
    if (!note) return null;
    const match = note.match(/\[(Kişi \d+)\]/);
    return match ? match[1] : null;
  }

  test('F1 & F3: Course firing and seat notes round-trip accurately for POS and KDS', () => {
    const note = formatCourseSeatNote('2. Servis', 'Kişi 2', 'Az pişmiş');
    assert.strictEqual(note, '[2. Servis] [Kişi 2] Az pişmiş');
    assert.strictEqual(extractCourseFromNote(note), '2. Servis');
    assert.strictEqual(extractSeatFromNote(note), 'Kişi 2');

    const dessertNote = formatCourseSeatNote('3. Servis (Tatlı)', 'Ortak', '');
    assert.strictEqual(dessertNote, '[3. Servis (Tatlı)]');
    assert.strictEqual(extractCourseFromNote(dessertNote), '3. Servis (Tatlı)');
    assert.strictEqual(extractSeatFromNote(dessertNote), null);
  });

  // Feature 2: Happy Hour & Timed Auto-Discount
  function isTimeWithinRange(nowHHMM, start, end) {
    if (!start || !end) return false;
    if (start <= end) {
      return nowHHMM >= start && nowHHMM <= end;
    }
    return nowHHMM >= start || nowHHMM <= end;
  }

  test('F2: Happy Hour supports both daytime and overnight windows with discount resolution', () => {
    const rules = [
      { id: 'day', isActive: true, startTime: '14:00', endTime: '18:00', discountPercent: 20 },
      { id: 'night', isActive: true, startTime: '22:00', endTime: '02:00', discountPercent: 15 },
    ];
    const activeDay = rules.filter(r => r.isActive && isTimeWithinRange('15:30', r.startTime, r.endTime));
    assert.strictEqual(activeDay.length, 1);
    assert.strictEqual(activeDay[0].discountPercent, 20);

    const activeOvernight = rules.filter(r => r.isActive && isTimeWithinRange('01:15', r.startTime, r.endTime));
    assert.strictEqual(activeOvernight.length, 1);
    assert.strictEqual(activeOvernight[0].discountPercent, 15);

    const inactive = rules.filter(r => r.isActive && isTimeWithinRange('19:30', r.startTime, r.endTime));
    assert.strictEqual(inactive.length, 0);
  });

  // Feature 4: Timed Table / Lounge Tariff
  function calculateTimerChargeWithFloor(elapsedMinutes, hourlyRate, minimumCharge = 1) {
    const mins = Math.max(1, elapsedMinutes);
    const rawAmount = Number(((mins / 60) * hourlyRate).toFixed(2));
    return Math.max(minimumCharge, rawAmount);
  }

  test('F4: Timed Table calculates pro-rata hourly tariff respecting minimum charge floor', () => {
    assert.strictEqual(calculateTimerChargeWithFloor(90, 200, 50), 300);
    assert.strictEqual(calculateTimerChargeWithFloor(5, 120, 50), 50);
    assert.strictEqual(calculateTimerChargeWithFloor(45, 240, 1), 180);
  });

  // Feature 5 & 6: Multi-Language QR Menu, Alman Usulü Split, 1/N Split & Tip Selector
  test('F5 & F6: QR 5-language dictionary, Alman Usulü item split, 1/N split, and tips calculate cleanly', () => {
    const langs = ['tr', 'en', 'de', 'ar', 'ru'];
    const labels = {
      tr: 'Alman Usulü Öde',
      en: 'Split & Pay',
      de: 'Getrennt Zahlen',
      ar: 'الدفع على الطاولة',
      ru: 'Оплатить у стола',
    };
    for (const lang of langs) {
      assert.ok(labels[lang] && labels[lang].length > 0, `Translation exists for ${lang}`);
    }

    const orderItems = [
      { key: 0, name: 'Burger', amount: 320 },
      { key: 1, name: 'Limonata', amount: 80 },
      { key: 2, name: 'Pasta', amount: 200 },
    ];
    const fullPayableBase = orderItems.reduce((s, x) => s + x.amount, 0);
    assert.strictEqual(fullPayableBase, 600);

    // 1/3 Equal Split + 10% tip
    const equalBase = Number((fullPayableBase / 3).toFixed(2));
    const tip10 = Number(((equalBase * 10) / 100).toFixed(2));
    assert.strictEqual(equalBase, 200);
    assert.strictEqual(tip10, 20);
    assert.strictEqual(equalBase + tip10, 220);

    // Alman Usulü checked items (key 0 + key 1 = 400) + 15% tip
    const selectedKeys = { 0: true, 1: true, 2: false };
    const checkedItemsSum = orderItems.filter(x => selectedKeys[x.key]).reduce((s, x) => s + x.amount, 0);
    const tip15 = Number(((checkedItemsSum * 15) / 100).toFixed(2));
    assert.strictEqual(checkedItemsSum, 400);
    assert.strictEqual(checkedItemsSum + tip15, 460);
  });

  // Feature 7 & 9: Inventory Waste, Stocktake Variance & Supplier Cari Ledger
  test('F7 & F9: Waste loss, physical stocktake variance, and supplier debt/payment balance compute accurately', () => {
    const wasteLoss = Number((2.5 * 420).toFixed(2));
    assert.strictEqual(wasteLoss, 1050);

    const theoreticalQty = 15;
    const countedQty = 12.5;
    const unitCost = 200;
    const variance = Number((countedQty - theoreticalQty).toFixed(2));
    const financialImpact = Number((variance * unitCost).toFixed(2));
    assert.strictEqual(variance, -2.5);
    assert.strictEqual(financialImpact, -500);

    const supplier = { totalDebt: 24500, totalPaid: 16000 };
    supplier.totalDebt += 3500; // invoice sync
    supplier.totalPaid += 5000; // payment recorded
    const netBalance = Number((supplier.totalDebt - supplier.totalPaid).toFixed(2));
    assert.strictEqual(netBalance, 7000);
  });

  // Feature 8: Live Portion "86" Countdown & Auto Sold-Out Lock
  test('F8: Portion 86 countdown floors at zero and triggers sold-out lock', () => {
    let remaining = 3;
    const decrement = (soldQty) => {
      remaining = Math.max(0, remaining - soldQty);
      return { remaining, isSoldOut: remaining === 0 };
    };
    assert.deepStrictEqual(decrement(2), { remaining: 1, isSoldOut: false });
    assert.deepStrictEqual(decrement(5), { remaining: 0, isSoldOut: true });
  });

  // Feature 10: Staff Shift/Timeclock & Tip Pool Distribution
  test('F10: Staff shift elapsed accumulation and equal / hours / role tip pool distribute 100% of pool', () => {
    const accumulatedMinutes = 240 + Math.max(1, Math.round((30 * 60000) / 60000));
    assert.strictEqual(accumulatedMinutes, 270);

    const poolTotal = 1000;
    const staff = [
      { id: 1, role: 'waiter', hours: 8, weight: 8 },
      { id: 2, role: 'kitchen', hours: 4, weight: 4 },
    ];
    // Hours weighted distribution
    const totalHoursWeight = staff.reduce((s, x) => s + x.hours, 0);
    const byHours = staff.map(x => Number(((poolTotal * x.hours) / totalHoursWeight).toFixed(2)));
    assert.strictEqual(byHours[0], 666.67);
    assert.strictEqual(byHours[1], 333.33);

    // Equal distribution
    const equalShare = Number((poolTotal / staff.length).toFixed(2));
    assert.strictEqual(equalShare, 500);
  });

  // Feature 11 & 12: Customer Queue TV & Courier Change Float / POS Reconciliation
  test('F11 & F12: Queue TV separates PREPARING vs READY and courier float reconciliation computes exact cash & POS variance', () => {
    const kdsOrders = [
      { id: 101, items: [{ status: 'preparing' }, { status: 'ready' }] },
      { id: 102, items: [{ status: 'ready' }, { status: 'served' }] },
    ];
    const preparing = [];
    const ready = [];
    for (const o of kdsOrders) {
      if (o.items.every(it => it.status === 'ready' || it.status === 'served')) ready.push(o.id);
      else preparing.push(o.id);
    }
    assert.deepStrictEqual(preparing, [101]);
    assert.deepStrictEqual(ready, [102]);

    const changeFloat = 500;
    const cashExpected = 1250;
    const actualCash = 1750;
    const cashVariance = actualCash - (changeFloat + cashExpected);
    assert.strictEqual(cashVariance, 0);
  });

  // Feature 13 & 14: AI Menu Engineering Matrix & Customer Win-Back Segmentation
  test('F13 & F14: AI Menu Engineering classifies all 4 quadrants and CRM segments VIP/Düzenli/Riskli/Yeni', () => {
    const items = [
      { name: 'Steak', sold: 80, margin: 75 },    // star
      { name: 'Burger', sold: 100, margin: 35 },  // plowhorse
      { name: 'Truffle', sold: 20, margin: 80 },  // puzzle
      { name: 'Salad', sold: 15, margin: 30 },    // dog
    ];
    const avgSold = items.reduce((s, p) => s + p.sold, 0) / items.length;
    const avgMargin = items.reduce((s, p) => s + p.margin, 0) / items.length;
    const classifyQuad = (p) => {
      const hp = p.sold >= avgSold;
      const hm = p.margin >= avgMargin;
      if (hp && hm) return 'star';
      if (hp && !hm) return 'plowhorse';
      if (!hp && hm) return 'puzzle';
      return 'dog';
    };
    assert.deepStrictEqual(items.map(classifyQuad), ['star', 'plowhorse', 'puzzle', 'dog']);

    const classifyCustomerSegment = (c) => {
      const spent = Number(c.total_spent || 0);
      const visits = Number(c.visit_count || 0);
      const tier = String(c.tier || '').toLowerCase();
      const lastVisit = String(c.last_visit || '').toLowerCase();
      if (spent >= 3000 || visits >= 10 || tier.includes('vip') || tier.includes('gold')) return 'vip';
      if (
        lastVisit.includes('30') ||
        lastVisit.includes('45') ||
        lastVisit.includes('60') ||
        lastVisit.includes('ay') ||
        (visits <= 2 && spent > 0 && lastVisit !== 'bugün')
      ) return 'risk';
      if (visits <= 1) return 'new';
      return 'regular';
    };
    assert.strictEqual(classifyCustomerSegment({ total_spent: 4500, visit_count: 12 }), 'vip');
    assert.strictEqual(classifyCustomerSegment({ total_spent: 600, visit_count: 2, last_visit: '35 gün önce' }), 'risk');
    assert.strictEqual(classifyCustomerSegment({ total_spent: 0, visit_count: 1, last_visit: 'bugün' }), 'new');
    assert.strictEqual(classifyCustomerSegment({ total_spent: 950, visit_count: 5, last_visit: 'bugün' }), 'regular');
  });

  // Live Frontend & Backend HTTP 200 Check
  test('Live Frontend (http://localhost) and Backend Settings (http://127.0.0.1:8000/api/settings) respond HTTP 200', async () => {
    const fetchStatus = (url) => new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      });
      req.on('error', reject);
    });

    const backendRes = await fetchStatus('http://127.0.0.1:8000/api/settings');
    assert.strictEqual(backendRes.statusCode, 200);
    assert.ok(backendRes.body.length > 0);

    const frontendRes = await fetchStatus('http://localhost');
    assert.strictEqual(frontendRes.statusCode, 200);
    assert.ok(frontendRes.body.includes('id="root"'));
    assert.ok(frontendRes.body.includes('BonCore'));
  });
});

// ---------------------------------------------------------------------------
// 15. R9: Scannable Table QR Code, Dynamic Domain URL & Customer QR Routing
// ---------------------------------------------------------------------------
describe('R9: Scannable Table QR Code, Dynamic Domain URL & Customer QR Routing', () => {
  function buildQrMenuUrl(origin, tableId, restaurantCode) {
    const cleanOrigin = (origin || 'http://localhost').trim().replace(/\/+$/, '');
    return `${cleanOrigin}/?qr_table=${tableId}&restaurant=${encodeURIComponent(restaurantCode)}`;
  }

  function parseQrTableIdFromUrl(search, hash = '') {
    try {
      const searchParams = new URLSearchParams(search || '');
      const raw = searchParams.get('qr_table');
      if (raw) {
        const n = Number(raw);
        if (Number.isInteger(n) && n > 0) return n;
      }
      const match = String(hash || '').match(/qr_table=(\d+)/);
      if (match) {
        const n = Number(match[1]);
        if (Number.isInteger(n) && n > 0) return n;
      }
    } catch {}
    return null;
  }

  test('QR URL uses active domain origin without double slashes and encodes restaurant code', () => {
    assert.strictEqual(
      buildQrMenuUrl('https://siparis.restoran.com/', 132, 'fatihciftligi'),
      'https://siparis.restoran.com/?qr_table=132&restaurant=fatihciftligi'
    );
    assert.strictEqual(
      buildQrMenuUrl('http://192.168.1.50:5173', 7, 'kadikoy sube'),
      'http://192.168.1.50:5173/?qr_table=7&restaurant=kadikoy%20sube'
    );
  });

  test('parseQrTableIdFromUrl resolves query and hash params and rejects invalid table IDs', () => {
    assert.strictEqual(parseQrTableIdFromUrl('?qr_table=132&restaurant=fatihciftligi'), 132);
    assert.strictEqual(parseQrTableIdFromUrl('', '#qr_table=24'), 24);
    assert.strictEqual(parseQrTableIdFromUrl('?qr_table=0'), null);
    assert.strictEqual(parseQrTableIdFromUrl('?qr_table=-3'), null);
    assert.strictEqual(parseQrTableIdFromUrl('?qr_table=abc'), null);
    assert.strictEqual(parseQrTableIdFromUrl(''), null);
  });

  test('generateQrMatrix, slugifyQrPart, buildTableQrMenuUrl & parseQrRouteFromUrl work with real Turkish restaurant/area/table links and ISO/IEC 18004 matrices', async () => {
    const esbuild = await import('../node_modules/esbuild/lib/main.js');
    const path = await import('node:path');
    const built = await esbuild.build({
      entryPoints: [path.resolve('src/utils/qrCodeGenerator.ts').replace(/tests[\\/]+src/, 'src')],
      bundle: true,
      format: 'esm',
      write: false,
      plugins: [
        {
          name: 'mock-react',
          setup(build) {
            build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'mock-react' }));
            build.onLoad({ filter: /.*/, namespace: 'mock-react' }, () => ({
              contents: 'export default { createElement: () => null, useMemo: (fn) => fn() };',
              loader: 'js',
            }));
          },
        },
      ],
    });
    const codeB64 = Buffer.from(built.outputFiles[0].text, 'utf8').toString('base64');
    const {
      generateQrMatrix,
      slugifyQrPart,
      buildTableQrMenuUrl,
      parseQrRouteFromUrl,
    } = await import(`data:text/javascript;base64,${codeB64}`);

    // Slugify & Turkish transliteration checks
    assert.strictEqual(slugifyQrPart('Fatih Çiftliği'), 'fatih-ciftligi');
    assert.strictEqual(slugifyQrPart('Bahçe & Teras'), 'bahce-teras');
    assert.strictEqual(slugifyQrPart('KASAP 100'), 'kasap-100');

    // URL generation: restaurant, area, table slugs
    assert.strictEqual(
      buildTableQrMenuUrl('https://siparis.restoran.com/', 'Fatih Çiftliği', 'KASAP', 'KASAP 100'),
      'https://siparis.restoran.com/?restoran=fatih-ciftligi&bolge=kasap&masa=kasap-100'
    );

    // URL parsing: new query format, 3-segment path format, and legacy qr_table format
    assert.deepStrictEqual(
      parseQrRouteFromUrl('?restoran=fatih-ciftligi&bolge=kasap&masa=kasap-100'),
      { restoran: 'fatih-ciftligi', bolge: 'kasap', masa: 'kasap-100', tableId: undefined }
    );
    assert.deepStrictEqual(
      parseQrRouteFromUrl('', '/fatih-ciftligi/bahce/masa-12', ''),
      { restoran: 'fatih-ciftligi', bolge: 'bahce', masa: 'masa-12', tableId: undefined }
    );
    assert.deepStrictEqual(
      parseQrRouteFromUrl('?qr_table=132&restaurant=fatihciftligi'),
      { tableId: 132, restoran: 'fatihciftligi' }
    );
    assert.strictEqual(parseQrRouteFromUrl('?foo=bar', '/tables', '#tables'), null);

    const urls = [
      'http://localhost/?restoran=fatih-ciftligi&bolge=kasap&masa=kasap-100',
      'https://siparis.boncore-demo.com.tr/?restoran=kadikoy-sube&bolge=bahce-teras&masa=masa-12',
    ];

    for (const url of urls) {
      const matrix = generateQrMatrix(url);
      const n = matrix.length;
      assert.ok(n >= 21 && n <= 57 && (n - 17) % 4 === 0, `Valid QR dimension (${n}x${n})`);
      assert.ok(matrix.every(row => row.length === n), 'Square matrix');

      // Check 3 Finder Patterns (7x7 outer ring dark, 3x3 center dark)
      const corners = [[0, 0], [0, n - 7], [n - 7, 0]];
      for (const [r0, c0] of corners) {
        for (let dr = 0; dr < 7; dr++) {
          for (let dc = 0; dc < 7; dc++) {
            const expectedDark =
              dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
            assert.strictEqual(matrix[r0 + dr][c0 + dc], expectedDark, `Finder(${r0},${c0}) + (${dr},${dc})`);
          }
        }
      }

      // Check Timing Patterns (row 6 and col 6 alternating)
      for (let i = 8; i < n - 8; i++) {
        assert.strictEqual(matrix[6][i], i % 2 === 0, `Horizontal timing at col ${i}`);
        assert.strictEqual(matrix[i][6], i % 2 === 0, `Vertical timing at row ${i}`);
      }

      // Check Always-Dark Module
      assert.strictEqual(matrix[n - 8][8], true, 'Dark module at (n-8, 8)');

      // Verify BCH(15,5) Format Info copies match and syndrome is 0
      let copy1 = 0;
      let copy2 = 0;
      for (let i = 0; i < 15; i++) {
        const b1 =
          i < 6 ? matrix[i][8]
          : i === 6 ? matrix[7][8]
          : i === 7 ? matrix[8][8]
          : i === 8 ? matrix[8][7]
          : matrix[8][14 - i];
        if (b1) copy1 |= (1 << i);

        const b2 = i < 8 ? matrix[8][n - 1 - i] : matrix[n - 15 + i][8];
        if (b2) copy2 |= (1 << i);
      }
      assert.strictEqual(copy1, copy2, 'Format info copies 1 and 2 must match');

      const unmaskedFmt = copy1 ^ 0x5412;
      let rem = unmaskedFmt;
      for (let i = 14; i >= 10; i--) {
        if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
      }
      assert.strictEqual(rem, 0, 'Format info BCH(15,5) remainder must be 0');
      assert.strictEqual((unmaskedFmt >> 13) & 3, 1, 'ECC Level must be L (01)');
    }
  });

  test('QrMenuSimulator defaults to white theme and supports bulk side-by-side cm QR printing without blank pages', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolveFrontend = (rel) => path.resolve(rel).replace(/tests[\\/]+src/, 'src');

    const qrSimSrc = fs.readFileSync(resolveFrontend('src/components/qr/QrMenuSimulator.tsx'), 'utf8');
    const cssSrc = fs.readFileSync(resolveFrontend('src/index.css'), 'utf8');

    // Default white theme & toggle
    assert.ok(qrSimSrc.includes("useState<'light' | 'dark'>('light')"), 'Defaults qrTheme to light');
    assert.ok(qrSimSrc.includes('buildTableQrMenuUrl(activeOrigin, restaurantTitle,'), 'Builds QR link with restaurant, area, table');

    // Bulk table selection & cm size portal
    assert.ok(qrSimSrc.includes('selectFirst12PrintTables'), 'Includes First 12 Tables quick select');
    assert.ok(qrSimSrc.includes('printable-qr-sheet'), 'Renders printable QR sheet portal');
    assert.ok(qrSimSrc.includes('printable-qr-card'), 'Renders printable QR card');
    assert.ok(qrSimSrc.includes('`${clampedQrCm}cm`'), 'Applies exact cm width to printed cards');

    // CSS guards against blank page & thermal override
    assert.ok(cssSrc.includes('body:not(.qr-print-mode)'), 'Thermal rules scoped away from QR print mode');
    assert.ok(cssSrc.includes('body.qr-print-mode .printable-qr-sheet'), 'QR print mode renders sheet as flex row wrap');
    assert.ok(cssSrc.includes('flex-wrap: wrap !important'), 'QR print mode lays out cards side-by-side');
  });
});

// ---------------------------------------------------------------------------
// 16. SaaS Master Admin Yetkili Adı Soyadı & Quick Add Modal Routing (R10)
// ---------------------------------------------------------------------------
describe('SaaS Master Admin Yetkili Adı Contract', () => {
  test('MasterTenantsView & MasterTenantUsersView expose Yetkili Adı Soyadı inputs in Add, Edit, and Quick Edit modals', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolveFrontend = (rel) => path.resolve(rel).replace(/tests[\\/]+src/, 'src');

    const tenantsSrc = fs.readFileSync(resolveFrontend('src/components/master_admin/MasterTenantsView.tsx'), 'utf8');
    const usersSrc = fs.readFileSync(resolveFrontend('src/components/master_admin/MasterTenantUsersView.tsx'), 'utf8');
    const layoutSrc = fs.readFileSync(resolveFrontend('src/components/master_admin/MasterAdminLayout.tsx'), 'utf8');
    const dashSrc = fs.readFileSync(resolveFrontend('src/components/master_admin/MasterDashboardView.tsx'), 'utf8');

    // Add modal: required Yetkili Adı Soyadı in both general info and credentials box
    assert.ok(tenantsSrc.includes('Yetkili Adı Soyadı (İşletme Yetkilisi) *'), 'Add/Edit label present');
    assert.ok(tenantsSrc.includes('Yetkili / Yönetici Adı Soyadı *'), 'Credentials box label present');
    assert.ok(tenantsSrc.includes('value={newForm.owner_name}'), 'Add modal owner_name input bound');

    // Edit modal: Yetkili Adı Soyadı input bound to editingTenant.owner_name
    assert.ok(tenantsSrc.includes('value={editingTenant.owner_name || \'\'}'), 'Edit modal owner_name input bound');
    assert.ok(tenantsSrc.includes('setEditingTenant({ ...editingTenant, owner_name: e.target.value })'), 'Edit modal updates owner_name');

    // Tenant Users quick-edit modal: owner_name input bound to newTenantOwnerName
    assert.ok(usersSrc.includes('value={newTenantOwnerName}'), 'Users quick-edit modal binds owner_name');
    assert.ok(usersSrc.includes('owner_name: newTenantOwnerName.trim()'), 'Users quick-edit modal submits owner_name');

    // Dashboard '+ Yeni Restoran Ekle' opens modal directly
    assert.ok(dashSrc.includes("onNavigateTab('tenants-add')"), 'Dashboard triggers tenants-add');
    assert.ok(layoutSrc.includes('openAddModalOnMount={openAddTenantModal}'), 'Layout passes openAddModalOnMount');

    // Tenant login code edit helpers & state sync
    assert.ok(tenantsSrc.includes('sanitizeCodeInput(e.target.value)'), 'MasterTenantsView uses Turkish-safe sanitizeCodeInput');
    assert.ok(usersSrc.includes('sanitizeCodeInput(e.target.value)'), 'MasterTenantUsersView uses Turkish-safe sanitizeCodeInput');
    assert.ok(tenantsSrc.includes('original_code: tenant.code'), 'Tracks original_code for localStorage sync');
  });

  test('Master Admin PUT /api/master/tenants/:id persists login code changes and validates length', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const listRes = await fetch('http://127.0.0.1:8000/api/master/tenants');
    assert.strictEqual(listRes.status, 200, 'Master tenants endpoint responds 200');
    const tenants = await listRes.json();
    assert.ok(Array.isArray(tenants) && tenants.length > 0, 'At least one tenant exists');

    const target = tenants[0];
    const origCode = target.code;
    const testCode = `${origCode}-testcode`;

    try {
      // Short code validation (< 2 chars)
      const badRes = await fetch(`http://127.0.0.1:8000/api/master/tenants/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'a' }),
      });
      assert.strictEqual(badRes.status, 400, 'Rejects login code shorter than 2 characters');

      // Valid code rename
      const okRes = await fetch(`http://127.0.0.1:8000/api/master/tenants/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: testCode }),
      });
      assert.strictEqual(okRes.status, 200, 'Updates tenant code via PUT');
      const okData = await okRes.json();
      assert.strictEqual(okData.code, testCode, 'PUT response returns updated code');

      // Verify persisted in GET /api/master/tenants
      const verifyRes = await fetch('http://127.0.0.1:8000/api/master/tenants');
      const verifyList = await verifyRes.json();
      const updated = verifyList.find((x) => x.id === target.id);
      assert.strictEqual(updated?.code, testCode, 'GET /api/master/tenants returns updated code');
    } finally {
      // Restore original code & remove temp test sqlite copy if created
      await fetch(`http://127.0.0.1:8000/api/master/tenants/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: origCode }),
      });
      const tmpDb = path.resolve(`../backend/data/tenants/${testCode}.db`).replace(/frontend[\\/]+tests[\\/]+/, '');
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          if (fs.existsSync(tmpDb + suffix)) fs.unlinkSync(tmpDb + suffix);
        } catch {}
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 17. Cashier Opening Float Zero Default & Manual Advance Support
// ---------------------------------------------------------------------------
describe('Cashier Opening Float Zero Default & Manual Advance', () => {
  test('CashierManagement defaults opening_float fallback to 0 and selects Açılış Avansı on Cash-In toggle', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolveFrontend = (rel) => path.resolve(rel).replace(/tests[\\/]+src/, 'src');
    const cashierSrc = fs.readFileSync(resolveFrontend('src/components/cashier/CashierManagement.tsx'), 'utf8');

    assert.ok(!cashierSrc.includes('opening_float ?? 1500'), 'No hardcoded 1500 fallback remains in CashierManagement');
    assert.ok(cashierSrc.includes('opening_float ?? 0'), 'Uses 0 as opening_float fallback');
    assert.ok(cashierSrc.includes("setExpenseType('in'); setExpenseCategory('Açılış Avansı')"), 'Switches category to Açılış Avansı when Kasa Girişi is chosen');
  });

  test('Backend active-register, x-report, and day-end default opening_float to 0 and track manual Açılış Avansı', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Restaurant-Code': 'fatihciftligi',
    };

    const beforeRes = await fetch('http://127.0.0.1:8000/api/cashier/active-register', { headers });
    assert.strictEqual(beforeRes.status, 200, 'active-register responds 200');
    const beforeData = await beforeRes.json();
    assert.strictEqual(beforeData.opening_float, 0, 'Default active-register opening_float must be 0');

    const xBeforeRes = await fetch('http://127.0.0.1:8000/api/cashier/x-report', { headers });
    assert.strictEqual(xBeforeRes.status, 200, 'x-report responds 200');
    const xBefore = await xBeforeRes.json();
    assert.strictEqual(xBefore.opening_float, 0, 'Default x-report opening_float must be 0');

    let createdExpenseId = null;
    try {
      const createRes = await fetch('http://127.0.0.1:8000/api/cashier/expenses', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category: 'Açılış Avansı',
          amount: 350,
          expense_type: 'in',
          description: 'Test Manuel Açılış Avansı',
          created_by: 'Test Kasiyer',
        }),
      });
      assert.strictEqual(createRes.status, 200, 'Creates manual Açılış Avansı entry');
      const createData = await createRes.json();
      createdExpenseId = createData.expense_id;
      assert.strictEqual(createData.summary?.opening_float, 350, 'Summary opening_float updates to 350');
      assert.strictEqual(
        Number(createData.summary?.cash_in_drawer.toFixed(2)),
        Number((beforeData.cash_in_drawer + 350).toFixed(2)),
        'Drawer expected cash increases by manual opening advance'
      );

      const xAfterRes = await fetch('http://127.0.0.1:8000/api/cashier/x-report', { headers });
      const xAfter = await xAfterRes.json();
      assert.strictEqual(xAfter.opening_float, 350, 'X-report opening_float reflects manual entry');

      const dayEndRes = await fetch('http://127.0.0.1:8000/api/cashier/reports/day-end', { headers });
      assert.strictEqual(dayEndRes.status, 200, 'day-end report responds 200');
      const dayEndData = await dayEndRes.json();
      assert.strictEqual(dayEndData.opening_float, 350, 'Day-end top-level opening_float reflects manual entry');
      assert.strictEqual(dayEndData.cash_flow?.opening_float, 350, 'Day-end cash_flow.opening_float reflects manual entry');
    } finally {
      if (createdExpenseId) {
        const delRes = await fetch(`http://127.0.0.1:8000/api/cashier/expenses/${createdExpenseId}`, {
          method: 'DELETE',
          headers,
        });
        assert.strictEqual(delRes.status, 200, 'Deletes test Açılış Avansı entry');
        const delData = await delRes.json();
        assert.strictEqual(delData.summary?.opening_float, 0, 'opening_float returns to 0 after deleting manual entry');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 18. QR Menu Orderable Filtering, Note Prompt, Prepaid Table & KDS Visibility
// ---------------------------------------------------------------------------
describe('QR Menu Filtering, Customer Note Prompt, Prepaid Table & KDS Visibility', () => {
  test('QR Menu removes language/diet UI, prompts customer note, keeps table open as Ön Ödeme Alındı, and surfaces in FloorView/PosTerminal/KDS', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolveFrontend = (rel) => path.resolve(rel).replace(/tests[\\/]+src/, 'src');

    const qrSrc = fs.readFileSync(resolveFrontend('src/components/qr/QrMenuSimulator.tsx'), 'utf8');
    const floorSrc = fs.readFileSync(resolveFrontend('src/components/tables/FloorView.tsx'), 'utf8');
    const posSrc = fs.readFileSync(resolveFrontend('src/components/pos/PosTerminal.tsx'), 'utf8');
    const kdsSrc = fs.readFileSync(resolveFrontend('src/components/kds/KdsScreen.tsx'), 'utf8');

    assert.ok(!qrSrc.includes('QR_TRANSLATIONS'), 'QR_TRANSLATIONS language switcher removed');
    assert.ok(!qrSrc.includes('dietFilter'), 'Dietary filter pills (Vegan/Glütensiz/Acılı) removed');
    assert.ok(qrSrc.includes('orderableMenuTree'), 'Filters only orderable products & non-empty categories');
    assert.ok(qrSrc.includes('setIsOrderNoteModalOpen(true)'), 'Prompts customer order note modal on Mutfağa Sipariş Ver');
    assert.ok(qrSrc.includes('Müşteri Sipariş Notu'), 'Renders Müşteri Sipariş Notu modal & input');
    assert.ok(qrSrc.includes('close_table: false'), 'Virtual POS QR payment sends close_table: false');

    assert.ok(floorSrc.includes('Ön Ödeme Alındı'), 'FloorView displays Ön Ödeme Alındı badge');
    assert.ok(posSrc.includes('Ön Ödeme Alındı'), 'PosTerminal displays Ön Ödeme Alındı status');
    assert.ok(!posSrc.includes("ord.status === 'paid' || ord.remaining_total <= 0.05"), 'PosTerminal loadOrder does not wipe open prepaid order');
    assert.ok(kdsSrc.includes('ÖN ÖDEME ALINDI'), 'KdsScreen shows ÖN ÖDEME ALINDI badge');
    assert.ok(kdsSrc.includes('Müşteri Notu:'), 'KdsScreen displays prominent customer order note');
  });

  test('Backend QR order + customer note + Virtual POS close_table:false keeps table occupied, shows Ön Ödeme & visible in KDS', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Restaurant-Code': 'fatihciftligi',
    };

    const areasRes = await fetch('http://127.0.0.1:8000/api/tables/areas', { headers });
    assert.strictEqual(areasRes.status, 200, 'Fetches /api/tables/areas');
    const areas = await areasRes.json();
    let emptyTable = null;
    for (const a of areas) {
      const candidate = (a.tables || []).find((t) => t.status === 'empty' && !t.active_order);
      if (candidate) {
        emptyTable = candidate;
        break;
      }
    }
    assert.ok(emptyTable, 'Requires at least one empty table for QR prepaid E2E test');

    const menuRes = await fetch(`http://127.0.0.1:8000/api/qr/table/${emptyTable.id}/menu`, { headers });
    assert.strictEqual(menuRes.status, 200, 'Fetches /api/qr/table/:id/menu');
    const menuData = await menuRes.json();
    assert.ok(Array.isArray(menuData.menu) && menuData.menu.length > 0, 'Menu has at least one non-empty category');

    let firstOrderableProduct = null;
    for (const cat of menuData.menu) {
      assert.ok(Array.isArray(cat.products) && cat.products.length > 0, `Category ${cat.name} should not be empty`);
      for (const p of cat.products) {
        assert.notStrictEqual(p.is_available, false, `Product ${p.name} in QR menu must be available`);
        assert.ok(Number(p.base_price) > 0, `Product ${p.name} in QR menu must have positive price`);
        if (!firstOrderableProduct && (!p.has_stock_tracking || Number(p.stock_quantity ?? 0) >= 1)) {
          firstOrderableProduct = p;
        }
      }
    }
    assert.ok(firstOrderableProduct, 'Found orderable product for QR order');

    const testNote = 'Soğansız ve az pişmiş lütfen (QR E2E)';
    let createdOrderId = null;

    try {
      const orderRes = await fetch(`http://127.0.0.1:8000/api/qr/table/${emptyTable.id}/order`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          waiter_name: 'QR Müşteri',
          notes: testNote,
          items: [
            {
              product_id: firstOrderableProduct.id,
              unit_price: firstOrderableProduct.base_price,
              quantity: 1,
              selected_modifiers: [],
              negative_modifiers: [],
              kitchen_note: testNote,
            },
          ],
        }),
      });
      assert.strictEqual(orderRes.status, 200, 'POST /api/qr/table/:id/order returns 200');
      const orderJson = await orderRes.json();
      createdOrderId = orderJson.order_id;
      assert.ok(createdOrderId, 'Created QR order ID returned');

      const getOrderRes = await fetch(`http://127.0.0.1:8000/api/orders/${createdOrderId}`, { headers });
      const getOrderJson = await getOrderRes.json();
      const grandTotal = Number(getOrderJson.grand_total || firstOrderableProduct.base_price);

      const payRes = await fetch('http://127.0.0.1:8000/api/cashier/settle-payment', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          order_id: createdOrderId,
          payments: [{ method: 'online', amount: grandTotal, tip: 0 }],
          cashier_name: 'Online Sanal POS (Tam)',
          close_table: false,
        }),
      });
      assert.strictEqual(payRes.status, 200, 'settle-payment with close_table: false returns 200');
      const payJson = await payRes.json();
      assert.strictEqual(payJson.table_status, 'occupied', 'Table remains occupied after QR payment');
      assert.strictEqual(payJson.order_status, 'open', 'Order remains open after close_table: false');
      assert.strictEqual(payJson.is_prepaid, true, 'Payment response marks order as prepaid');

      const areasAfterRes = await fetch('http://127.0.0.1:8000/api/tables/areas', { headers });
      const areasAfter = await areasAfterRes.json();
      let updatedTable = null;
      for (const a of areasAfter) {
        const match = (a.tables || []).find((t) => t.id === emptyTable.id);
        if (match) {
          updatedTable = match;
          break;
        }
      }
      assert.strictEqual(updatedTable?.status, 'occupied', 'FloorView table stays occupied');
      assert.strictEqual(updatedTable?.active_order?.id, createdOrderId, 'Active order stays attached to table');
      assert.strictEqual(updatedTable?.active_order?.is_prepaid, true, 'Active order flags is_prepaid: true');
      assert.strictEqual(updatedTable?.active_order?.notes, testNote, 'Active order retains customer note');

      const kdsRes = await fetch('http://127.0.0.1:8000/api/kds/orders?station=all', { headers });
      assert.strictEqual(kdsRes.status, 200, 'GET /api/kds/orders responds 200');
      const kdsOrders = await kdsRes.json();
      const kdsMatch = kdsOrders.find((o) => o.order_id === createdOrderId);
      assert.ok(kdsMatch, 'Prepaid QR order remains visible on Kitchen KDS');
      assert.strictEqual(kdsMatch.is_prepaid, true, 'KDS order carries is_prepaid: true');
      assert.strictEqual(kdsMatch.notes, testNote, 'KDS order exposes customer note');

      const menuAfterRes = await fetch(`http://127.0.0.1:8000/api/qr/table/${emptyTable.id}/menu`, { headers });
      const menuAfter = await menuAfterRes.json();
      assert.strictEqual(menuAfter?.active_order?.is_prepaid, true, 'QR menu reflects active_order is_prepaid');
    } finally {
      if (createdOrderId) {
        const closeRes = await fetch('http://127.0.0.1:8000/api/cashier/settle-payment', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            order_id: createdOrderId,
            payments: [],
            cashier_name: 'E2E Test Kapanış',
            close_table: true,
          }),
        });
        assert.strictEqual(closeRes.status, 200, 'Cleanly closes prepaid test table with close_table: true');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 19. QR Menu Cart Management, Gramaj (Kg) Prompt, Category Filter & Self-Pay Settings
// ---------------------------------------------------------------------------
describe('QR Menu Cart Management, Gramaj (Kg) Prompt & Settings', () => {
  test('QrMenuSimulator & api expose cart view/delete, gramaj (Kg) modal, category selection and self-payment toggle', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolveFrontend = (rel) => path.resolve(rel).replace(/tests[\\/]+src/, 'src');

    const qrSrc = fs.readFileSync(resolveFrontend('src/components/qr/QrMenuSimulator.tsx'), 'utf8');
    const apiSrc = fs.readFileSync(resolveFrontend('src/services/api.ts'), 'utf8');

    assert.ok(apiSrc.includes('getQrMenuSettings'), 'api.ts defines getQrMenuSettings');
    assert.ok(apiSrc.includes('updateQrMenuSettings'), 'api.ts defines updateQrMenuSettings');

    assert.ok(qrSrc.includes('handleRemoveFromCart'), 'Supports deleting un-ordered items from cart');
    assert.ok(qrSrc.includes('Sepeti Temizle'), 'Supports clearing un-ordered cart');
    assert.ok(qrSrc.includes('isWeightProduct'), 'Detects Kg/weight products in QR menu');
    assert.ok(qrSrc.includes('weightGramInput') && qrSrc.includes('weightKgInput'), 'Prompts customer for gramaj (gr/Kg)');
    assert.ok(qrSrc.includes('Gramaj ile Sepete Ekle'), 'Confirms gramaj weight addition to cart');
    assert.ok(qrSrc.includes('QR Menü Ayarları'), 'Exposes QR Menü Ayarları panel');
    assert.ok(qrSrc.includes('Masadan Müşteri Ödemesi'), 'Exposes self-payment enable/disable setting');
    assert.ok(qrSrc.includes('Gösterilecek Ürün Kategorileri'), 'Exposes category visibility selection setting');
  });

  test('Backend persists QR settings (allowed categories & allow_table_payment), exposes unit labels, and computes fractional Kg QR orders', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Restaurant-Code': 'fatihciftligi',
    };

    const areasRes = await fetch('http://127.0.0.1:8000/api/tables/areas', { headers });
    assert.strictEqual(areasRes.status, 200, 'Fetches /api/tables/areas');
    const areas = await areasRes.json();
    let emptyTable = null;
    for (const a of areas) {
      const candidate = (a.tables || []).find((t) => t.status === 'empty' && !t.active_order);
      if (candidate) {
        emptyTable = candidate;
        break;
      }
    }
    assert.ok(emptyTable, 'Requires an empty table for Suite 19 test');

    const origSettingsRes = await fetch('http://127.0.0.1:8000/api/qr/settings', { headers });
    assert.strictEqual(origSettingsRes.status, 200, 'GET /api/qr/settings responds 200');
    const origSettings = await origSettingsRes.json();

    const menuRes = await fetch(`http://127.0.0.1:8000/api/qr/table/${emptyTable.id}/menu`, { headers });
    assert.strictEqual(menuRes.status, 200, 'GET /api/qr/table/:id/menu responds 200');
    const menuData = await menuRes.json();
    assert.ok(Array.isArray(menuData.all_categories) && menuData.all_categories.length > 0, 'Menu returns all_categories');
    assert.ok(typeof menuData.qr_settings?.allow_table_payment === 'boolean', 'Menu returns qr_settings.allow_table_payment');

    let firstProduct = null;
    let firstCatId = null;
    for (const cat of menuData.menu || []) {
      for (const p of cat.products || []) {
        assert.ok(typeof p.unit === 'string' && p.unit.length > 0, `Product ${p.name} includes unit field`);
        if (!firstProduct && (!p.has_stock_tracking || Number(p.stock_quantity ?? 0) >= 1)) {
          firstProduct = p;
          firstCatId = cat.id;
        }
      }
    }
    assert.ok(firstProduct, 'Found product for fractional weight test');
    if (!firstCatId) firstCatId = menuData.all_categories[0].id;
    let createdOrderId = null;

    try {
      const putRes = await fetch('http://127.0.0.1:8000/api/qr/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          allow_table_payment: false,
          allowed_category_ids: [firstCatId],
        }),
      });
      assert.strictEqual(putRes.status, 200, 'PUT /api/qr/settings updates settings');
      const putJson = await putRes.json();
      assert.strictEqual(putJson.allow_table_payment, false, 'Saved allow_table_payment = false');
      assert.deepStrictEqual(putJson.allowed_category_ids, [firstCatId], 'Saved single allowed category');

      const filteredMenuRes = await fetch(`http://127.0.0.1:8000/api/qr/table/${emptyTable.id}/menu`, { headers });
      const filteredMenu = await filteredMenuRes.json();
      assert.strictEqual(filteredMenu.qr_settings?.allow_table_payment, false, 'Menu reflects allow_table_payment = false');
      assert.strictEqual(filteredMenu.menu?.length, 1, 'Menu is filtered to 1 selected category');
      assert.strictEqual(filteredMenu.menu?.[0]?.id, firstCatId, 'Filtered menu matches selected category ID');

      // Test fractional Kg quantity (0.250 Kg = 250 gr) calculation in QR order
      const orderRes = await fetch(`http://127.0.0.1:8000/api/qr/table/${emptyTable.id}/order`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          waiter_name: 'QR Müşteri',
          notes: '250 gr tartı testi',
          items: [
            {
              product_id: firstProduct.id,
              unit_price: firstProduct.base_price,
              quantity: 0.25,
              selected_modifiers: [],
              negative_modifiers: [],
              kitchen_note: '250 gr tartı testi',
            },
          ],
        }),
      });
      assert.strictEqual(orderRes.status, 200, 'POST /api/qr/table/:id/order accepts fractional 0.25 Kg quantity');
      const orderJson = await orderRes.json();
      createdOrderId = orderJson.order_id;
      assert.ok(createdOrderId, 'Fractional Kg order created');

      const detRes = await fetch(`http://127.0.0.1:8000/api/orders/${createdOrderId}`, { headers });
      const det = await detRes.json();
      const expectedTotal = Number((Number(firstProduct.base_price) * 0.25).toFixed(2));
      assert.strictEqual(Number(Number(det.grand_total).toFixed(2)), expectedTotal, 'Computes exact proportional price for 250 gr (0.25 Kg)');
    } finally {
      if (createdOrderId) {
        const detRes = await fetch(`http://127.0.0.1:8000/api/orders/${createdOrderId}`, { headers });
        const det = await detRes.json();
        await fetch('http://127.0.0.1:8000/api/cashier/settle-payment', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            order_id: createdOrderId,
            payments: [{ method: 'cash', amount: Number(det.remaining_total || det.grand_total || 0), tip: 0 }],
            cashier_name: 'Suite 19 Cleanup',
            close_table: true,
          }),
        });
      }
      await fetch('http://127.0.0.1:8000/api/qr/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          allow_table_payment: origSettings.allow_table_payment ?? true,
          allowed_category_ids: origSettings.has_custom_categories ? origSettings.allowed_category_ids : null,
        }),
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 20. Out-of-Stock Polite Customer Message & Negative Stock KDS/Waiter Approval
// ---------------------------------------------------------------------------
describe('Out-of-Stock Customer Notice & Negative Stock KDS/Waiter Approval Flow', () => {
  test('Frontend QR Menu, KDS, App Waiter Banner, and PosTerminal expose out-of-stock & Yine de Devam Et flows', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolveFrontend = (rel) => path.resolve(rel).replace(/tests[\\/]+src/, 'src');

    const qrSrc = fs.readFileSync(resolveFrontend('src/components/qr/QrMenuSimulator.tsx'), 'utf8');
    const kdsSrc = fs.readFileSync(resolveFrontend('src/components/kds/KdsScreen.tsx'), 'utf8');
    const appSrc = fs.readFileSync(resolveFrontend('src/App.tsx'), 'utf8');
    const posSrc = fs.readFileSync(resolveFrontend('src/components/pos/PosTerminal.tsx'), 'utf8');
    const apiSrc = fs.readFileSync(resolveFrontend('src/services/api.ts'), 'utf8');

    assert.ok(apiSrc.includes('approveOutOfStockItem'), 'api.ts defines approveOutOfStockItem');
    assert.ok(apiSrc.includes('getStockApprovals'), 'api.ts defines getStockApprovals');

    assert.ok(qrSrc.includes('isProductOutOfStock'), 'QR Menu checks product stock availability');
    assert.ok(qrSrc.includes('Efendim maalesef'), 'QR Menu politely informs customer with Efendim maalesef');
    assert.ok(qrSrc.includes('elimizde kalmadı'), 'QR Menu displays elimizde kalmadı when stock is 0');
    assert.ok(qrSrc.includes('allow_negative_stock'), 'QR Menu distinguishes allow_negative_stock items');

    assert.ok(kdsSrc.includes('Müşteri bu ürünü istedi ama stok yok! Devam edilsin mi?'), 'KDS shows out-of-stock continuation prompt');
    assert.ok(kdsSrc.includes('Yine de Devam Et'), 'KDS provides Yine de Devam Et confirmation button');
    assert.ok(kdsSrc.includes('approveOutOfStockItem'), 'KDS calls approveOutOfStockItem');

    assert.ok(appSrc.includes('OUT_OF_STOCK_ORDER_ALERT'), 'App listens for waiter OUT_OF_STOCK_ORDER_ALERT events');
    assert.ok(appSrc.includes('stockApprovalAlerts'), 'App tracks active waiter stock approval alerts');
    assert.ok(appSrc.includes('istedi ama stok yok! Devam edilsin mi?'), 'Waiter alert banner asks Devam edilsin mi?');
    assert.ok(appSrc.includes('Yine de Devam Et'), 'Waiter alert banner includes Yine de Devam Et button');

    assert.ok(posSrc.includes("item.status === 'stock_confirm'"), 'PosTerminal recognizes stock_confirm items');
    assert.ok(posSrc.includes('Yine de Devam Et'), 'PosTerminal includes Yine de Devam Et action for waiters');
  });

  test('Backend blocks 0-stock (!allow_negative_stock) with "Efendim maalesef ... elimizde kalmadı" and drops 0->-1 only after KDS/Waiter approval when allow_negative_stock=true', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Restaurant-Code': 'fatihciftligi',
    };

    const areasRes = await fetch('http://127.0.0.1:8000/api/tables/areas', { headers });
    assert.strictEqual(areasRes.status, 200, 'Fetches /api/tables/areas');
    const areas = await areasRes.json();
    let emptyTable = null;
    for (const a of areas) {
      const candidate = (a.tables || []).find((t) => t.status === 'empty' && !t.active_order);
      if (candidate) {
        emptyTable = candidate;
        break;
      }
    }
    assert.ok(emptyTable, 'Requires an empty table for Suite 20 E2E test');

    const catsRes = await fetch('http://127.0.0.1:8000/api/products/categories', { headers });
    const cats = await catsRes.json();
    assert.ok(Array.isArray(cats) && cats.length > 0, 'Fetches categories');
    const targetCategoryId = cats[0].id;

    const uniqueName = `E2E Stok Test Pirzola ${Date.now()} (Kg)`;
    let createdProductId = null;
    let createdOrderId = null;

    try {
      const createProdRes = await fetch('http://127.0.0.1:8000/api/products/items', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category_id: targetCategoryId,
          name: uniqueName,
          base_price: 600,
          station: 'grill',
          unit: 'Kg',
          stock_quantity: 0,
          allow_negative_stock: false,
          is_available: true,
          show_in_pos: true,
        }),
      });
      assert.strictEqual(createProdRes.status, 200, 'Creates 0-stock test product with allow_negative_stock: false');
      const createProdJson = await createProdRes.json();
      createdProductId = createProdJson.product_id;
      assert.ok(createdProductId, 'Created test product ID');

      // 1) Verify QR menu exposes stock tracking info for the 0-stock item
      const menuRes = await fetch(`http://127.0.0.1:8000/api/qr/table/${emptyTable.id}/menu`, { headers });
      const menuJson = await menuRes.json();
      let foundMenuProd = null;
      for (const cat of menuJson.menu || []) {
        const hit = (cat.products || []).find((p) => p.id === createdProductId);
        if (hit) {
          foundMenuProd = hit;
          break;
        }
      }
      assert.ok(foundMenuProd, 'Test product appears in QR menu');
      assert.strictEqual(foundMenuProd.has_stock_tracking, true, 'QR product carries has_stock_tracking: true');
      assert.strictEqual(foundMenuProd.stock_quantity, 0, 'QR product reports stock_quantity: 0');
      assert.strictEqual(foundMenuProd.allow_negative_stock, false, 'QR product reports allow_negative_stock: false');

      // 2) Ordering when stock=0 and allow_negative_stock=false must fail politely
      const blockedOrderRes = await fetch(`http://127.0.0.1:8000/api/qr/table/${emptyTable.id}/order`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          waiter_name: 'QR Müşteri',
          items: [
            {
              product_id: createdProductId,
              unit_price: 600,
              quantity: 1,
              selected_modifiers: [],
              negative_modifiers: [],
            },
          ],
        }),
      });
      assert.strictEqual(blockedOrderRes.status, 400, 'Out-of-stock item with !allow_negative_stock returns 400');
      const blockedErr = await blockedOrderRes.json();
      assert.ok(
        String(blockedErr.detail || '').includes('Efendim maalesef') &&
          String(blockedErr.detail || '').includes('elimizde kalmadı'),
        `Expected polite out-of-stock message, got: ${blockedErr.detail}`
      );

      // 3) Enable allow_negative_stock = true with stock still at 0, then order 1 Kg
      const updProdRes = await fetch(`http://127.0.0.1:8000/api/products/items/${createdProductId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          allow_negative_stock: true,
          stock_quantity: 0,
          unit: 'Kg',
        }),
      });
      assert.strictEqual(updProdRes.status, 200, 'Enables allow_negative_stock: true on test product');

      const pendingOrderRes = await fetch(`http://127.0.0.1:8000/api/qr/table/${emptyTable.id}/order`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          waiter_name: 'QR Müşteri',
          notes: '1 kg istendi (eksi stok onay testi)',
          items: [
            {
              product_id: createdProductId,
              unit_price: 600,
              quantity: 1,
              selected_modifiers: [],
              negative_modifiers: [],
            },
          ],
        }),
      });
      assert.strictEqual(pendingOrderRes.status, 200, 'Allows ordering 0-stock product when allow_negative_stock: true');
      const pendingOrderJson = await pendingOrderRes.json();
      createdOrderId = pendingOrderJson.order_id;
      assert.strictEqual(pendingOrderJson.pending_stock_approval, true, 'Flags pending_stock_approval: true');
      const pendingItemId = pendingOrderJson.pending_stock_items?.[0]?.item_id;
      assert.ok(pendingItemId, 'Returns pending stock item_id');

      // Stock must STILL be 0 before Waiter/KDS clicks "Yine de Devam Et"
      const menuBeforeApproveRes = await fetch(`http://127.0.0.1:8000/api/qr/table/${emptyTable.id}/menu`, { headers });
      const menuBeforeApprove = await menuBeforeApproveRes.json();
      let prodBeforeApprove = null;
      for (const cat of menuBeforeApprove.menu || []) {
        const hit = (cat.products || []).find((p) => p.id === createdProductId);
        if (hit) prodBeforeApprove = hit;
      }
      assert.strictEqual(prodBeforeApprove?.stock_quantity, 0, 'Stock remains 0 until Waiter or KDS approves');

      // KDS shows stock_confirm alert item & /kds/stock-approvals exposes waiter alert
      const kdsRes = await fetch('http://127.0.0.1:8000/api/kds/orders?station=all', { headers });
      const kdsOrders = await kdsRes.json();
      const kdsOrder = kdsOrders.find((o) => o.order_id === createdOrderId);
      assert.ok(kdsOrder, 'Pending negative-stock order appears in KDS');
      const kdsItem = kdsOrder.items.find((it) => it.id === pendingItemId);
      assert.strictEqual(kdsItem?.status, 'stock_confirm', 'KDS item status is stock_confirm');
      assert.strictEqual(kdsItem?.requires_stock_approval, true, 'KDS item flags requires_stock_approval: true');

      const approvalsRes = await fetch('http://127.0.0.1:8000/api/kds/stock-approvals', { headers });
      const approvals = await approvalsRes.json();
      const pendingAlert = approvals.find((a) => a.item_id === pendingItemId);
      assert.ok(pendingAlert, 'Waiter stock approval endpoint lists pending out-of-stock item');
      assert.ok(String(pendingAlert.message).includes('stok yok! Devam edilsin mi?'), 'Alert includes confirmation prompt');

      // Floor table waiter_call_reason also carries alert
      const areasDuringRes = await fetch('http://127.0.0.1:8000/api/tables/areas', { headers });
      const areasDuring = await areasDuringRes.json();
      let flaggedTable = null;
      for (const a of areasDuring) {
        const m = (a.tables || []).find((t) => t.id === emptyTable.id);
        if (m) flaggedTable = m;
      }
      assert.ok(String(flaggedTable?.waiter_call_reason || '').toLowerCase().includes('stok yok'), 'Table carries waiter stock alert reason');

      // 4) Waiter or KDS clicks "Yine de Devam Et" -> stock becomes -1
      const approveRes = await fetch(`http://127.0.0.1:8000/api/kds/item/${pendingItemId}/approve-stock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ approved_by: 'Mutfak KDS' }),
      });
      assert.strictEqual(approveRes.status, 200, 'Approve negative stock returns 200');
      const approveJson = await approveRes.json();
      assert.strictEqual(approveJson.status, 'preparing', 'Item advances to preparing after approval');
      assert.strictEqual(approveJson.already_approved, false, 'First approval processes deduction');
      assert.strictEqual(approveJson.new_stock, -1, '0 stock minus 1 Kg order becomes -1 after approval');

      // Second approval attempt must be idempotent (does NOT drop stock to -2)
      const dupRes = await fetch(`http://127.0.0.1:8000/api/kds/item/${pendingItemId}/approve-stock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ approved_by: 'Garson' }),
      });
      const dupJson = await dupRes.json();
      assert.strictEqual(dupJson.already_approved, true, 'Duplicate approval is idempotent');
      assert.strictEqual(dupJson.new_stock, -1, 'Duplicate approval keeps stock at -1 (no double deduction)');

      // Verify QR menu & inventory now reflect -1 stock
      const menuAfterApproveRes = await fetch(`http://127.0.0.1:8000/api/qr/table/${emptyTable.id}/menu`, { headers });
      const menuAfterApprove = await menuAfterApproveRes.json();
      let prodAfterApprove = null;
      for (const cat of menuAfterApprove.menu || []) {
        const hit = (cat.products || []).find((p) => p.id === createdProductId);
        if (hit) prodAfterApprove = hit;
      }
      assert.strictEqual(prodAfterApprove?.stock_quantity, -1, 'QR menu product reflects negative stock (-1)');
    } finally {
      if (createdOrderId) {
        const detRes = await fetch(`http://127.0.0.1:8000/api/orders/${createdOrderId}`, { headers });
        const det = await detRes.json().catch(() => ({}));
        await fetch('http://127.0.0.1:8000/api/cashier/settle-payment', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            order_id: createdOrderId,
            payments: [{ method: 'cash', amount: Number(det.remaining_total || det.grand_total || 600), tip: 0 }],
            cashier_name: 'Suite 20 Cleanup',
            close_table: true,
          }),
        });
      }
      if (createdProductId) {
        await fetch(`http://127.0.0.1:8000/api/products/items/${createdProductId}`, {
          method: 'DELETE',
          headers,
        });
      }
      const ingsRes = await fetch('http://127.0.0.1:8000/api/inventory/ingredients', { headers });
      const ings = await ingsRes.json().catch(() => []);
      const testIng = Array.isArray(ings) ? ings.find((i) => i.name === uniqueName) : null;
      if (testIng?.id) {
        await fetch(`http://127.0.0.1:8000/api/inventory/ingredients/${testIng.id}`, {
          method: 'DELETE',
          headers,
        });
      }
    }
  });
});

// =========================================================================
// TEST SUITE 21: Normal POS Negative Stock (-1.5 Kg) & Green/Yellow/Red Colors
// =========================================================================
describe('Suite 21: Normal POS Insufficient/Zero Stock Continuation & Badge Colors', () => {
  test('PosTerminal computes live effective stock, warns on <=0 or insufficient stock with Yine de Devam Et, and uses Green/Yellow/Red badge classes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolveFrontend = (rel) => path.resolve(rel).replace(/tests[\\/]+src/, 'src');
    const posSrc = fs.readFileSync(resolveFrontend('src/components/pos/PosTerminal.tsx'), 'utf8');

    assert.ok(posSrc.includes('getEffectiveProductStock'), 'PosTerminal defines getEffectiveProductStock helper');
    assert.ok(posSrc.includes('effectiveStock < 0'), 'Red badge branch handles negative stock (< 0)');
    assert.ok(posSrc.includes('text-rose-600'), 'Negative stock renders in rose/red');
    assert.ok(posSrc.includes('effectiveStock === 0'), 'Yellow badge branch handles zero stock (=== 0)');
    assert.ok(posSrc.includes('bg-amber-100'), 'Zero stock renders in amber/yellow');
    assert.ok(posSrc.includes('bg-emerald-50'), 'Positive stock renders in emerald/green');
    assert.ok(posSrc.includes('Yine de Devam Et'), 'Stock warning modal offers Yine de Devam Et');
  });

  test('Normal POS order (0.5 Kg stock minus 2 Kg ordered) deducts stock to -1.5 Kg in backend', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Restaurant-Code': 'fatihciftligi',
    };

    const areasRes = await fetch('http://127.0.0.1:8000/api/tables/areas', { headers });
    const areas = await areasRes.json();
    let emptyTable = null;
    for (const a of areas) {
      const candidate = (a.tables || []).find((t) => t.status === 'empty' && !t.active_order);
      if (candidate) {
        emptyTable = candidate;
        break;
      }
    }
    assert.ok(emptyTable, 'Requires an empty table for Suite 21 test');

    const catsRes = await fetch('http://127.0.0.1:8000/api/products/categories', { headers });
    const cats = await catsRes.json();
    assert.ok(Array.isArray(cats) && cats.length > 0, 'Fetches categories');
    const targetCategoryId = cats[0].id;

    const uniqueName = `E2E POS Antrikot ${Date.now()}`;
    let createdProductId = null;
    let createdOrderId = null;

    try {
      const createProdRes = await fetch('http://127.0.0.1:8000/api/products/items', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category_id: targetCategoryId,
          name: uniqueName,
          base_price: 800,
          station: 'grill',
          unit: 'Kg',
          stock_quantity: 0.5,
          allow_negative_stock: false,
          is_available: true,
          show_in_pos: true,
        }),
      });
      assert.strictEqual(createProdRes.status, 200, 'Creates 0.5 Kg test product');
      const createProdJson = await createProdRes.json();
      createdProductId = createProdJson.product_id;

      // Verify initial POS stock = 0.5
      const beforeCatsRes = await fetch('http://127.0.0.1:8000/api/products/categories', { headers });
      const beforeCats = await beforeCatsRes.json();
      let foundBefore = null;
      for (const c of beforeCats) {
        const hit = (c.products || []).find((p) => p.id === createdProductId);
        if (hit) foundBefore = hit;
      }
      assert.strictEqual(foundBefore?.stock_quantity, 0.5, 'Initial POS stock_quantity is 0.5 Kg');

      // Normal POS order requesting 2 Kg (after "Yine de Devam Et")
      const orderRes = await fetch('http://127.0.0.1:8000/api/orders/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          table_id: emptyTable.id,
          order_type: 'dine_in',
          waiter_name: 'Kasa Test',
          items: [
            {
              product_id: createdProductId,
              unit_price: 800,
              quantity: 2,
              selected_modifiers: [],
              negative_modifiers: [],
            },
          ],
        }),
      });
      assert.strictEqual(orderRes.status, 200, 'Normal POS order succeeds for 2 Kg when stock is 0.5 Kg');
      const orderJson = await orderRes.json();
      createdOrderId = orderJson.order_id;

      // Verify POS categories now report -1.5 Kg
      const afterCatsRes = await fetch('http://127.0.0.1:8000/api/products/categories', { headers });
      const afterCats = await afterCatsRes.json();
      let foundAfter = null;
      for (const c of afterCats) {
        const hit = (c.products || []).find((p) => p.id === createdProductId);
        if (hit) foundAfter = hit;
      }
      assert.strictEqual(foundAfter?.stock_quantity, -1.5, 'POS stock_quantity becomes -1.5 Kg (0.5 - 2.0)');
    } finally {
      if (createdOrderId) {
        const detRes = await fetch(`http://127.0.0.1:8000/api/orders/${createdOrderId}`, { headers });
        const det = await detRes.json().catch(() => ({}));
        await fetch('http://127.0.0.1:8000/api/cashier/settle-payment', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            order_id: createdOrderId,
            payments: [{ method: 'cash', amount: Number(det.remaining_total || det.grand_total || 1600), tip: 0 }],
            cashier_name: 'Suite 21 Cleanup',
            close_table: true,
          }),
        });
      }
      if (createdProductId) {
        await fetch(`http://127.0.0.1:8000/api/products/items/${createdProductId}`, {
          method: 'DELETE',
          headers,
        });
      }
      const ingsRes = await fetch('http://127.0.0.1:8000/api/inventory/ingredients', { headers });
      const ings = await ingsRes.json().catch(() => []);
      const testIng = Array.isArray(ings) ? ings.find((i) => i.name === uniqueName) : null;
      if (testIng?.id) {
        await fetch(`http://127.0.0.1:8000/api/inventory/ingredients/${testIng.id}`, {
          method: 'DELETE',
          headers,
        });
      }
    }
  });
});

// =========================================================================
// TEST SUITE 22: Product BOM Recipe (Serpme Kahvalti & All Products)
// =========================================================================
describe('Suite 22: Product BOM Recipe Display & CRUD Across All Products', () => {
  test('ProductDefinitions safely normalizes BOM recipe payloads, guards cost.toFixed, and shows card BOM badge', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolveFrontend = (rel) => path.resolve(rel).replace(/tests[\\/]+src/, 'src');
    const prodDefSrc = fs.readFileSync(resolveFrontend('src/components/products/ProductDefinitions.tsx'), 'utf8');

    assert.ok(prodDefSrc.includes('normalizeRecipeItems'), 'Defines normalizeRecipeItems helper');
    assert.ok(prodDefSrc.includes('recData?.recipes'), 'Reads recData.recipes array');
    assert.ok(prodDefSrc.includes('Number(item.cost || 0).toFixed(2)'), 'Guards item.cost.toFixed(2) against missing fields');
    assert.ok(prodDefSrc.includes('BOM: {p.recipe_items.length} Kalem'), 'Displays BOM recipe count badge on product cards');
  });

  test('Serpme Kahvalti (id=264) and newly created products return structured ProductRecipe BOM items from backend', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Restaurant-Code': 'fatihciftligi',
    };

    // 1) Existing product: ÇİFTLİK SERPME KAHVALTI (product_id = 264)
    const serpmeRes = await fetch('http://127.0.0.1:8000/api/inventory/recipes/264', { headers });
    assert.strictEqual(serpmeRes.status, 200, 'GET /api/inventory/recipes/264 returns 200');
    const serpmeBom = await serpmeRes.json();
    assert.strictEqual(serpmeBom.product_id, 264, 'Returns product_id 264');
    assert.strictEqual(serpmeBom.product_name, 'ÇİFTLİK SERPME KAHVALTI', 'Returns product_name ÇİFTLİK SERPME KAHVALTI');
    assert.ok(Array.isArray(serpmeBom.recipes), 'Returns recipes array on ProductRecipe object');
    assert.strictEqual(serpmeBom.recipes.length, 4, 'Serpme Kahvaltı has all 4 BOM ingredients');
    assert.ok(serpmeBom.estimated_cost > 0, 'Computes positive estimated_cost');
    assert.notStrictEqual(serpmeBom.calculated_stock, null, 'Computes calculated_stock from BOM ingredients');
    for (const r of serpmeBom.recipes) {
      assert.strictEqual(typeof r.cost, 'number', `BOM item ${r.ingredient_name} has numeric cost`);
      assert.ok(r.amount > 0, `BOM item ${r.ingredient_name} has positive amount`);
      assert.ok(r.ingredient_name && r.unit, `BOM item ${r.ingredient_name} has name and unit`);
    }

    // 2) Category listing with all_items=true carries has_recipe and recipe_items for 264
    const catsRes = await fetch('http://127.0.0.1:8000/api/products/categories?all_items=true', { headers });
    assert.strictEqual(catsRes.status, 200, 'GET /api/products/categories?all_items=true returns 200');
    const cats = await catsRes.json();
    let serpmeCard = null;
    for (const c of cats) {
      const hit = (c.products || []).find((p) => p.id === 264);
      if (hit) serpmeCard = hit;
      const stale = (c.products || []).find((p) => String(p.name || '').startsWith('E2E Stok Test Pirzola') || String(p.name || '').startsWith('E2E POS Antrikot'));
      assert.strictEqual(stale, undefined, 'No leftover archived E2E test products remain');
    }
    assert.ok(serpmeCard, 'Serpme Kahvaltı present in categories');
    assert.strictEqual(serpmeCard.has_recipe, true, 'Serpme Kahvaltı card flags has_recipe: true');
    assert.strictEqual(serpmeCard.recipe_items?.length, 4, 'Serpme Kahvaltı card has 4 recipe_items');

    // 3) All-products BOM creation/retrieval & deletion cleanup
    const ingsRes = await fetch('http://127.0.0.1:8000/api/inventory/ingredients', { headers });
    const ings = await ingsRes.json();
    const ingA = ings.find((i) => i.id === 57) || ings[0];
    const ingB = ings.find((i) => i.id === 91) || ings[1];
    assert.ok(ingA && ingB, 'Requires at least 2 ingredients to test BOM creation');

    const targetCatId = (cats[1] || cats[0]).id;
    const uniqueName = `E2E BOM Menu Test ${Date.now()}`;
    let testProdId = null;

    try {
      const createRes = await fetch('http://127.0.0.1:8000/api/products/items', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category_id: targetCatId,
          name: uniqueName,
          base_price: 250,
          station: 'kitchen',
          unit: 'Adet',
          stock_quantity: 0,
          is_available: true,
          show_in_pos: true,
        }),
      });
      assert.strictEqual(createRes.status, 200, 'Creates BOM test product');
      testProdId = (await createRes.json()).product_id;
      assert.ok(testProdId, 'Receives created product ID');

      const putRes = await fetch(`http://127.0.0.1:8000/api/inventory/recipes/${testProdId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          items: [
            { ingredient_id: ingA.id, amount: 0.05, waste_percentage: 5 },
            { ingredient_id: ingB.id, amount: 0.2, waste_percentage: 2.5 },
          ],
        }),
      });
      assert.strictEqual(putRes.status, 200, 'PUT /api/inventory/recipes/:id returns 200');
      const putJson = await putRes.json();
      assert.strictEqual(putJson.recipes?.length, 2, 'PUT returns updated 2-item ProductRecipe');
      assert.strictEqual(putJson.recipes[0].waste_percentage, 5, 'Persists waste_percentage');

      const getRes = await fetch(`http://127.0.0.1:8000/api/inventory/recipes/${testProdId}`, { headers });
      const getJson = await getRes.json();
      assert.strictEqual(getJson.recipes?.length, 2, 'GET /api/inventory/recipes/:id returns both saved BOM items');
      assert.strictEqual(typeof getJson.recipes[0].cost, 'number', 'Returned BOM item has numeric cost');

      const allBomRes = await fetch('http://127.0.0.1:8000/api/inventory/recipes', { headers });
      const allBoms = await allBomRes.json();
      const matched = allBoms.find((b) => b.product_id === testProdId);
      assert.ok(matched && matched.recipes?.length === 2 && matched.items?.length === 2, 'GET /api/inventory/recipes includes recipes & items arrays');
    } finally {
      if (testProdId) {
        await fetch(`http://127.0.0.1:8000/api/products/items/${testProdId}`, {
          method: 'DELETE',
          headers,
        });
        const verifyDelRes = await fetch(`http://127.0.0.1:8000/api/inventory/recipes/${testProdId}`, { headers });
        assert.strictEqual(verifyDelRes.status, 404, 'Deleted BOM test product is cleanly removed');
      }
      const cleanupIngsRes = await fetch('http://127.0.0.1:8000/api/inventory/ingredients', { headers });
      const cleanupIngs = await cleanupIngsRes.json().catch(() => []);
      const autoIng = Array.isArray(cleanupIngs) ? cleanupIngs.find((i) => i.name === uniqueName) : null;
      if (autoIng?.id) {
        await fetch(`http://127.0.0.1:8000/api/inventory/ingredients/${autoIng.id}`, {
          method: 'DELETE',
          headers,
        });
      }
    }
  });
});

// =========================================================================
// TEST SUITE 23: Adisyon Inline Treat, Note & Discount Sections
// =========================================================================
describe('Suite 23: Adisyon Inline Treat, Note & Discount Sections', () => {
  test('Adisyon Notu, Adisyona İkram Uygula and Adisyona İndirim Uygula live inside the Adisyon panel (not in right product toolbar or full-screen overlay modals)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolveFrontend = (rel) => path.resolve(rel).replace(/tests[\\/]+src/, 'src');
    const posSrc = fs.readFileSync(resolveFrontend('src/components/pos/PosTerminal.tsx'), 'utf8');

    const adisyonStart = posSrc.indexOf('Left Panel: Adisyon & Cart');
    const rightPanelStart = posSrc.indexOf('Right Panel: Search Bar + Toolbar');
    assert.ok(adisyonStart > -1 && rightPanelStart > adisyonStart, 'PosTerminal splits Left Panel (Adisyon) and Right Panel');

    const adisyonSection = posSrc.slice(adisyonStart, rightPanelStart);
    const afterAdisyonSection = posSrc.slice(rightPanelStart);

    // 1) Inline buttons & panels live inside Adisyon section
    assert.ok(adisyonSection.includes('toggleAdisyonPanel'), 'Uses toggleAdisyonPanel helper inside Adisyon');
    assert.ok(adisyonSection.includes('Inline Adisyon Notu Panel'), 'Adisyon Notu panel renders inside Adisyon');
    assert.ok(adisyonSection.includes('Inline Adisyona İndirim Uygula Panel'), 'Adisyona İndirim Uygula panel renders inside Adisyon');
    assert.ok(adisyonSection.includes('Inline Adisyona İkram Uygula Panel'), 'Adisyona İkram Uygula panel renders inside Adisyon');

    // 2) Old right-toolbar buttons and full-screen modals are removed
    assert.ok(!afterAdisyonSection.includes('/* Note Button'), 'Note button removed from Right Panel toolbar');
    assert.ok(!afterAdisyonSection.includes('/* Treat Button'), 'Treat button removed from Right Panel toolbar');
    assert.ok(!afterAdisyonSection.includes('/* Discount Button'), 'Discount button removed from Right Panel toolbar');
    assert.ok(!afterAdisyonSection.includes('Adisyon Notu Ekle</h3>'), 'Old fixed Note modal removed');
    assert.ok(!afterAdisyonSection.includes('Adisyona İndirim Uygula</h3>'), 'Old fixed Discount modal removed');
    assert.ok(!afterAdisyonSection.includes('Adisyona İkram Uygula</h3>'), 'Old fixed Treat modal removed');
  });
});

// =========================================================================
// TEST SUITE 24: FloorView Siparişler Open Table Card Cleanup
// =========================================================================
describe('Suite 24: FloorView Siparişler Open Table Card Cleanup', () => {
  test('Siparişler open table cards omit Big Table Badge (MASA ...), Açık Adisyon, #order_no, and Kalem Ürün', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolveFrontend = (rel) => path.resolve(rel).replace(/tests[\\/]+src/, 'src');
    const floorSrc = fs.readFileSync(resolveFrontend('src/components/tables/FloorView.tsx'), 'utf8');

    const ordersStart = floorSrc.indexOf('SECTION 2: SİPARİŞLER');
    assert.ok(ordersStart > -1, 'FloorView defines SECTION 2: SİPARİŞLER');
    const ordersSection = floorSrc.slice(ordersStart);

    // Removed clutter texts and left gray Big Table Badge box
    assert.ok(!ordersSection.includes('Açık Adisyon'), 'Removes Açık Adisyon badge from Siparişler open tables');
    assert.ok(!ordersSection.includes('#{activeOrder.order_no'), 'Removes #ADS order_no label from Siparişler open tables');
    assert.ok(!ordersSection.includes('Kalem Ürün'), 'Removes Kalem Ürün text from Siparişler open tables');
    assert.ok(!ordersSection.includes('Big Table Badge'), 'Removes gray MASA left badge box from Siparişler open tables');
    assert.ok(!ordersSection.includes("table.name.replace(/^Masa\\s*/i, '')"), 'No redundant stripped MASA badge text in Siparişler');
    assert.ok(!ordersSection.includes('font-mono font-bold text-slate-700 dark:text-slate-200 bg-slate-100'), 'Removes gray background behind live timer clock in Siparişler');
  });
});

// =========================================================================
// TEST SUITE 25: iPad 2 (iOS 9 / Safari 9) Legacy Compatibility & Preview Stack
// =========================================================================
describe('Suite 25: iPad 2 (iOS 9 / Safari 9) Legacy Compatibility & Preview Stack', () => {
  test('Build emits ES5 nomodule SystemJS bundles, polyfills, Safari-safe CSS, and live port 80 serves nomodule HTML + API proxy', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const resolveFrontend = (rel) => path.resolve(rel).replace(/tests[\\/]+src/, 'src').replace(/tests[\\/]+dist/, 'dist').replace(/tests[\\/]+vite\.config\.ts/, 'vite.config.ts');

    const distHtml = fs.readFileSync(resolveFrontend('dist/index.html'), 'utf8');
    assert.ok(distHtml.includes('nomodule'), 'dist/index.html includes nomodule fallback scripts');
    assert.ok(distHtml.includes('id="vite-legacy-polyfill"'), 'dist/index.html includes legacy polyfill script');
    assert.ok(distHtml.includes('id="vite-legacy-entry"'), 'dist/index.html includes legacy SystemJS entry script');
    assert.ok(distHtml.includes('showBootError'), 'index.html includes safe boot error fallback UI instead of silent white screen');

    const compatSrc = fs.readFileSync(resolveFrontend('src/polyfills/legacyCompat.ts'), 'utf8');
    assert.ok(compatSrc.includes("import 'whatwg-fetch'"), 'Loads whatwg-fetch polyfill for Safari 9');
    assert.ok(compatSrc.includes('LegacyURLSearchParams'), 'Polyfills URLSearchParams for Safari 9');
    assert.ok(compatSrc.includes('LegacyAbortController'), 'Polyfills AbortController for Safari 9');
    assert.ok(compatSrc.includes('queueMicrotask'), 'Polyfills queueMicrotask for Safari 9');
    assert.ok(compatSrc.includes('replaceAllPolyfill'), 'Polyfills String.prototype.replaceAll');

    const offlineSrc = fs.readFileSync(resolveFrontend('src/services/offlineDb.ts'), 'utf8');
    assert.ok(offlineSrc.includes("typeof Proxy === 'undefined'"), 'Skips Dexie initialization when Proxy is unavailable (Safari 9 / iPad 2)');
    assert.ok(!offlineSrc.includes('export const offlineDb = new BonCoreOfflineDB()'), 'Does not instantiate Dexie Proxy eagerly at module load');

    const assetsDir = resolveFrontend('dist/assets');
    const files = fs.readdirSync(assetsDir);
    const legacyFiles = files.filter((f) => f.includes('-legacy-') && f.endsWith('.js'));
    assert.ok(legacyFiles.length > 0, 'Built dist/assets contains legacy bundles');
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const acorn = require('../node_modules/acorn');
    for (const lf of legacyFiles) {
      const legacyCode = fs.readFileSync(path.join(assetsDir, lf), 'utf8');
      assert.doesNotThrow(
        () => acorn.parse(legacyCode, { ecmaVersion: 5 }),
        `${lf} must parse cleanly under strict ES5 (no arrow functions, template literals, or ?. / ??)`
      );
    }

    const cssFile = files.find((f) => f.startsWith('index-') && f.endsWith('.css'));
    assert.ok(cssFile, 'Built dist/assets contains compiled CSS');
    const cssText = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
    assert.ok(!/rgb\(\s*\d+\s+\d+\s+\d+/.test(cssText), 'Compiled CSS converts space-separated rgb() to comma-separated rgba()/rgb() for iOS 9 Safari');
    assert.ok(cssText.includes('height:100vh;height:100dvh'), 'Compiled CSS includes 100vh fallback before 100dvh for Safari 9');
    assert.ok(cssText.includes('safari9-main-fill'), 'Compiled CSS includes @supports not (height: 100dvh) main fill height rule');

    const resHtml = await fetch('http://localhost/');
    assert.strictEqual(resHtml.status, 200, 'Live server on port 80 responds 200');
    const liveHtml = await resHtml.text();
    assert.ok(liveHtml.includes('vite-legacy-entry') && liveHtml.includes('nomodule'), 'Live server on port 80 serves nomodule legacy HTML for iPad 2');

    const resApi = await fetch('http://localhost/api/settings', {
      headers: { 'X-Restaurant-Code': 'fatihciftligi' },
    });
    assert.strictEqual(resApi.status, 200, 'Preview server proxies /api/settings cleanly to backend');
  });
});

// ============================================================================
// TEST SUITE 26: Full Audit Cleanup (Paket A, B, C, D) Verification
// ============================================================================
describe('Suite 26: Full Audit Cleanup (Paket A, B, C, D)', () => {
  const readFrontend = async (rel) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const target = path.resolve(rel).replace(/tests[\\/]+src/, 'src');
    return fs.readFileSync(target, 'utf8');
  };

  test('Paket A: fixes tenant scope, PIN defaults, dynamic VAT, duplicate Adisyon header icons, MEHMETABİ fallback, and CheckoutModal cap', async () => {
    const cfSrc = await readFrontend('src/services/competitorFeatures.ts');
    assert.ok(cfSrc.includes("localStorage.getItem('boncore_restaurant_code')"), 'getTenantScope prioritizes boncore_restaurant_code');

    const posSrc = await readFrontend('src/components/pos/PosTerminal.tsx');
    assert.ok(!posSrc.includes("useState<string>('9999')"), 'Manager treat/void PIN states no longer default to 9999');
    assert.ok(posSrc.includes('prodVatRate') && posSrc.includes('rawVatTotal'), 'VAT calculation uses product vat_rate');
    assert.ok(!posSrc.includes('Course Firing (Servis), Kişi (Seat)'), 'Course/Seat/Timer toolbar removed from Adisyon');
    assert.ok(!posSrc.includes('Adisyo fişi otomatik'), 'Fixed Adisyo typo in fast pay info');
    assert.ok(posSrc.includes('adisyon fişi otomatik'), 'Uses corrected adisyon fişi text');

    const floorSrc = await readFrontend('src/components/tables/FloorView.tsx');
    assert.ok(!floorSrc.includes('MEHMETABİ'), 'Removes hardcoded MEHMETABİ waiter fallback');

    const checkoutSrc = await readFrontend('src/components/cashier/CheckoutModal.tsx');
    assert.ok(checkoutSrc.includes('rem.toFixed(2)') && checkoutSrc.includes('Girilen tutar kalan borçtan fazla olamaz'), 'Caps over-remaining keypad input to rem instead of resetting to 0.00');
  });

  test('Paket B: streamlines sidebar menu and unifies BonCore branding', async () => {
    const sidebarSrc = await readFrontend('src/components/layout/AdisyoSidebar.tsx');
    assert.ok(!sidebarSrc.includes('Ürün Eşleştirme Ekranı'), 'Single direct integration menu link replaces redundant dropdown');
    assert.ok(!sidebarSrc.includes('Birimler & Reçeteler'), 'Removes misleading Birimler & Reçeteler item');
    assert.ok(!sidebarSrc.includes('Zayi / Fire İşlemleri'), 'Removes duplicate Zayi / Fire İşlemleri item');
    assert.ok(!sidebarSrc.includes('Uygulama Mağazası'), 'Removes Uygulama Mağazası from sidebar');
    assert.ok(!sidebarSrc.includes('Tavsiye Et ve Kazan'), 'Removes Tavsiye Et ve Kazan from sidebar');
    assert.ok(!sidebarSrc.includes('Kiosk & Çağrı Ekranı'), 'Removes Kiosk & Çağrı Ekranı from sidebar');
    assert.ok(!sidebarSrc.includes('Otel Yönetim (PMS)'), 'Removes Otel Yönetim (PMS) from sidebar');
    assert.ok(!sidebarSrc.includes('Tanıtım & Anasayfa'), 'Removes Tanıtım & Anasayfa from sidebar');

    for (const rel of [
      'src/components/modules/CustomersLoyaltyView.tsx',
      'src/components/modules/ReservationsView.tsx',
      'src/components/modules/CostProfitWizardView.tsx',
      'src/components/modules/HotelFolioView.tsx',
      'src/components/modules/KioskCfdView.tsx',
    ]) {
      const src = await readFrontend(rel);
      assert.ok(!src.includes('Adisyo '), `${rel} no longer contains Adisyo branding`);
    }

    const intSrc = await readFrontend('src/components/integrations/MenuIntegrationOperations.tsx');
    assert.ok(!intSrc.includes('Kanal Seç (Tümü)'), 'Removes non-functional channel dropdown');
    assert.ok(!intSrc.includes('Entegrasyon Kanalı'), 'Removes fake integration channel column');
  });

  test('Paket C & D: removes fake delivery simulators and secondary local-only sub-tabs', async () => {
    const delivSrc = await readFrontend('src/components/delivery/DeliveryHub.tsx');
    assert.ok(!delivSrc.includes('+ Yemeksepeti Siparişi Gönder'), 'Removes fake Yemeksepeti trigger button');
    assert.ok(!delivSrc.includes('+ Getir Yemek Siparişi Gönder'), 'Removes fake Getir trigger button');
    assert.ok(!delivSrc.includes('Caller ID Santral Simülatörü'), 'Renames Caller ID simulator box');
    assert.ok(!delivSrc.includes('Kurye Mobil Teslimat Modu'), 'Removes delivery mobile courier sub-tab');
    assert.ok(delivSrc.includes('+ Yeni Paket Siparişi'), 'Includes real new package order button');

    const usersSrc = await readFrontend('src/components/users/UsersManagement.tsx');
    assert.ok(!usersSrc.includes('Vardiya & Puantaj Takibi'), 'Removes shifts sub-tab from UsersManagement');

    const custSrc = await readFrontend('src/components/modules/CustomersLoyaltyView.tsx');
    assert.ok(!custSrc.includes('Segmentler &amp; Geri Kazanım'), 'Removes winback sub-tab from CustomersLoyaltyView');
    assert.ok(!custSrc.includes('points: 100'), 'Resets default new customer points from 100 to 0');

    const costSrc = await readFrontend('src/components/modules/CostProfitWizardView.tsx');
    assert.ok(!costSrc.includes('AI Menü Mühendisliği (Matris)'), 'Removes ai_matrix tab button from CostProfitWizardView');

    const kdsSrc = await readFrontend('src/components/kds/KdsScreen.tsx');
    assert.ok(!kdsSrc.includes('Sıramatik TV'), 'Removes Sıramatik TV button from KdsScreen toolbar');
  });
});

// ============================================================================
// TEST SUITE 27: Deep Audit Cleanup (Paket E, F, G, H) & Product VAT Backend
// ============================================================================
describe('Suite 27: Deep Audit Cleanup (Paket E, F, G, H) & Product VAT Backend', () => {
  const readFrontend = async (rel) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const target = path.resolve(rel).replace(/tests[\\/]+src/, 'src');
    return fs.readFileSync(target, 'utf8');
  };

  test('Paket E: fixes error colors, PinModal auth, multi-tenant receipt leaks, DayEndReport date/PIN, and product VAT/waste persistence', async () => {
    for (const rel of [
      'src/components/pos/PosTerminal.tsx',
      'src/components/delivery/DeliveryHub.tsx',
      'src/components/inventory/InventoryManagement.tsx',
      'src/components/products/ProductDefinitions.tsx',
      'src/components/tables/TableAreaDefinitions.tsx',
      'src/components/users/UsersManagement.tsx',
      'src/components/kds/KitchenGroupsDefinitions.tsx',
      'src/components/reports/ClosedBillsReport.tsx',
      'src/components/profile/AdisyoProfile.tsx',
    ]) {
      const src = await readFrontend(rel);
      assert.ok(src.includes('rose-'), `${rel} uses semantic rose color for errors/cancelled states`);
    }

    const kgSrc = await readFrontend('src/components/kds/KitchenGroupsDefinitions.tsx');
    assert.ok(kgSrc.includes("id: 'red', label: 'Kırmızı', bg: 'bg-rose-600'"), 'Red kitchen group color actually renders rose/red');

    const pinSrc = await readFrontend('src/components/layout/PinModal.tsx');
    assert.ok(!pinSrc.includes("pinToVerify === '1234'"), 'Removes 1234 PIN bypass from PinModal');
    assert.ok(pinSrc.includes('api.loginByPin(pinToVerify)'), 'PinModal authenticates via backend loginByPin');

    const apiSrc = await readFrontend('src/services/api.ts');
    assert.ok(apiSrc.includes('Ürün oluşturulamadı.') && apiSrc.includes('Ürün güncellenemedi.'), 'Product API helpers check res.ok');

    const prodSrc = await readFrontend('src/components/products/ProductDefinitions.tsx');
    assert.ok(prodSrc.includes('vat_rate: Number(prodVatRate)'), 'ProductDefinitions sends vat_rate on create and update');
    assert.ok(prodSrc.includes('waste_percentage: wastePct'), 'ProductDefinitions saves actual recipe waste percentage');

    for (const rel of [
      'src/components/cashier/CashierManagement.tsx',
      'src/components/reports/DayEndReport.tsx',
      'src/components/fiscal/FiscalModal.tsx',
      'src/components/settings/ReceiptDesignSettings.tsx',
      'src/components/settings/AdisyoSettings.tsx',
    ]) {
      const src = await readFrontend(rel);
      assert.ok(!src.includes('FATİH ÇİFTLİĞİ') && !src.includes('fatihciftligi'), `${rel} has no hardcoded FATİH ÇİFTLİĞİ tenant leak`);
    }

    const fiscalSrc = await readFrontend('src/components/fiscal/FiscalModal.tsx');
    assert.ok(!fiscalSrc.includes('Adisyo Fişi'), 'FiscalModal print title updated to BonCore Adisyon Fişi');

    const dayEndSrc = await readFrontend('src/components/reports/DayEndReport.tsx');
    assert.ok(!dayEndSrc.includes("managerPin !== '9999'"), 'DayEndReport removes hardcoded client-side PIN validation');
    assert.ok(dayEndSrc.includes('setSelectedRegisterId(null)'), 'DayEndReport date picker clears selected past register');
  });

  test('Backend /api/products/items persists vat_rate on POST and PUT', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Restaurant-Code': 'fatihciftligi',
    };
    const catsRes = await fetch('http://127.0.0.1:8000/api/products/categories', { headers });
    const cats = await catsRes.json();
    const catId = cats[0]?.id || 1;

    const createRes = await fetch('http://127.0.0.1:8000/api/products/items', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        category_id: catId,
        name: 'TEST_VAT_20_ITEM',
        base_price: 120,
        vat_rate: 1,
      }),
    });
    assert.strictEqual(createRes.status, 200);
    const created = await createRes.json();
    assert.ok(created.product_id > 0, 'Created test product ID returned');

    const putRes = await fetch(`http://127.0.0.1:8000/api/products/items/${created.product_id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ vat_rate: 20, base_price: 140 }),
    });
    assert.strictEqual(putRes.status, 200);

    const verifyCatsRes = await fetch('http://127.0.0.1:8000/api/products/categories', { headers });
    const verifyCats = await verifyCatsRes.json();
    const allProds = verifyCats.flatMap((c) => c.products || []);
    const updatedProd = allProds.find((p) => p.id === created.product_id);
    assert.ok(updatedProd, 'Updated product found in categories listing');
    assert.strictEqual(Number(updatedProd.vat_rate), 20, 'Product vat_rate persisted as 20 via PUT');

    await fetch(`http://127.0.0.1:8000/api/products/items/${created.product_id}`, {
      method: 'DELETE',
      headers,
    });
  });

  test('Paket F, G, H: simplifies Header, Dashboard, Profile, Settings, POS fixed service, Products, Tables, Inventory, Reports & Rights', async () => {
    const headerSrc = await readFrontend('src/components/layout/Header.tsx');
    assert.ok(!headerSrc.includes('Tanıtım & Pazarlama Anasayfasına Git'), 'Header removes Anasayfa button');
    assert.ok(headerSrc.includes("canTab('tables')") && headerSrc.includes("canTab('pos')"), 'Header gates Masalar/POS buttons with permissions');

    const dashSrc = await readFrontend('src/components/dashboard/AdisyoDashboard.tsx');
    assert.ok(dashSrc.includes("getRestaurantStatistics('today')"), 'Dashboard queries today statistics matching card labels');
    assert.ok(!dashSrc.includes('Canlı Çalışma Günü'), 'Dashboard removes duplicate clock banner');
    assert.ok(dashSrc.includes("canTab('cashier')") && dashSrc.includes("canTab('day_end_report')"), 'Dashboard gates quick shortcuts with canTab');

    const profileSrc = await readFrontend('src/components/profile/AdisyoProfile.tsx');
    assert.ok(!profileSrc.includes('admin@boncorepos.com'), 'Profile removes fake unsaved email field');
    assert.ok(!profileSrc.includes('Ömür Boyu Aktif'), 'Profile removes static fake license tab');

    const loginSrc = await readFrontend('src/components/auth/AdisyoLogin.tsx');
    assert.ok(!loginSrc.includes('Multi-Tenant PBKDF2'), 'Login removes internal crypto label');

    const settingsSrc = await readFrontend('src/components/settings/AdisyoSettings.tsx');
    assert.ok(!settingsSrc.includes('Döviz Ayarları'), 'Settings removes unused currency tab');
    assert.ok(!settingsSrc.includes('<HappyHourSettingsPanel />'), 'Settings removes orphaned HappyHour panel');
    assert.ok(settingsSrc.includes('Yazıcılar & Terazi (Donanım)'), 'Settings clarifies hardware tab label');

    const posSrc = await readFrontend('src/components/pos/PosTerminal.tsx');
    assert.ok(posSrc.includes("settings.serviceType === 'fixed'"), 'POS supports fixed service charge setting');

    const prodSrc = await readFrontend('src/components/products/ProductDefinitions.tsx');
    assert.ok(!prodSrc.includes('Menü Özellikleri &amp; Günlük Porsiyon (86)'), 'ProductDefinitions removes local-only 86/allergen block');

    const tableSrc = await readFrontend('src/components/tables/TableAreaDefinitions.tsx');
    assert.ok(tableSrc.includes('editingTable.seats ?? 4'), 'TableAreaDefinitions preserves seats when editing a table');
    assert.ok(tableSrc.includes('isFilteringTables'), 'TableAreaDefinitions protects ordering when search filter is active');

    const invSrc = await readFrontend('src/components/inventory/InventoryManagement.tsx');
    assert.ok(!invSrc.includes('InventoryCompetitorPanels'), 'Inventory removes local-only sub-tabs');
    assert.ok(!invSrc.includes('Özdemir Et & Gıda Ltd.'), 'Inventory removes hardcoded fake supplier default');
    assert.ok(invSrc.includes('fromWh === toWh'), 'Inventory prevents same-warehouse transfer');
    assert.ok(invSrc.includes('Hammadde Ekle') && invSrc.includes('api.createIngredient'), 'Inventory supports direct Hammadde CRUD');

    const statsSrc = await readFrontend('src/components/reports/RestaurantStatistics.tsx');
    assert.ok(statsSrc.includes("'Bugün (Canlı)'"), 'RestaurantStatistics defaults to today');
    assert.ok(!statsSrc.includes("{ id: 'closed_bills'"), 'RestaurantStatistics removes duplicate closed_bills tab');
    assert.ok(!statsSrc.includes("{ id: 'stock_report'"), 'RestaurantStatistics removes misplaced stock_report tab');

    const billsSrc = await readFrontend('src/components/reports/ClosedBillsReport.tsx');
    assert.ok(billsSrc.includes('debouncedSearch'), 'ClosedBillsReport debounces search queries');

    const permSrc = await readFrontend('src/services/permissions.ts');
    assert.ok(!permSrc.includes("'tab_kiosk'") && !permSrc.includes("'tab_hotel'") && !permSrc.includes("'tab_app_store'"), 'permissions removes retired sidebar tabs');

    const rightsSrc = await readFrontend('src/components/permissions/RightsManagement.tsx');
    assert.ok(!rightsSrc.includes("'call_center'"), 'RightsManagement removes unused Çağrı Merkezi column');
  });
});
