import React, { useEffect, useState } from 'react';

interface ElapsedTimerProps {
  startIso?: string | null;
  fallback?: string;
}

export function formatElapsedSince(startIso?: string | null, nowMs: number = Date.now(), fallback: string = '00:00'): string {
  if (!startIso) return fallback;
  const normalized = /[Zz]|[+-]\d{2}:\d{2}$/.test(startIso) ? startIso : `${startIso}Z`;
  const start = new Date(normalized).getTime();
  if (Number.isNaN(start)) return fallback;

  const diffSec = Math.max(0, Math.floor((nowMs - start) / 1000));
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} gün`);
    parts.push(`${hours} saat`);
  } else if (hours > 0) {
    parts.push(`${hours} saat`);
  }
  parts.push(`${mins} dk`);
  parts.push(`${String(secs).padStart(2, '0')} sn`);
  return parts.join(' ');
}

export const ElapsedTimer: React.FC<ElapsedTimerProps> = React.memo(({ startIso, fallback = 'Yeni Açıldı' }) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!startIso) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startIso]);

  return <>{formatElapsedSince(startIso, nowMs, fallback)}</>;
});
