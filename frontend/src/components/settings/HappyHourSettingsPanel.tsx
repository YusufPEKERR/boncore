import React, { useEffect, useState } from 'react';
import { Clock, Plus, Sparkles, Trash2 } from 'lucide-react';
import { sound } from '../../services/sound';
import {
  COMPETITOR_EVENT,
  HappyHourRule,
  getHappyHourRules,
  isTimeWithinRange,
  saveHappyHourRules,
} from '../../services/competitorFeatures';

export const HappyHourSettingsPanel: React.FC = () => {
  const [rules, setRules] = useState<HappyHourRule[]>(() => getHappyHourRules());
  const [title, setTitle] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('15:00');
  const [endTime, setEndTime] = useState<string>('18:00');
  const [discountPercent, setDiscountPercent] = useState<number>(20);
  const [categoryFilter, setCategoryFilter] = useState<string>('İçecekler');
  const [daysLabel, setDaysLabel] = useState<string>('Hafta İçi');

  useEffect(() => {
    const sync = () => setRules(getHappyHourRules());
    window.addEventListener(COMPETITOR_EVENT, sync);
    return () => window.removeEventListener(COMPETITOR_EVENT, sync);
  }, []);

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    sound.beep();
    const next: HappyHourRule[] = [
      ...rules,
      {
        id: 'hh-' + Date.now(),
        title: title.trim(),
        startTime,
        endTime,
        discountPercent: Math.max(1, Math.min(90, Number(discountPercent) || 10)),
        daysLabel: daysLabel.trim() || 'Her Gün',
        categoryFilter: categoryFilter.trim() || 'Tümü',
        isActive: false,
      },
    ];
    saveHappyHourRules(next);
    setRules(next);
    setTitle('');
  };

  const handleToggleRule = (id: string) => {
    sound.beep();
    const next = rules.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r));
    saveHappyHourRules(next);
    setRules(next);
  };

  const handleDeleteRule = (id: string) => {
    sound.beep();
    const next = rules.filter((r) => r.id !== id);
    saveHappyHourRules(next);
    setRules(next);
  };

  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-amber-300/70 dark:border-amber-800/60 shadow-xl space-y-5 mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              Mutlu Saatler (Happy Hour) &amp; Zamanlı Kampanyalar
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Belirlediğiniz saat aralıklarında POS terminalinde otomatik veya tek tıkla Happy Hour indirimi uygulayın
            </p>
          </div>
        </div>
        <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 self-start">
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          <span>Şu an: {hhmm}</span>
        </div>
      </div>

      <form onSubmit={handleAddRule} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-end bg-slate-50 dark:bg-slate-950/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="lg:col-span-2">
          <label className="text-[11px] font-bold text-slate-500 block mb-1">Kampanya Adı</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Örn: Akşamüzeri Kahve Saati"
            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
            required
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-500 block mb-1">Başlangıç</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-500 block mb-1">Bitiş</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-500 block mb-1">İndirim (%)</label>
          <input
            type="number"
            min="1"
            max="90"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(Number(e.target.value))}
            className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-black text-slate-900 dark:text-white"
          />
        </div>
        <div>
          <button
            type="submit"
            className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Kural Ekle
          </button>
        </div>
        <div className="sm:col-span-1 lg:col-span-3">
          <label className="text-[11px] font-bold text-slate-500 block mb-1">Geçerli Günler</label>
          <input
            type="text"
            value={daysLabel}
            onChange={(e) => setDaysLabel(e.target.value)}
            placeholder="Her Gün / Hafta İçi"
            className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
          />
        </div>
        <div className="sm:col-span-1 lg:col-span-3">
          <label className="text-[11px] font-bold text-slate-500 block mb-1">Kategori Filtresi</label>
          <input
            type="text"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            placeholder="Tümü / İçecekler / Kahve"
            className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
          />
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rules.map((rule) => {
          const isLive = rule.isActive && isTimeWithinRange(hhmm, rule.startTime, rule.endTime);
          return (
            <div
              key={rule.id}
              className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                isLive
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-700'
                  : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-xs text-slate-900 dark:text-white truncate">{rule.title}</span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-black">
                    %{rule.discountPercent}
                  </span>
                  {isLive && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-black animate-pulse">
                      ŞU AN AKTİF
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 flex flex-wrap gap-2">
                  <span className="font-mono font-bold">{rule.startTime} - {rule.endTime}</span>
                  <span>• {rule.daysLabel}</span>
                  <span>• {rule.categoryFilter}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleRule(rule.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black cursor-pointer ${
                    rule.isActive
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {rule.isActive ? 'Aktif' : 'Pasif'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteRule(rule.id)}
                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                  title="Kuralı Sil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
