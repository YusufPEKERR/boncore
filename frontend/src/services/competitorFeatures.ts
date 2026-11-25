// Shared client-side store and domain helpers for BonCore POS competitor features
// Synchronizes with backend Feature Store (/api/settings/feature-store/:key) and caches per tenant in localStorage.
import { api } from './api';

export const COMPETITOR_EVENT = 'boncore:competitor-features-updated';
const SYNCED_FEATURE_KEYS = ['happy_hours', 'product_meta', 'table_timers', 'staff_shifts', 'tip_distributions'] as const;

function getTenantScope(): string {
  try {
    return (
      localStorage.getItem('boncore_restaurant_code') ||
      localStorage.getItem('boncore_tenant_code') ||
      localStorage.getItem('boncore_tenant_id') ||
      'default'
    );
  } catch {
    return 'default';
  }
}

function scopedKey(base: string): string {
  return `boncore_cf_${getTenantScope()}_${base}`;
}

function readJson<T>(base: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(scopedKey(base));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(base: string, value: T): void {
  try {
    localStorage.setItem(scopedKey(base), JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(COMPETITOR_EVENT, { detail: { key: base } }));
    if ((SYNCED_FEATURE_KEYS as readonly string[]).includes(base) && localStorage.getItem('boncore_token')) {
      api.saveFeatureStore(base, value).catch(() => {});
    }
  } catch (e) {
    console.warn('competitorFeatures storage error:', e);
  }
}

export async function hydrateAllFeatureStores(): Promise<void> {
  if (typeof window === 'undefined' || !localStorage.getItem('boncore_token')) return;
  await Promise.all(
    SYNCED_FEATURE_KEYS.map(async (key) => {
      try {
        const res = await api.getFeatureStore(key);
        if (res && res.data !== undefined && res.data !== null) {
          const hasData = Array.isArray(res.data) ? res.data.length > 0 : Object.keys(res.data || {}).length > 0;
          if (hasData) {
            localStorage.setItem(scopedKey(key), JSON.stringify(res.data));
            window.dispatchEvent(new CustomEvent(COMPETITOR_EVENT, { detail: { key } }));
          }
        }
      } catch {
        // Ignore offline/init errors and retain local cache
      }
    })
  );
}

// ============================================================================
// 1. HAPPY HOUR & TIMED AUTO-DISCOUNT RULES
// ============================================================================
export interface HappyHourRule {
  id: string;
  title: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  discountPercent: number;
  daysLabel: string;
  categoryFilter: string;
  isActive: boolean;
}

const DEFAULT_HAPPY_HOURS: HappyHourRule[] = [
  {
    id: 'hh_afternoon',
    title: 'Öğleden Sonra Kahve & Tatlı Mutlu Saati',
    startTime: '14:00',
    endTime: '17:00',
    discountPercent: 20,
    daysLabel: 'Hafta İçi (Pzt-Cum)',
    categoryFilter: 'ALL',
    isActive: true,
  },
  {
    id: 'hh_allday_promo',
    title: 'Akşamüstü Happy Hour (%15 İndirim)',
    startTime: '00:00',
    endTime: '23:59',
    discountPercent: 15,
    daysLabel: 'Her Gün',
    categoryFilter: 'ALL',
    isActive: false,
  },
];

export function getHappyHourRules(): HappyHourRule[] {
  return readJson<HappyHourRule[]>('happy_hours', DEFAULT_HAPPY_HOURS);
}

export function saveHappyHourRules(rules: HappyHourRule[]): void {
  writeJson('happy_hours', rules);
}

export function isTimeWithinRange(nowHHMM: string, start: string, end: string): boolean {
  if (!start || !end) return false;
  if (start <= end) {
    return nowHHMM >= start && nowHHMM <= end;
  }
  // Overnight window (e.g. 22:00 - 02:00)
  return nowHHMM >= start || nowHHMM <= end;
}

export function doesRuleApplyToday(daysLabel: string, now: Date = new Date()): boolean {
  const lbl = (daysLabel || '').toLowerCase().trim();
  if (!lbl || lbl.includes('her gün') || lbl.includes('tüm')) return true;
  const day = now.getDay(); // 0=Pazar, 1=Pzt .. 6=Cumartesi
  if (lbl.includes('hafta içi') || lbl.includes('pzt-cum')) {
    return day >= 1 && day <= 5;
  }
  if (lbl.includes('hafta sonu') || lbl.includes('cmt-paz')) {
    return day === 0 || day === 6;
  }
  const dayTokens: Array<{ idx: number; pats: string[] }> = [
    { idx: 1, pats: ['pzt', 'pazartesi'] },
    { idx: 2, pats: ['sal', 'salı'] },
    { idx: 3, pats: ['çar', 'çarşamba', 'car'] },
    { idx: 4, pats: ['per', 'perşembe'] },
    { idx: 5, pats: ['cuma', 'cum '] },
    { idx: 6, pats: ['cmt', 'cumartesi'] },
    { idx: 0, pats: ['paz', 'pazar'] },
  ];
  let matchedAnyDayToken = false;
  for (const dt of dayTokens) {
    const hasToken = dt.pats.some((p) => (p === 'cuma' ? /\bcuma\b/i.test(lbl) : lbl.includes(p)));
    if (hasToken) {
      matchedAnyDayToken = true;
      if (dt.idx === day) return true;
    }
  }
  return !matchedAnyDayToken;
}

export function doesRuleMatchCategory(categoryFilter: string, categoryName?: string): boolean {
  const cf = (categoryFilter || '').trim();
  if (!cf || cf.toUpperCase() === 'ALL' || cf.toLowerCase() === 'tümü') return true;
  if (!categoryName) return true;
  const target = categoryName.trim().toLowerCase();
  return cf
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((tok) => target === tok || target.includes(tok) || tok.includes(target));
}

export function getActiveHappyHourRules(now: Date = new Date(), categoryName?: string): HappyHourRule[] {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const current = `${hh}:${mm}`;
  return getHappyHourRules().filter(
    (r) =>
      r.isActive &&
      isTimeWithinRange(current, r.startTime, r.endTime) &&
      doesRuleApplyToday(r.daysLabel, now) &&
      doesRuleMatchCategory(r.categoryFilter, categoryName)
  );
}

// ============================================================================
// 2. PRODUCT EXTRA METADATA (ALLERGENS, DIETARY, CALORIES, PREP TIME, 86 LIMIT)
// ============================================================================
export interface ProductExtraMeta {
  calories?: number | null;
  prepMinutes?: number | null;
  allergens: string[];
  dietary: string[];
  dailyPortionLimit: number | null;
  remainingPortions: number | null;
}

export const DIETARY_OPTIONS = [
  { id: 'vegan', label: 'Vegan', icon: '🌱' },
  { id: 'gluten_free', label: 'Glütensiz', icon: '🌾' },
  { id: 'spicy', label: 'Acılı', icon: '🌶️' },
  { id: 'chef_special', label: 'Şefin Özel Seçimi', icon: '⭐' },
] as const;

export const ALLERGEN_OPTIONS = [
  { id: 'dairy', label: 'Süt / Laktoz', icon: '🥛' },
  { id: 'gluten', label: 'Glüten / Buğday', icon: '🍞' },
  { id: 'nuts', label: 'Kuruyemiş / Fıstık', icon: '🥜' },
  { id: 'egg', label: 'Yumurta', icon: '🥚' },
  { id: 'seafood', label: 'Deniz Ürünü', icon: '🦐' },
] as const;

export const EMPTY_PRODUCT_META: ProductExtraMeta = {
  calories: null,
  prepMinutes: null,
  allergens: [],
  dietary: [],
  dailyPortionLimit: null,
  remainingPortions: null,
};

export function getAllProductExtraMeta(): Record<number, ProductExtraMeta> {
  return readJson<Record<number, ProductExtraMeta>>('product_meta', {});
}

export function getProductExtraMeta(productId: number): ProductExtraMeta {
  const all = getAllProductExtraMeta();
  return all[productId] ? { ...EMPTY_PRODUCT_META, ...all[productId] } : { ...EMPTY_PRODUCT_META };
}

export function saveProductExtraMeta(productId: number, meta: ProductExtraMeta): void {
  const all = getAllProductExtraMeta();
  all[productId] = { ...EMPTY_PRODUCT_META, ...meta };
  writeJson('product_meta', all);
}

export function decrementProductPortion(productId: number, soldQty: number): ProductExtraMeta | null {
  if (!productId || soldQty <= 0) return null;
  const all = getAllProductExtraMeta();
  const existing = all[productId];
  if (!existing || existing.remainingPortions === null || existing.remainingPortions === undefined) {
    return null;
  }
  const nextRemaining = Math.max(0, Number(existing.remainingPortions) - Number(soldQty));
  all[productId] = { ...existing, remainingPortions: nextRemaining };
  writeJson('product_meta', all);
  return all[productId];
}

// ============================================================================
// 3. COURSE FIRING & SEAT ORDERING + TABLE TIMER TARIFF
// ============================================================================
export type CourseTag = '1. Servis' | '2. Servis' | '3. Servis (Tatlı)';

export function formatCourseSeatNote(
  course: CourseTag | null,
  seatLabel: string | null,
  existingNote?: string
): string {
  const parts: string[] = [];
  if (course && course !== '1. Servis') {
    parts.push(`[${course}]`);
  } else if (course === '1. Servis') {
    parts.push('[1. Servis]');
  }
  if (seatLabel && seatLabel !== 'Ortak') {
    parts.push(`[${seatLabel}]`);
  }
  const prefix = parts.join(' ');
  const cleaned = (existingNote || '').trim();
  if (!prefix) return cleaned;
  return cleaned ? `${prefix} ${cleaned}` : prefix;
}

export function extractCourseFromNote(note?: string | null): string | null {
  if (!note) return null;
  const match = note.match(/\[(1\. Servis|2\. Servis|3\. Servis \(Tatlı\))\]/);
  return match ? match[1] : null;
}

export function extractSeatFromNote(note?: string | null): string | null {
  if (!note) return null;
  const match = note.match(/\[(Kişi \d+)\]/);
  return match ? match[1] : null;
}

export interface TableTimerState {
  tableId: number;
  startedAt: number;
  hourlyRate: number;
  tariffName: string;
  isRunning: boolean;
}

export function getAllTableTimers(): Record<number, TableTimerState> {
  return readJson<Record<number, TableTimerState>>('table_timers', {});
}

export function getTableTimer(tableId: number): TableTimerState | null {
  const all = getAllTableTimers();
  return all[tableId] || null;
}

export function startTableTimer(tableId: number, hourlyRate: number, tariffName: string): TableTimerState {
  const all = getAllTableTimers();
  const entry: TableTimerState = {
    tableId,
    startedAt: Date.now(),
    hourlyRate: Math.max(1, hourlyRate),
    tariffName: tariffName.trim() || 'Saatlik Masa Tarifesi',
    isRunning: true,
  };
  all[tableId] = entry;
  writeJson('table_timers', all);
  return entry;
}

export function clearTableTimer(tableId: number): void {
  const all = getAllTableTimers();
  delete all[tableId];
  writeJson('table_timers', all);
}

export function calculateTimerCharge(timer: TableTimerState, nowMs: number = Date.now()): {
  elapsedMinutes: number;
  amount: number;
} {
  const diffMs = Math.max(0, nowMs - timer.startedAt);
  const elapsedMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  const rawAmount = (elapsedMinutes / 60) * timer.hourlyRate;
  return {
    elapsedMinutes,
    amount: Math.max(1, Number(rawAmount.toFixed(2))),
  };
}

// ============================================================================
// 4. STAFF SHIFT / TIMECLOCK & TIP POOL DISTRIBUTION
// ============================================================================
export interface StaffShiftRecord {
  userId: number;
  name: string;
  role: string;
  status: 'working' | 'break' | 'off';
  clockInAt?: number;
  lastBreakAt?: number;
  accumulatedMinutes: number;
  lastUpdated: string;
}

export interface TipDistributionRecord {
  id: string;
  createdAt: string;
  cashTip: number;
  cardTip: number;
  totalPool: number;
  method: 'hours' | 'role';
  shares: Array<{
    userId: number;
    name: string;
    role: string;
    weight: number;
    payout: number;
  }>;
}

export function getStaffShifts(): Record<number, StaffShiftRecord> {
  return readJson<Record<number, StaffShiftRecord>>('staff_shifts', {});
}

export function updateStaffShiftStatus(
  userId: number,
  name: string,
  role: string,
  nextStatus: 'working' | 'break' | 'off'
): StaffShiftRecord {
  const all = getStaffShifts();
  const prev = all[userId] || {
    userId,
    name,
    role,
    status: 'off' as const,
    accumulatedMinutes: 0,
    lastUpdated: '-',
  };

  let accMinutes = prev.accumulatedMinutes || 0;
  let clockInAt = prev.clockInAt;
  let lastBreakAt = prev.lastBreakAt;
  const now = Date.now();

  if (prev.status === 'working' && prev.clockInAt && (nextStatus === 'break' || nextStatus === 'off')) {
    accMinutes += Math.max(1, Math.round((now - prev.clockInAt) / 60000));
    clockInAt = undefined;
  }

  if (nextStatus === 'working') {
    clockInAt = now;
    lastBreakAt = undefined;
  } else if (nextStatus === 'break') {
    lastBreakAt = now;
  } else if (nextStatus === 'off') {
    clockInAt = undefined;
    lastBreakAt = undefined;
  }

  const updated: StaffShiftRecord = {
    userId,
    name,
    role,
    status: nextStatus,
    clockInAt,
    lastBreakAt,
    accumulatedMinutes: accMinutes,
    lastUpdated: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
  };
  all[userId] = updated;
  writeJson('staff_shifts', all);
  return updated;
}

export function getTipDistributions(): TipDistributionRecord[] {
  return readJson<TipDistributionRecord[]>('tip_distributions', []);
}

export function saveTipDistribution(
  rec: Omit<TipDistributionRecord, 'id' | 'createdAt'>
): TipDistributionRecord {
  const list = getTipDistributions();
  const created: TipDistributionRecord = {
    ...rec,
    id: `tip_${Date.now()}`,
    createdAt: new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
  };
  writeJson('tip_distributions', [created, ...list]);
  return created;
}

// ============================================================================
// 5. QR MENU MULTI-LANGUAGE DICTIONARY
// ============================================================================
export type QrLang = 'tr' | 'en' | 'de' | 'ar' | 'ru';

export const QR_TRANSLATIONS: Record<QrLang, {
  digitalMenu: string;
  waiter: string;
  bill: string;
  payAtTable: string;
  allFilter: string;
  vegan: string;
  glutenFree: string;
  lowCal: string;
  cart: string;
  item: string;
  sendOrder: string;
  soldOut: string;
  lastPortions: string;
  prepMin: string;
}> = {
  tr: {
    digitalMenu: 'DİJİTAL MENÜ',
    waiter: 'Garson',
    bill: 'Hesap',
    payAtTable: 'Alman Usulü Öde',
    allFilter: 'Tümü',
    vegan: 'Vegan',
    glutenFree: 'Glütensiz',
    lowCal: '<400 kcal',
    cart: 'Sepetiniz',
    item: 'Ürün',
    sendOrder: 'MUTFAĞA SİPARİŞ VER',
    soldOut: 'Tükendi (86)',
    lastPortions: 'Son {n} Adet',
    prepMin: 'dk',
  },
  en: {
    digitalMenu: 'DIGITAL MENU',
    waiter: 'Waiter',
    bill: 'Check',
    payAtTable: 'Split & Pay',
    allFilter: 'All',
    vegan: 'Vegan',
    glutenFree: 'Gluten-Free',
    lowCal: '<400 kcal',
    cart: 'Your Cart',
    item: 'Items',
    sendOrder: 'SEND ORDER TO KITCHEN',
    soldOut: 'Sold Out',
    lastPortions: 'Only {n} Left',
    prepMin: 'min',
  },
  de: {
    digitalMenu: 'DIGITALE KARTE',
    waiter: 'Kellner',
    bill: 'Rechnung',
    payAtTable: 'Getrennt Zahlen',
    allFilter: 'Alle',
    vegan: 'Vegan',
    glutenFree: 'Glutenfrei',
    lowCal: '<400 kcal',
    cart: 'Warenkorb',
    item: 'Artikel',
    sendOrder: 'BESTELLUNG SENDEN',
    soldOut: 'Ausverkauft',
    lastPortions: 'Nur noch {n}',
    prepMin: 'Min',
  },
  ar: {
    digitalMenu: 'القائمة الرقمية',
    waiter: 'نادل',
    bill: 'الحساب',
    payAtTable: 'الدفع على الطاولة',
    allFilter: 'الكل',
    vegan: 'نباتي',
    glutenFree: 'خالي من الغلوتين',
    lowCal: '<400 سعرة',
    cart: 'سلتك',
    item: 'صنف',
    sendOrder: 'إرسال الطلب للمطبخ',
    soldOut: 'نفذت الكمية',
    lastPortions: 'بقي {n}',
    prepMin: 'د',
  },
  ru: {
    digitalMenu: 'ЦИФРОВОЕ МЕНЮ',
    waiter: 'Официант',
    bill: 'Счет',
    payAtTable: 'Оплатить у стола',
    allFilter: 'Все',
    vegan: 'Веган',
    glutenFree: 'Без глютена',
    lowCal: '<400 ккал',
    cart: 'Корзина',
    item: 'поз.',
    sendOrder: 'ОТПРАВИТЬ НА КУХНЮ',
    soldOut: 'Закончилось',
    lastPortions: 'Осталось {n}',
    prepMin: 'мин',
  },
};
