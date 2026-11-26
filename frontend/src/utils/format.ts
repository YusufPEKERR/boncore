const TR_TIMEZONE = 'Europe/Istanbul';

function parseDateSafe(input: Date | string | number): Date {
  if (input instanceof Date) return input;
  if (typeof input === 'number') return new Date(input);
  const raw = String(input || '').trim();
  if (!raw) return new Date(NaN);
  // Treat naive ISO/SQL timestamps ("YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS") as UTC
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;
  return new Date(normalized);
}

/**
 * Returns YYYY-MM-DD in Europe/Istanbul timezone (avoids UTC midnight drift).
 */
export function getTRDateString(input: Date | string | number = new Date()): string {
  const dt = parseDateSafe(input);
  if (Number.isNaN(dt.getTime())) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TR_TIMEZONE }).format(new Date());
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: TR_TIMEZONE }).format(dt);
}

export function formatTRDate(input: Date | string | number): string {
  const dt = parseDateSafe(input);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('tr-TR', { timeZone: TR_TIMEZONE });
}

export function formatTRTime(input: Date | string | number): string {
  const dt = parseDateSafe(input);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('tr-TR', { timeZone: TR_TIMEZONE, hour: '2-digit', minute: '2-digit' });
}

export function formatTRDateTime(input: Date | string | number): string {
  const dt = parseDateSafe(input);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('tr-TR', { timeZone: TR_TIMEZONE });
}

export function formatCurrencyTRY(amount: number | string | null | undefined): string {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return '₺0,00';
  return `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
