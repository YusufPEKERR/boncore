import Dexie, { type Table as DexieTable } from 'dexie';
import { Area, Category } from '../types';

export interface QueuedOfflineOrder {
  id?: number;
  idempotency_key?: string;
  tenant_code?: string;
  table_id: number | null;
  order_type: string;
  items: any[];
  waiter_name: string;
  notes?: string;
  service_charge?: number;
  created_at: string;
  is_synced: boolean;
  failed_permanent?: boolean;
  last_error?: string;
}

export interface QueuedOfflinePayment {
  id?: number;
  idempotency_key?: string;
  tenant_code?: string;
  order_id: number;
  payments: any[];
  rounding: number;
  cashier_name: string;
  close_table?: boolean;
  created_at: string;
  is_synced: boolean;
  failed_permanent?: boolean;
  last_error?: string;
}

function getActiveTenantCode(): string {
  try {
    return (localStorage.getItem('boncore_restaurant_code') || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

class BonCoreOfflineDB extends Dexie {
  cachedAreas!: DexieTable<Area, number>;
  cachedCategories!: DexieTable<Category, number>;
  offlineOrdersQueue!: DexieTable<QueuedOfflineOrder, number>;
  offlinePaymentsQueue!: DexieTable<QueuedOfflinePayment, number>;

  constructor() {
    super('BonCorePOS_OfflineDB');
    this.version(1).stores({
      cachedAreas: 'id, name',
      cachedCategories: 'id, name',
      offlineOrdersQueue: '++id, table_id, is_synced',
      offlinePaymentsQueue: '++id, order_id, is_synced',
    });
    this.version(2).stores({
      cachedAreas: 'id, name',
      cachedCategories: 'id, name',
      offlineOrdersQueue: '++id, tenant_code, table_id, is_synced',
      offlinePaymentsQueue: '++id, tenant_code, order_id, is_synced',
    });
  }
}

let _offlineDb: BonCoreOfflineDB | null = null;
let _offlineDbDisabled = false;

/**
 * Lazily initializes Dexie IndexedDB only on browsers that support Proxy + IndexedDB.
 * Prevents iPad 2 (iOS 9 Safari 9, which lacks Proxy) from throwing ReferenceError at boot.
 */
export function getOfflineDb(): BonCoreOfflineDB | null {
  if (_offlineDbDisabled) return null;
  if (_offlineDb) return _offlineDb;
  try {
    if (
      typeof window === 'undefined' ||
      typeof indexedDB === 'undefined' ||
      typeof Proxy === 'undefined'
    ) {
      _offlineDbDisabled = true;
      return null;
    }
    _offlineDb = new BonCoreOfflineDB();
    return _offlineDb;
  } catch (e) {
    _offlineDbDisabled = true;
    console.warn('[OfflineDB] Disabled on this browser:', e);
    return null;
  }
}

export async function getCachedAreasFromOffline(): Promise<Area[]> {
  try {
    const db = getOfflineDb();
    if (!db) return [];
    return await db.cachedAreas.toArray();
  } catch {
    return [];
  }
}

export async function getCachedCategoriesFromOffline(): Promise<Category[]> {
  try {
    const db = getOfflineDb();
    if (!db) return [];
    return await db.cachedCategories.toArray();
  } catch {
    return [];
  }
}

export async function clearOfflineCache() {
  try {
    const db = getOfflineDb();
    if (!db) return;
    await db.cachedAreas.clear();
    await db.cachedCategories.clear();
  } catch (e) {
    console.warn('Failed to clear offline cache', e);
  }
}

export async function saveAreasToOfflineCache(areas: Area[]) {
  try {
    const db = getOfflineDb();
    if (!db) return;
    await db.cachedAreas.clear();
    await db.cachedAreas.bulkPut(areas);
  } catch (e) {
    console.warn('Failed to cache areas to IndexedDB', e);
  }
}

export async function saveCategoriesToOfflineCache(cats: Category[]) {
  try {
    const db = getOfflineDb();
    if (!db) return;
    await db.cachedCategories.clear();
    await db.cachedCategories.bulkPut(cats);
  } catch (e) {
    console.warn('Failed to cache categories to IndexedDB', e);
  }
}

function generateOfflineKey(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {}
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function queueOfflineOrder(payload: any): Promise<number | null> {
  const db = getOfflineDb();
  if (!db) return null;
  const id = await db.offlineOrdersQueue.add({
    ...payload,
    idempotency_key: payload?.idempotency_key || generateOfflineKey('ord'),
    tenant_code: payload?.tenant_code || getActiveTenantCode(),
    created_at: new Date().toISOString(),
    is_synced: false
  });
  return typeof id === 'number' ? id : Number(id);
}

export async function queueOfflinePayment(payload: any): Promise<number | null> {
  const db = getOfflineDb();
  if (!db) return null;
  const id = await db.offlinePaymentsQueue.add({
    ...payload,
    idempotency_key: payload?.idempotency_key || generateOfflineKey('pay'),
    tenant_code: payload?.tenant_code || getActiveTenantCode(),
    created_at: new Date().toISOString(),
    is_synced: false
  });
  return typeof id === 'number' ? id : Number(id);
}

function buildReplayHeaders(tenantCode: string, idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = localStorage.getItem('boncore_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (tenantCode) headers['X-Restaurant-Code'] = tenantCode;
    if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  } catch {}
  return headers;
}

function isPermanent4xx(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

let _syncInFlight: Promise<{ syncedOrders: number; syncedPayments: number }> | null = null;

export async function syncOfflineQueue(): Promise<{ syncedOrders: number; syncedPayments: number }> {
  if (_syncInFlight) {
    return _syncInFlight;
  }
  _syncInFlight = runOfflineSync().finally(() => {
    _syncInFlight = null;
  });
  return _syncInFlight;
}

async function runOfflineSync(): Promise<{ syncedOrders: number; syncedPayments: number }> {
  let syncedOrders = 0;
  let syncedPayments = 0;
  const activeTenant = getActiveTenantCode();

  try {
    const db = getOfflineDb();
    if (!db) return { syncedOrders, syncedPayments };

    const pendingOrders = await db.offlineOrdersQueue.toArray();
    for (const ord of pendingOrders) {
      if (ord.tenant_code && activeTenant && ord.tenant_code !== activeTenant) {
        continue;
      }
      if (!ord.is_synced && !ord.failed_permanent && ord.id) {
        try {
          const replayTenant = ord.tenant_code || activeTenant;
          const res = await fetch('/api/orders/create', {
            method: 'POST',
            headers: buildReplayHeaders(replayTenant, ord.idempotency_key),
            body: JSON.stringify({
              table_id: ord.table_id,
              order_type: ord.order_type,
              items: ord.items,
              waiter_name: ord.waiter_name,
              notes: ord.notes,
              service_charge: ord.service_charge
            })
          });
          if (res.ok) {
            const data = await res.json();
            const serverOrderId = data.order_id || data.id;
            if (serverOrderId && ord.id && ord.id !== serverOrderId) {
              const linkedPayments = await db.offlinePaymentsQueue.where('order_id').equals(ord.id).toArray();
              for (const lp of linkedPayments) {
                if (lp.id) {
                  await db.offlinePaymentsQueue.update(lp.id, { order_id: serverOrderId });
                }
              }
            }
            await db.offlineOrdersQueue.delete(ord.id);
            syncedOrders++;
          } else if (isPermanent4xx(res.status)) {
            const errBody = await res.text().catch(() => '');
            await db.offlineOrdersQueue.update(ord.id, {
              failed_permanent: true,
              last_error: `${res.status}: ${errBody.slice(0, 200)}`
            });
            console.warn('[OfflineDB] Dead-lettered permanent 4xx offline order:', ord.id, res.status);
          }
        } catch (e) {
          console.warn('[OfflineDB] Sync order failed, network may still be offline', e);
          break;
        }
      }
    }

    const pendingPayments = await db.offlinePaymentsQueue.toArray();
    for (const pay of pendingPayments) {
      if (pay.tenant_code && activeTenant && pay.tenant_code !== activeTenant) {
        continue;
      }
      if (!pay.is_synced && !pay.failed_permanent && pay.id) {
        try {
          const replayTenant = pay.tenant_code || activeTenant;
          const res = await fetch('/api/cashier/settle-payment', {
            method: 'POST',
            headers: buildReplayHeaders(replayTenant, pay.idempotency_key),
            body: JSON.stringify({
              order_id: pay.order_id,
              payments: pay.payments,
              rounding: pay.rounding,
              cashier_name: pay.cashier_name,
              close_table: pay.close_table ?? true
            })
          });
          if (res.ok) {
            await db.offlinePaymentsQueue.delete(pay.id);
            syncedPayments++;
          } else if (isPermanent4xx(res.status)) {
            const errBody = await res.text().catch(() => '');
            await db.offlinePaymentsQueue.update(pay.id, {
              failed_permanent: true,
              last_error: `${res.status}: ${errBody.slice(0, 200)}`
            });
            console.warn('[OfflineDB] Dead-lettered permanent 4xx offline payment:', pay.id, res.status);
          }
        } catch (e) {
          console.warn('[OfflineDB] Sync payment failed, network may still be offline', e);
          break;
        }
      }
    }
  } catch (err) {
    console.error('[OfflineDB] Offline queue sync error', err);
  }

  return { syncedOrders, syncedPayments };
}
