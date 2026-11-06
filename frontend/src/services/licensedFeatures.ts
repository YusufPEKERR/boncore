export interface TenantFeatures {
  qr_menu: boolean;
  kds: boolean;
  delivery: boolean;
  integrations: boolean;
  fiscal: boolean;
  inventory: boolean;
  loyalty: boolean;
  hotel: boolean;
  kiosk: boolean;
  reservations: boolean;
  cost_profit: boolean;
}

export const DEFAULT_TENANT_FEATURES: TenantFeatures = {
  qr_menu: true,
  kds: true,
  delivery: true,
  integrations: true,
  fiscal: true,
  inventory: true,
  loyalty: true,
  hotel: true,
  kiosk: true,
  reservations: true,
  cost_profit: true,
};

const STORAGE_KEY = 'boncore_licensed_features';

export function loadLocalFeatures(): TenantFeatures {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_TENANT_FEATURES, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to parse cached licensed features', e);
  }
  return { ...DEFAULT_TENANT_FEATURES };
}

export function saveLocalFeatures(features: Partial<TenantFeatures>): TenantFeatures {
  const current = loadLocalFeatures();
  const updated: TenantFeatures = { ...current, ...features };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  window.dispatchEvent(new CustomEvent('boncore_features_updated', { detail: updated }));
  return updated;
}

// Convert backend raw payload with feature_* keys or clean keys
export function normalizeFeaturesPayload(payload: any): Partial<TenantFeatures> {
  if (!payload || typeof payload !== 'object') return {};
  if (payload.features && typeof payload.features === 'object') {
    return normalizeFeaturesPayload(payload.features);
  }

  const res: Partial<TenantFeatures> = {};

  const map: Record<string, keyof TenantFeatures> = {
    feature_qr_menu: 'qr_menu',
    qr_menu: 'qr_menu',
    qr: 'qr_menu',
    feature_kds: 'kds',
    kds: 'kds',
    kitchen: 'kds',
    feature_delivery: 'delivery',
    delivery: 'delivery',
    feature_integrations: 'integrations',
    integrations: 'integrations',
    aggregator: 'integrations',
    feature_e_invoice: 'fiscal',
    e_invoice: 'fiscal',
    fiscal: 'fiscal',
    feature_stock_recipe: 'inventory',
    stock_recipe: 'inventory',
    inventory: 'inventory',
    stock: 'inventory',
    recipe: 'inventory',
    feature_loyalty: 'loyalty',
    loyalty: 'loyalty',
    crm: 'loyalty',
    feature_hotel: 'hotel',
    hotel: 'hotel',
    folio: 'hotel',
    pms: 'hotel',
    feature_kiosk: 'kiosk',
    kiosk: 'kiosk',
    cfd: 'kiosk',
    feature_reservations: 'reservations',
    reservations: 'reservations',
    reservation: 'reservations',
    feature_cost_profit: 'cost_profit',
    cost_profit: 'cost_profit',
    wizard: 'cost_profit',
  };

  for (const [k, v] of Object.entries(payload)) {
    const targetKey = map[k];
    if (targetKey && typeof v === 'boolean') {
      res[targetKey] = v;
    }
  }
  return res;
}

export async function fetchLiveTenantFeatures(): Promise<TenantFeatures> {
  try {
    const res = await fetch(`/api/modules/status?_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.features) {
        const normalized = normalizeFeaturesPayload(data.features);
        return saveLocalFeatures(normalized);
      }
    }
  } catch (e) {
    console.warn('Failed to fetch live tenant features', e);
  }
  return loadLocalFeatures();
}

/**
 * Checks whether an application tab or action is licensed for the active tenant.
 * If a tab is mapped to an optional SaaS module and that module is disabled,
 * this function returns false regardless of user role.
 */
export function isTabLicensed(tabId: string, features?: TenantFeatures): boolean {
  const f = features || loadLocalFeatures();

  switch (tabId) {
    case 'integration_menu':
      return Boolean(f.integrations);
    case 'qr':
      return Boolean(f.qr_menu);
    case 'kds':
      return Boolean(f.kds);
    case 'delivery':
      return Boolean(f.delivery);
    case 'customers':
      return Boolean(f.loyalty);
    case 'reservations':
      return Boolean(f.reservations);
    case 'kiosk':
      return Boolean(f.kiosk);
    case 'hotel':
      return Boolean(f.hotel);
    case 'cost_profit':
      return Boolean(f.cost_profit);
    case 'inventory':
      return Boolean(f.inventory);
    case 'fiscal':
      return Boolean(f.fiscal);
    // Core features always allowed:
    case 'dashboard':
    case 'tables':
    case 'pos':
    case 'cashier':
    case 'audit':
    case 'users':
    case 'rights':
    case 'profile':
    case 'settings':
    case 'table_definition':
    case 'product_definition':
    case 'kitchen_groups':
    case 'restaurant_statistics':
    case 'closed_bills_report':
    case 'product_sales_report':
    case 'day_end_report':
    default:
      return true;
  }
}
