import { Area, Category, Product, Order, StaffUser, Ingredient, ProductRecipe, Courier, DeliveryOrder, AuditLog } from '../types';
import { offlineDb, saveAreasToOfflineCache, saveCategoriesToOfflineCache, queueOfflineOrder, queueOfflinePayment } from './offlineDb';

const API_BASE = '/api';

export const api = {
  // Auth & PIN
  async loginWithPin(pin: string): Promise<StaffUser> {
    const res = await fetch(`${API_BASE}/auth/login-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_code: pin })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Giriş başarısız.');
    }
    return res.json();
  },

  async getStaffList(): Promise<StaffUser[]> {
    const res = await fetch(`${API_BASE}/auth/staff`);
    return res.json();
  },

  // Tables & Floor
  async getAreas(): Promise<Area[]> {
    try {
      const res = await fetch(`${API_BASE}/tables/areas`);
      if (!res.ok) throw new Error('API error');
      const data: Area[] = await res.json();
      await saveAreasToOfflineCache(data);
      return data;
    } catch (err) {
      // Offline fallback
      const cached = await offlineDb.cachedAreas.toArray();
      if (cached.length > 0) return cached;
      throw err;
    }
  },

  async updateTablePositions(positions: any[]): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/layout/positions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(positions)
    });
    return res.json();
  },

  async moveTable(sourceId: number, targetId: number, operatorName: string): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_table_id: sourceId, target_table_id: targetId, operator_name: operatorName })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Masa taşınamadı.');
    return res.json();
  },

  async mergeTables(sourceId: number, targetId: number, operatorName: string): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_table_id: sourceId, target_table_id: targetId, operator_name: operatorName })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Masalar birleştirilemedi.');
    return res.json();
  },

  async transferItems(sourceId: number, targetId: number, itemIds: number[], operatorName: string): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/transfer-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_table_id: sourceId,
        target_table_id: targetId,
        order_item_ids: itemIds,
        operator_name: operatorName
      })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Ürünler aktarılamadı.');
    return res.json();
  },

  async updateKuver(tableId: number, kuverCount: number, operatorName: string): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/${tableId}/kuver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kuver_count: kuverCount, operator_name: operatorName })
    });
    return res.json();
  },

  async clearWaiterCall(tableId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/${tableId}/clear-call`, { method: 'POST' });
    return res.json();
  },

  async triggerWaiterCall(tableId: number, reason: string = 'Garson Çağır'): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/${tableId}/call-waiter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  },

  // Area & Table CRUD Operations
  async createArea(name: string, order_index: number = 0): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/areas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, order_index })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Bölge oluşturulamadı.');
    return res.json();
  },

  async updateArea(area_id: number, name: string, order_index?: number): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/areas/${area_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, order_index })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Bölge güncellenemedi.');
    return res.json();
  },

  async deleteArea(area_id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/areas/${area_id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Bölge silinemedi.');
    return res.json();
  },

  async createTable(payload: { area_id: number; name: string; seats?: number; shape?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Masa oluşturulamadı.');
    return res.json();
  },

  async updateTable(table_id: number, payload: { area_id: number; name: string; seats?: number; shape?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/single/${table_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Masa güncellenemedi.');
    return res.json();
  },

  async deleteTable(table_id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/single/${table_id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Masa silinemedi.');
    return res.json();
  },

  async bulkCreateTables(payload: { area_id: number; prefix?: string; start_num?: number; count: number; seats?: number; shape?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/bulk-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Toplu masa eklenemedi.');
    return res.json();
  },

  // Products & Menu
  async getCategories(): Promise<Category[]> {
    try {
      const res = await fetch(`${API_BASE}/products/categories`);
      if (!res.ok) throw new Error('API error');
      const data: Category[] = await res.json();
      await saveCategoriesToOfflineCache(data);
      return data;
    } catch (err) {
      const cached = await offlineDb.cachedCategories.toArray();
      if (cached.length > 0) return cached;
      throw err;
    }
  },

  async searchProducts(q: string): Promise<Product[]> {
    const res = await fetch(`${API_BASE}/products/search?q=${encodeURIComponent(q)}`);
    return res.json();
  },

  // Orders
  async getOrder(orderId: number): Promise<Order> {
    const res = await fetch(`${API_BASE}/orders/${orderId}`);
    if (!res.ok) throw new Error('Sipariş bulunamadı.');
    return res.json();
  },

  async createOrder(payload: any): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/orders/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Sipariş oluşturulamadı.');
      return res.json();
    } catch (err) {
      // Queue offline
      await queueOfflineOrder(payload);
      return { status: 'offline_queued', order_id: Date.now(), order_no: 'OFFLINE-' + Date.now() };
    }
  },

  async addItemsToOrder(orderId: number, items: any[], waiterName: string): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/add-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, waiter_name: waiterName })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Ürün eklenemedi.');
    return res.json();
  },

  async toggleHoldFire(itemIds: number[], action: 'fire' | 'hold'): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/hold-fire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_item_ids: itemIds, action })
    });
    return res.json();
  },

  async voidItem(itemId: number, reasonCode: string, reasonText: string, operatorName: string, managerPin?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/void-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_item_id: itemId,
        reason_code: reasonCode,
        reason_text: reasonText,
        operator_name: operatorName,
        manager_pin: managerPin
      })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Ürün iptal edilemedi.');
    return res.json();
  },

  async applyDiscount(orderId: number, discountType: 'percentage' | 'fixed', value: number, reason: string, operatorName: string, managerPin?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discount_type: discountType,
        value,
        reason,
        operator_name: operatorName,
        manager_pin: managerPin
      })
    });
    return res.json();
  },

  async applyTreat(orderId: number, itemIds: number[] | null, reason: string, operatorName: string, managerPin?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/treat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_item_ids: itemIds,
        reason,
        operator_name: operatorName,
        manager_pin: managerPin
      })
    });
    return res.json();
  },

  async calculateSplitEqual(orderId: number, personCount: number): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/split-equal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, person_count: personCount })
    });
    return res.json();
  },

  // Cashier & Payments
  async settlePayment(payload: any): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/cashier/settle-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Tahsilat başarısız.');
      return res.json();
    } catch (err) {
      await queueOfflinePayment(payload);
      return { status: 'offline_queued', is_fully_paid: true, remaining_total: 0.0 };
    }
  },

  async getActiveRegister(): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/active-register`);
    return res.json();
  },

  async createExpense(category: string, amount: number, type: 'out' | 'in', description: string, createdBy: string): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, amount, expense_type: type, description, created_by: createdBy })
    });
    return res.json();
  },

  async getExpenses(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/cashier/expenses`);
    return res.json();
  },

  async getXReport(cashierName: string = 'Kasiyer'): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/x-report?cashier_name=${encodeURIComponent(cashierName)}`);
    return res.json();
  },

  async closeZReport(closedBy: string = 'Müdür', managerPin?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/z-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closed_by: closedBy, manager_pin: managerPin })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Z raporu alınamadı.');
    return res.json();
  },

  // KDS
  async getKdsOrders(station: string = 'all'): Promise<any[]> {
    const res = await fetch(`${API_BASE}/kds/orders?station=${station}`);
    return res.json();
  },

  async progressKdsItem(itemId: number, status: string): Promise<any> {
    const res = await fetch(`${API_BASE}/kds/item/${itemId}/progress?status=${status}`, { method: 'POST' });
    return res.json();
  },

  async markKdsOrderReadyAll(orderId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/kds/order/${orderId}/ready-all`, { method: 'POST' });
    return res.json();
  },

  // Inventory & Recipes
  async getIngredients(): Promise<Ingredient[]> {
    const res = await fetch(`${API_BASE}/inventory/ingredients`);
    return res.json();
  },

  async getRecipes(): Promise<ProductRecipe[]> {
    const res = await fetch(`${API_BASE}/inventory/recipes`);
    return res.json();
  },

  async transferStock(ingredientId: number, sourceId: number, targetId: number, amount: number, notes?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/inventory/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient_id: ingredientId,
        source_warehouse_id: sourceId,
        target_warehouse_id: targetId,
        amount,
        notes
      })
    });
    return res.json();
  },

  async enterPurchaseInvoice(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/inventory/purchase-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  // Delivery & Couriers
  async getCouriers(): Promise<Courier[]> {
    const res = await fetch(`${API_BASE}/delivery/couriers`);
    return res.json();
  },

  async getDeliveryOrders(): Promise<DeliveryOrder[]> {
    const res = await fetch(`${API_BASE}/delivery/orders`);
    return res.json();
  },

  async simulateCallerId(phone: string = '05321234567'): Promise<any> {
    const res = await fetch(`${API_BASE}/delivery/caller-id-simulate?phone=${phone}`);
    return res.json();
  },

  async assignCourier(deliveryOrderId: number, courierId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/delivery/assign-courier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delivery_order_id: deliveryOrderId, courier_id: courierId })
    });
    return res.json();
  },

  async settleCourier(courierId: number, cash: number, card: number): Promise<any> {
    const res = await fetch(`${API_BASE}/delivery/courier-mutabakat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courier_id: courierId, collected_cash: cash, collected_card: card })
    });
    return res.json();
  },

  async ingestOnlineOrder(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/delivery/ingest-online-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  // QR Menu
  async getQrMenu(tableId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/qr/table/${tableId}/menu`);
    return res.json();
  },

  async placeCustomerTableOrder(tableId: number, items: any[]): Promise<any> {
    const res = await fetch(`${API_BASE}/qr/table/${tableId}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, waiter_name: 'QR Müşteri' })
    });
    return res.json();
  },

  // Fiscal & E-Adisyon
  async getEAdisyon(orderId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/fiscal/e-adisyon/${orderId}`);
    return res.json();
  },

  async getEscposReceipt(orderId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/fiscal/receipt/${orderId}/escpos`);
    return res.json();
  },

  // Audit Logs
  async getAuditLogs(actionType?: string): Promise<AuditLog[]> {
    const url = actionType ? `${API_BASE}/audit/logs?action_type=${actionType}` : `${API_BASE}/audit/logs`;
    const res = await fetch(url);
    return res.json();
  },

  // Settings & Definitions API
  async getSettings(): Promise<any> {
    const res = await fetch(`${API_BASE}/settings/`);
    if (!res.ok) throw new Error('Ayarlar alınamadı.');
    return res.json();
  },

  async updateSettings(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/settings/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Ayarlar güncellenemedi.');
    return res.json();
  },

  // Staff User Management CRUD
  async loginByPin(pinCode: string): Promise<StaffUser> {
    const res = await fetch(`${API_BASE}/auth/login-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_code: pinCode })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Geçersiz PIN Kodu!');
    }
    return res.json();
  },

  async createStaff(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Personel oluşturulamadı.');
    return res.json();
  },

  async updateStaff(userId: number, payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/staff/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Personel güncellenemedi.');
    return res.json();
  },

  async deleteStaff(userId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/staff/${userId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Personel silinemedi.');
    return res.json();
  },

  // Product & Category Definitions CRUD
  async createCategory(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/products/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async deleteCategory(catId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/products/categories/${catId}`, { method: 'DELETE' });
    return res.json();
  },

  async createProduct(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/products/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async updateProduct(prodId: number, payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/products/items/${prodId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async deleteProduct(prodId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/products/items/${prodId}`, { method: 'DELETE' });
    return res.json();
  },

  // Analytics & Statistics API
  async getRestaurantStatistics(): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/analytics/statistics`);
    return res.json();
  }
};
