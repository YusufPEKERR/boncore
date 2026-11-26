/**
 * Real TypeScript module tests compiled on-the-fly with esbuild and executed via node:test.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

let tmpDir;
let csvMod;
let formatMod;
let permMod;
let compMod;
let printMod;

async function buildModule(relPath, outName) {
  const outfile = path.join(tmpDir, outName);
  await esbuild.build({
    entryPoints: [path.resolve(process.cwd(), relPath)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    outfile,
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

describe('BonCore Real Frontend Modules', () => {
  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boncore-fe-tests-'));
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
    globalThis.window = {
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };

    [csvMod, formatMod, permMod, compMod, printMod] = await Promise.all([
      buildModule('src/utils/csv.ts', 'csv.mjs'),
      buildModule('src/utils/format.ts', 'format.mjs'),
      buildModule('src/services/permissions.ts', 'permissions.mjs'),
      buildModule('src/services/competitorFeatures.ts', 'competitorFeatures.mjs'),
      buildModule('src/utils/printReceipt.ts', 'printReceipt.mjs'),
    ]);
  });

  after(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('escapeCsvCell neutralizes CSV formula injection and quotes special chars', () => {
    assert.equal(csvMod.escapeCsvCell('=CMD|"/C calc"!A0'), `"'=CMD|""/C calc""!A0"`);
    assert.equal(csvMod.escapeCsvCell('+1+1'), `"'+1+1"`);
    assert.equal(csvMod.escapeCsvCell('+1+1', false), `'+1+1`);
    assert.equal(csvMod.escapeCsvCell('-100'), `"'-100"`);
    assert.equal(csvMod.escapeCsvCell('-SUM(A1:A2)', false), `'-SUM(A1:A2)`);
    assert.equal(csvMod.escapeCsvCell('@SUM(1,2)', false), `"'@SUM(1,2)"`);
    assert.equal(csvMod.escapeCsvCell('Kahve, Latte', false), '"Kahve, Latte"');
  });

  test('format utils format Europe/Istanbul dates cleanly from naive UTC strings', () => {
    assert.equal(formatMod.getTRDateString(new Date('2026-11-25T22:30:00Z')), '2026-11-26');
    assert.equal(formatMod.formatTRDate('2026-11-25 22:30:00'), '26.11.2026');
    assert.equal(formatMod.formatTRTime('2026-11-25 22:30:00'), '01:30');
    const currency = formatMod.formatCurrencyTRY(1250.5);
    assert.ok(currency.includes('1.250,50'), `unexpected formatted TRY: ${currency}`);
  });

  test('normalizeRoleKey normalizes chef/şef -> kitchen and müdür -> manager', () => {
    assert.equal(permMod.normalizeRoleKey('chef'), 'kitchen');
    assert.equal(permMod.normalizeRoleKey('Şef'), 'kitchen');
    assert.equal(permMod.normalizeRoleKey('Müdür'), 'manager');
    assert.equal(permMod.normalizeRoleKey('Kasiyer'), 'cashier');

    const merged = permMod.mergeWithInitialPermissions([{ id: 'order_discount', roles: { waiter: true } }]);
    const disc = merged.find((p) => p.id === 'order_discount');
    assert.equal(disc.roles.waiter, true);
    assert.equal(disc.roles.manager, true);
  });

  test('competitorFeatures handles Happy Hour defaults (inactive) and time ranges', () => {
    assert.equal(compMod.isTimeWithinRange('15:30', '14:00', '17:00'), true);
    assert.equal(compMod.isTimeWithinRange('18:00', '14:00', '17:00'), false);
    assert.equal(compMod.isTimeWithinRange('01:30', '22:00', '03:00'), true);
    const rules = compMod.getHappyHourRules();
    assert.ok(Array.isArray(rules) && rules.length > 0);
    assert.equal(rules.every((r) => r.isActive === false), true);
  });

  test('printReceipt escapeHtml escapes HTML/script payloads', () => {
    const out = printMod.escapeHtml(`<script>alert("x&'y")</script>`);
    assert.equal(out, '&lt;script&gt;alert(&quot;x&amp;&#39;y&quot;)&lt;/script&gt;');
  });
});
