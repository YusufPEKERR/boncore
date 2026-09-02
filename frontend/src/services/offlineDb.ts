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
