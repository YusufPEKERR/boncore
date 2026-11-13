import { Area, Category, Product, Order, StaffUser, Ingredient, ProductRecipe, Courier, DeliveryOrder, AuditLog } from '../types';
import { offlineDb, saveAreasToOfflineCache, saveCategoriesToOfflineCache, clearOfflineCache, queueOfflineOrder, queueOfflinePayment } from './offlineDb';

const API_BASE = '/api';

// =========================================================================
// Global Multi-Tenant Fetch Interceptor
// Automatically attaches 'Authorization' and 'X-Restaurant-Code' to ALL API requests
// so that areas, tables, products, orders, settings never bleed across restaurants!
// =========================================================================
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' 
      ? input 
      : input instanceof URL 
        ? input.toString() 
        : (input as Request).url;

    if (urlStr.includes('/api/')) {
      const customInit: RequestInit = init ? { ...init } : {};
      const headers = new Headers(customInit.headers || {});

      try {
        if (urlStr.includes('/api/master/')) {
          const masterToken = localStorage.getItem('boncore_master_token');
          if (masterToken && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${masterToken}`);
          }
        } else {
          const token = localStorage.getItem('boncore_token');
          if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
          }
          const rCode = localStorage.getItem('boncore_restaurant_code');
          if (rCode && !headers.has('X-Restaurant-Code')) {
            headers.set('X-Restaurant-Code', rCode);
          }
          const savedUser = localStorage.getItem('boncore_user');
          if (savedUser && !headers.has('X-User-Role')) {
            const parsedUser = JSON.parse(savedUser);
            if (parsedUser?.role) {
              headers.set('X-User-Role', encodeURIComponent(String(parsedUser.role)));
            }
          }
        }
      } catch {}

      customInit.headers = headers;
      const response = await originalFetch.call(this, input, customInit);

      // Wrap response.json() so non-JSON responses (500, 502, 504 HTML error pages)
      // do not throw unhandled JSON parse SyntaxErrors, and surface clean error toasts.
      const originalText = response.text.bind(response);
      let cachedParsed: any = undefined;
      let hasParsed = false;

      response.json = async function (): Promise<any> {
        if (hasParsed) {
          return cachedParsed;
        }

        try {
          const rawText = await originalText();
          if (!rawText || !rawText.trim()) {
            cachedParsed = {};
            hasParsed = true;
            return cachedParsed;
          }

          try {
            cachedParsed = JSON.parse(rawText);
            hasParsed = true;

            // If 5xx server error with JSON payload, surface to toast
            if (response.status >= 500 && typeof window !== 'undefined') {
              const errMsg = cachedParsed.detail || cachedParsed.error || cachedParsed.message || `Sunucu hatası (${response.status})`;
              window.dispatchEvent(new CustomEvent('boncore_toast', {
                detail: { message: String(errMsg), type: 'error' }
              }));
            }

            return cachedParsed;
          } catch {
            // Raw text is not valid JSON (e.g. HTML 500, 502 Bad Gateway, 504 Gateway Timeout)
            const status = response.status;
            let cleanMsg = 'Sunucuyla iletişim kurulurken bir hata oluştu.';
            if (status === 502) {
              cleanMsg = 'Sunucuya ulaşılamıyor (502 Bad Gateway). Backend servisini kontrol edin.';
            } else if (status === 504) {
              cleanMsg = 'Ağ zaman aşımı (504 Gateway Timeout). Sunucu yanıt vermedi.';
            } else if (status === 500) {
              cleanMsg = 'Sunucu hatası (500 Internal Server Error). Lütfen tekrar deneyiniz.';
            } else if (status === 404) {
              cleanMsg = 'İstenen kaynak bulunamadı (404 Not Found).';
            } else if (status >= 400) {
              cleanMsg = `İstek başarısız oldu (${status}).`;
            }

            if (typeof window !== 'undefined' && status >= 400) {
              window.dispatchEvent(new CustomEvent('boncore_toast', {
                detail: { message: cleanMsg, type: 'error' }
              }));
            }

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
          cachedParsed = {
            error: 'Yanıt akışı okunamadı.',
            detail: 'Yanıt akışı okunamadı.',
            status: 'error'
          };
          hasParsed = true;
          return cachedParsed;
        }
      };

      return response;
    }

    return originalFetch.call(this, input, init);
  };
}

export function getAuthHeaders(includeJson: boolean = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    const token = localStorage.getItem('boncore_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const rCode = localStorage.getItem('boncore_restaurant_code');
    if (rCode) {
      headers['X-Restaurant-Code'] = rCode;
    }
    const savedUser = localStorage.getItem('boncore_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      if (parsedUser?.role) {
        headers['X-User-Role'] = encodeURIComponent(String(parsedUser.role));
      }
    }
  } catch {}
  return headers;
}

export function showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('boncore_toast', {
      detail: { message, type }
    }));
  }
}

export const api = {
  // Auth (Username & Password + Token)
  async login(username: string, password: string, remember: boolean = false): Promise<{ access_token: string; expires_at: number; user: StaffUser; restaurant?: any; is_master?: boolean }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, remember })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Kullanıcı adı veya parola hatalı.');
    }
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem('boncore_token', data.access_token);
    }
    if (data.restaurant?.code) {
      localStorage.setItem('boncore_restaurant_code', data.restaurant.code);
      localStorage.setItem('boncore_active_restaurant_name', data.restaurant.name);
      try {
        document.cookie = `boncore_restaurant_code=${data.restaurant.code}; path=/; max-age=604800; SameSite=Lax`;
        await clearOfflineCache();
      } catch {}
    }
    return data;
  },

  async logout() {
    try {
      localStorage.removeItem('boncore_token');
      localStorage.removeItem('boncore_restaurant_code');
      localStorage.removeItem('boncore_active_restaurant_name');
      localStorage.removeItem('boncore_current_user');
      document.cookie = 'boncore_restaurant_code=; path=/; max-age=0; SameSite=Lax';
      await clearOfflineCache();
    } catch {}
  },

  async getMe(): Promise<StaffUser> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(false)
    });
    if (!res.ok) {
      throw new Error('Oturum doğrulanamadı.');
    }
    return res.json();
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Parola güncellenemedi.');
    }
    return res.json();
  },

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
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem('boncore_token', data.access_token);
    }
    return data;
  },

  async getStaffList(): Promise<StaffUser[]> {
    const res = await fetch(`${API_BASE}/auth/staff`, {
      headers: getAuthHeaders(false)
    });
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

  async reorderAreas(areaIds: number[]): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/areas/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area_ids: areaIds })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Bölge sıralaması güncellenemedi.');
    return res.json();
  },

  async reorderTables(areaId: number, tableIds: number[]): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/tables/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area_id: areaId, table_ids: tableIds })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Masa sıralaması güncellenemedi.');
    return res.json();
  },

  async deleteArea(area_id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/areas/${area_id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Bölge silinemedi.');
    return res.json();
  },

  async createTable(payload: { area_id: number; name: string; seats?: number; shape?: string; order_index?: number }): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Masa oluşturulamadı.');
    return res.json();
  },

  async updateTable(table_id: number, payload: { area_id?: number; name?: string; seats?: number; shape?: string; order_index?: number }): Promise<any> {
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

  async cancelOrder(orderId: number, reasonCode: string, reasonText: string, operatorName: string, managerPin?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason_code: reasonCode,
        reason_text: reasonText,
        operator_name: operatorName,
        manager_pin: managerPin
      })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Sipariş iptal edilemedi.');
    return res.json();
  },

  async updateOrderNotes(orderId: number, notes: string): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Not kaydedilemedi.');
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

  async applyItemDiscount(itemId: number, discountType: 'percentage' | 'fixed', value: number, reason?: string, operatorName?: string, managerPin?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/items/${itemId}/discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discount_type: discountType,
        value,
        reason: reason || 'Ürün İndirimi',
        operator_name: operatorName || 'Kasiyer',
        manager_pin: managerPin
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Ürün indirimi uygulanamadı.');
    }
    return res.json();
  },

  async removeItemDiscount(itemId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/items/${itemId}/remove-discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'İndirim iptal edilemedi.');
    }
    return res.json();
  },

  async applyBatchItemDiscount(orderId: number, itemIds: number[], discountType: 'percentage' | 'fixed', value: number, reason?: string, operatorName?: string, managerPin?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/batch-item-discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_ids: itemIds,
        discount_type: discountType,
        value,
        reason: reason || 'Ürün İndirimi',
        operator_name: operatorName || 'Kasiyer',
        manager_pin: managerPin
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Seçili ürünlere indirim uygulanamadı.');
    }
    return res.json();
  },

  async removeAllDiscounts(orderId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/remove-all-discounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'İndirimler sıfırlanamadı.');
    }
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

  async deletePayment(paymentId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/payments/${paymentId}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Tahsilat kaydı silinemedi.');
    }
    return res.json();
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

  async deleteExpense(id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/expenses/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Masraf kaydı silinemedi.');
    return res.json();
  },

  async getXReport(cashierName: string = 'Kasiyer'): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/x-report?cashier_name=${encodeURIComponent(cashierName)}`);
    return res.json();
  },

  async closeZReport(closedBy: string = 'Müdür', managerPin?: string, forceClose: boolean = false): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/z-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closed_by: closedBy, manager_pin: managerPin, force_close: forceClose })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Z raporu alınamadı.');
    return res.json();
  },

  async getAutoZReportSettings(): Promise<{
    enabled: boolean;
    time: string;
    force_close: boolean;
    last_run_date: string;
    last_run_status: string;
  }> {
    const res = await fetch(`${API_BASE}/cashier/auto-z-report`);
    if (!res.ok) throw new Error((await res.json()).detail || 'Otomatik Z-Raporu ayarları alınamadı.');
    return res.json();
  },

  async updateAutoZReportSettings(payload: {
    enabled: boolean;
    time: string;
    force_close?: boolean;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/auto-z-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Otomatik Z-Raporu ayarları kaydedilemedi.');
    return res.json();
  },

  async testAutoZReport(): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/auto-z-report/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Otomatik Z-Raporu test çalıştırması başarısız.');
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
    const res = await fetch(`${API_BASE}/inventory/ingredients`, {
      headers: getAuthHeaders(false)
    });
    const data = await res.json().catch(() => []);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.ingredients)) return data.ingredients;
    return [];
  },

  async createIngredient(payload: Partial<Ingredient>): Promise<any> {
    const res = await fetch(`${API_BASE}/inventory/ingredients`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Stok kalemi eklenemedi.');
    return res.json();
  },

  async updateIngredient(id: number, payload: Partial<Ingredient>): Promise<any> {
    const res = await fetch(`${API_BASE}/inventory/ingredients/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Stok kalemi güncellenemedi.');
    return res.json();
  },

  async deleteIngredient(id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/inventory/ingredients/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(false)
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Stok kalemi silinemedi.');
    return res.json();
  },

  async getRecipes(): Promise<ProductRecipe[]> {
    const res = await fetch(`${API_BASE}/inventory/recipes`);
    return res.json();
  },

  async getProductRecipe(productId: number): Promise<ProductRecipe> {
    const res = await fetch(`${API_BASE}/inventory/recipes/${productId}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Reçete alınamadı.');
    return res.json();
  },

  async updateProductRecipe(productId: number, items: Array<{ ingredient_id: number; amount: number; waste_percentage?: number }>): Promise<ProductRecipe> {
    const res = await fetch(`${API_BASE}/inventory/recipes/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Reçete güncellenemedi.');
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

  async completeDelivery(deliveryOrderId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/delivery/complete-delivery/${deliveryOrderId}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Teslimat tamamlanamadı.');
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

  async printTableBill(orderId: number, operatorName?: string): Promise<any> {
    const url = operatorName
      ? `${API_BASE}/fiscal/receipt/${orderId}/escpos?operator_name=${encodeURIComponent(operatorName)}`
      : `${API_BASE}/fiscal/receipt/${orderId}/escpos`;
    const res = await fetch(url, { method: 'POST' });
    return res.json();
  },

  async clearBillPrinted(tableId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/tables/${tableId}/clear-bill-printed`, {
      method: 'POST'
    });
    return res.json();
  },

  // Audit Logs
  async getAuditLogs(actionType?: string, search?: string): Promise<AuditLog[]> {
    const q = new URLSearchParams();
    if (actionType && actionType !== 'all') q.append('action_type', actionType);
    if (search) q.append('search', search);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetch(`${API_BASE}/audit/logs${qs}`);
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
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem('boncore_token', data.access_token);
    }
    return data;
  },

  async createStaff(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/staff`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Personel oluşturulamadı.');
    return res.json();
  },

  async updateStaff(userId: number, payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/staff/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Personel güncellenemedi.');
    return res.json();
  },

  async deleteStaff(userId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/staff/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(false)
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Personel silinemedi.');
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

  async updateCategory(catId: number, payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/products/categories/${catId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async reorderCategories(categoryIds: number[]): Promise<any> {
    const res = await fetch(`${API_BASE}/products/categories-reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_ids: categoryIds })
    });
    return res.json();
  },

  async reorderProducts(productIds: number[]): Promise<any> {
    const res = await fetch(`${API_BASE}/products/items-reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: productIds })
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
  async getRestaurantStatistics(dateRange: string = 'all'): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/analytics/statistics?date_range=${encodeURIComponent(dateRange)}`);
    return res.json();
  },

  // Closed Bills (Kapatılan Adisyonlar) Report & Reopen API
  async getClosedBillsReport(params?: {
    dateRange?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    paymentMethod?: string;
  }): Promise<any> {
    const q = new URLSearchParams();
    if (params?.dateRange) q.append('date_range', params.dateRange);
    if (params?.startDate) q.append('start_date', params.startDate);
    if (params?.endDate) q.append('end_date', params.endDate);
    if (params?.search) q.append('search', params.search);
    if (params?.paymentMethod) q.append('payment_method', params.paymentMethod);
    const res = await fetch(`${API_BASE}/orders/reports/closed-bills?${q.toString()}`);
    return res.json();
  },

  async reopenClosedOrder(orderId: number, operatorName: string = 'Yönetici', clearPayments: boolean = true): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator_name: operatorName, clear_payments: clearPayments })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || 'Masa ve adisyon tekrar aktif edilemedi.');
    }
    return res.json();
  },

  // Product Sales Report API
  async getProductSalesReport(params?: {
    dateRange?: string;
    startDate?: string;
    endDate?: string;
    categoryId?: number;
    station?: string;
    search?: string;
  }): Promise<any> {
    const q = new URLSearchParams();
    if (params?.dateRange) q.append('date_range', params.dateRange);
    if (params?.startDate) q.append('start_date', params.startDate);
    if (params?.endDate) q.append('end_date', params.endDate);
    if (params?.categoryId) q.append('category_id', String(params.categoryId));
    if (params?.station) q.append('station', params.station);
    if (params?.search) q.append('search', params.search);
    const res = await fetch(`${API_BASE}/orders/reports/product-sales?${q.toString()}`);
    return res.json();
  },

  // Day-End (Z) Report API
  async getDayEndReport(dateStr?: string, registerId?: number): Promise<any> {
    const q = new URLSearchParams();
    if (dateStr) {
      q.append('date_str', dateStr);
      q.append('target_date', dateStr);
      q.append('date', dateStr);
    }
    if (registerId) q.append('register_id', String(registerId));
    const res = await fetch(`${API_BASE}/cashier/reports/day-end?${q.toString()}`);
    return res.json();
  },

  async getZReportHistory(): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/reports/z-history`);
    return res.json();
  },

  async closeDayEndRegister(closedBy: string = 'Yönetici', forceClose: boolean = false): Promise<any> {
    const res = await fetch(`${API_BASE}/cashier/z-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closed_by: closedBy, force_close: forceClose })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Z Raporu alınamadı.');
    return res.json();
  },

    // Live System Time API
  async getServerTime(): Promise<any> {
    const res = await fetch(`${API_BASE}/settings/time`);
    return res.json();
  },

  // CAS CL-3000 Ethernet Scale API
  async getScaleConfig(): Promise<any> {
    const res = await fetch(`${API_BASE}/scale/config`, {
      headers: getAuthHeaders(false)
    });
    return res.json();
  },

  async updateScaleConfig(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/scale/config`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async testScaleConnection(payload: { ip_address: string; port: number; timeout?: number }): Promise<any> {
    const res = await fetch(`${API_BASE}/scale/test`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async getScaleWeight(ip?: string, port?: number, terminalId?: string): Promise<{
    success: boolean;
    weight: number;
    unit?: string;
    grams?: number;
    is_stable?: boolean;
    raw?: string;
    simulated?: boolean;
    error?: string;
    message?: string;
  }> {
    const q = new URLSearchParams();
    if (ip) q.append('ip', ip);
    if (port) q.append('port', String(port));
    if (terminalId) q.append('terminal_id', terminalId);
    const res = await fetch(`${API_BASE}/scale/weight?${q.toString()}`, {
      headers: getAuthHeaders(false)
    });
    return res.json();
  },

  async getAgentStatus(terminalId?: string): Promise<{
    isOnline: boolean;
    localIp?: string;
    version?: string;
    terminalId?: string;
    terminalName?: string;
    activeTerminalsCount?: number;
  }> {
    try {
      const q = terminalId ? `?terminal_id=${encodeURIComponent(terminalId)}` : '';
      const res = await fetch(`${API_BASE}/scale/agent/status${q}`);
      return res.json();
    } catch {
      return { isOnline: false };
    }
  },

  async getTerminals(): Promise<{
    terminals: Array<{
      id: string;
      name: string;
      local_ip: string;
      version: string;
      is_online: boolean;
      last_seen_seconds_ago: number;
      scale_connected: boolean;
      scale_ip: string;
      scale_port: number;
      last_weight: number;
      printers: string[];
      is_default: boolean;
      scale_enabled?: boolean;
    }>;
  }> {
    const res = await fetch(`${API_BASE}/scale/terminals`);
    return res.json();
  },

  async updateTerminal(terminalId: string, payload: { name?: string; scale_ip?: string; scale_port?: number; is_default?: boolean; scale_enabled?: boolean }): Promise<any> {
    const res = await fetch(`${API_BASE}/scale/terminals/${encodeURIComponent(terminalId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

    async deleteTerminal(terminalId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/scale/terminals/${encodeURIComponent(terminalId)}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  async printReceipt(payload: {
    terminal_id?: string;
    printers?: string[];
    raw_text?: string;
    doc_type?: string;
    document?: any;
  }): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    results?: Array<{ printer: string; success: boolean }>;
    terminal_id?: string;
    terminal_name?: string;
  }> {
    try {
      const res = await fetch(`${API_BASE}/scale/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message || 'Yazdırma isteği gönderilemedi.' };
    }
  },

  // --- ADISYO PRO MODULES API ---
  async getCustomersLoyalty(): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/customers`);
    return res.json();
  },

  async createCustomer(payload: { name: string; phone: string; email?: string; tier?: string; points?: number; balance?: number; notes?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async addCustomerTransaction(customerId: string, payload: { type: string; amount?: number; points?: number; note?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/customers/${encodeURIComponent(customerId)}/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async deleteCustomer(customerId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/customers/${encodeURIComponent(customerId)}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  async toggleCampaign(campaignId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/campaigns/${encodeURIComponent(campaignId)}/toggle`, {
      method: 'POST'
    });
    return res.json();
  },

  async getReservations(): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/reservations`);
    return res.json();
  },

  async createReservation(payload: { guest_name: string; phone: string; guests_count: number; date: string; time: string; table_name: string; notes?: string; deposit?: number }): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async updateReservationStatus(resId: string, status: string): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/reservations/${encodeURIComponent(resId)}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    return res.json();
  },

  async deleteReservation(resId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/reservations/${encodeURIComponent(resId)}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  async getCostProfitAnalysis(): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/cost-profit`);
    return res.json();
  },

  async getHotelFolios(): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/hotel`);
    return res.json();
  },

  async addHotelCharge(payload: { room_no: string; amount: number; description?: string; order_id?: number }): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/hotel/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async settleHotelFolio(roomNo: string): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/hotel/${encodeURIComponent(roomNo)}/settle`, {
      method: 'POST'
    });
    return res.json();
  },

  async submitKioskOrder(payload: { customer_name: string; order_type: string; payment_method: string; items: Array<{ product_id: number; quantity: number; notes?: string }> }): Promise<any> {
    const res = await fetch(`${API_BASE}/modules/kiosk-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  // Kitchen Groups (KDS Mutfak Grupları / İstasyon Yönetimi)
  async getKitchenGroups(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/settings/kitchen-groups`);
    if (!res.ok) throw new Error('Mutfak grupları yüklenemedi.');
    return res.json();
  },

  async createKitchenGroup(payload: {
    id?: string;
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    printer_name?: string;
    target_prep_minutes?: number;
    sound_alert?: boolean;
    auto_print?: boolean;
    is_active?: boolean;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/settings/kitchen-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Mutfak grubu oluşturulamadı.');
    }
    return res.json();
  },

  async updateKitchenGroup(groupId: string, payload: Record<string, any>): Promise<any> {
    const res = await fetch(`${API_BASE}/settings/kitchen-groups/${encodeURIComponent(groupId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Mutfak grubu güncellenemedi.');
    }
    return res.json();
  },

  async deleteKitchenGroup(groupId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/settings/kitchen-groups/${encodeURIComponent(groupId)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Mutfak grubu silinemedi.');
    }
    return res.json();
  },

  async reorderKitchenGroups(orderedIds: string[]): Promise<any> {
    const res = await fetch(`${API_BASE}/settings/kitchen-groups-reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordered_ids: orderedIds })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Mutfak grupları sıralanamadı.');
    }
    return res.json();
  },

  async assignCategoriesToKitchenGroup(groupId: string, payload: { category_ids?: number[]; product_ids?: number[] }): Promise<any> {
    const res = await fetch(`${API_BASE}/settings/kitchen-groups/${encodeURIComponent(groupId)}/assign-categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Kategori ataması yapılamadı.');
    }
    return res.json();
  }
};
