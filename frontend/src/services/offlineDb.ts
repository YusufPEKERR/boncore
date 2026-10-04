import Dexie, { type Table as DexieTable } from 'dexie';
import { Area, Category, Order, OrderItem } from '../types';

export interface QueuedOfflineOrder {
  id?: number;
  table_id: number | null;
  order_type: string;
  items: any[];
  waiter_name: string;
  notes?: string;
  created_at: string;
  is_synced: boolean;
}

export interface QueuedOfflinePayment {
  id?: number;
  order_id: number;
  payments: any[];
  rounding: number;
  cashier_name: string;
  created_at: string;
  is_synced: boolean;
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
  }
}

export const offlineDb = new BonCoreOfflineDB();

export async function saveAreasToOfflineCache(areas: Area[]) {
  try {
    await offlineDb.cachedAreas.clear();
    await offlineDb.cachedAreas.bulkPut(areas);
  } catch (e) {
    console.warn('Failed to cache areas to IndexedDB', e);
  }
}

export async function saveCategoriesToOfflineCache(cats: Category[]) {
  try {
    await offlineDb.cachedCategories.clear();
    await offlineDb.cachedCategories.bulkPut(cats);
  } catch (e) {
    console.warn('Failed to cache categories to IndexedDB', e);
  }
}

export async function queueOfflineOrder(payload: any) {
  return await offlineDb.offlineOrdersQueue.add({
    ...payload,
    created_at: new Date().toISOString(),
    is_synced: false
  });
}

export async function queueOfflinePayment(payload: any) {
  return await offlineDb.offlinePaymentsQueue.add({
    ...payload,
    created_at: new Date().toISOString(),
    is_synced: false
  });
}

export async function syncOfflineQueue(): Promise<{ syncedOrders: number; syncedPayments: number }> {
  let syncedOrders = 0;
  let syncedPayments = 0;

  try {
    const pendingOrders = await offlineDb.offlineOrdersQueue.toArray();
    for (const ord of pendingOrders) {
      if (!ord.is_synced && ord.id) {
        try {
          const res = await fetch('/api/orders/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table_id: ord.table_id,
              order_type: ord.order_type,
              items: ord.items,
              waiter_name: ord.waiter_name,
              notes: ord.notes
            })
          });
          if (res.ok) {
            await offlineDb.offlineOrdersQueue.delete(ord.id);
            syncedOrders++;
          }
        } catch (e) {
          console.warn('[OfflineDB] Sync order failed, network may still be offline', e);
          break;
        }
      }
    }

    const pendingPayments = await offlineDb.offlinePaymentsQueue.toArray();
    for (const pay of pendingPayments) {
      if (!pay.is_synced && pay.id) {
        try {
          const res = await fetch('/api/cashier/settle-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: pay.order_id,
              payments: pay.payments,
              rounding: pay.rounding,
              cashier_name: pay.cashier_name,
              close_table: true
            })
          });
          if (res.ok) {
            await offlineDb.offlinePaymentsQueue.delete(pay.id);
            syncedPayments++;
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
