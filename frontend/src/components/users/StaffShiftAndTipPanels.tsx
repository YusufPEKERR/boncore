import React, { useMemo, useState } from 'react';
import { Clock, Coffee, DollarSign, LogIn, LogOut, CheckCircle2, Coins } from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';
import {
  StaffShiftRecord,
  TipDistributionRecord,
  getStaffShifts,
  getTipDistributions,
  saveTipDistribution,
  updateStaffShiftStatus,
} from '../../services/competitorFeatures';

interface StaffShiftAndTipPanelsProps {
  activeSubView: 'shifts' | 'tips';
  staffList: StaffUser[];
}

const ROLE_WEIGHTS: Record<string, number> = {
  manager: 1.5,
  chef: 1.4,
  waiter: 1.3,
  cashier: 1.2,
  kitchen: 1.0,
  courier: 1.0,
};

export const StaffShiftAndTipPanels: React.FC<StaffShiftAndTipPanelsProps> = ({
  activeSubView,
  staffList,
}) => {
  const [shiftsMap, setShiftsMap] = useState<Record<number, StaffShiftRecord>>(() => getStaffShifts());
  const [tipHistory, setTipHistory] = useState<TipDistributionRecord[]>(() => getTipDistributions());
  const [cashTipInput, setCashTipInput] = useState<string>('0');
  const [cardTipInput, setCardTipInput] = useState<string>('0');
  const [splitMethod, setSplitMethod] = useState<'hours' | 'role'>('role');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const totalPoolAmount = Math.max(0, (Number(cashTipInput) || 0) + (Number(cardTipInput) || 0));

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleShiftAction = (u: StaffUser, nextStatus: 'working' | 'break' | 'off') => {
    sound.beep();
    updateStaffShiftStatus(u.id, u.name, u.role, nextStatus);
    setShiftsMap({ ...getStaffShifts() });
    const label = nextStatus === 'working' ? 'Vardiyaya Başladı' : nextStatus === 'break' ? 'Molaya Çıktı' : 'Mesaiyi Kapattı';
    notify(`${u.name}: ${label}`);
  };

  const previewShares = useMemo(() => {
    const amount = totalPoolAmount;
    const activeMembers = staffList.filter((u) => u.is_active !== false);
    if (activeMembers.length === 0 || amount <= 0) return [];

    const weighted = activeMembers.map((u) => {
      const shift = shiftsMap[u.id];
      const baseHours = Math.max(1, shift ? Number(shift.accumulatedMinutes || 480) / 60 : 8);
      const weight = splitMethod === 'hours' ? Number(baseHours.toFixed(2)) : (ROLE_WEIGHTS[u.role] ?? 1.0);
      return { u, weight, hours: baseHours };
    });

    const totalWeight = weighted.reduce((sum, x) => sum + x.weight, 0);
    return weighted.map((x) => ({
      userId: x.u.id,
      name: x.u.name,
      role: x.u.role,
      hours: x.hours,
      weight: x.weight,
      payout: Number(((amount * x.weight) / Math.max(0.01, totalWeight)).toFixed(2)),
    }));
  }, [totalPoolAmount, splitMethod, staffList, shiftsMap]);

  const handleSaveTipPool = () => {
    const cashTip = Math.max(0, Number(cashTipInput) || 0);
    const cardTip = Math.max(0, Number(cardTipInput) || 0);
    const amount = Number((cashTip + cardTip).toFixed(2));
    if (!Number.isFinite(amount) || amount <= 0 || previewShares.length === 0) {
      sound.warning();
      return;
    }
    sound.cashDrawer();
    saveTipDistribution({
      cashTip: Number(cashTip.toFixed(2)),
      cardTip: Number(cardTip.toFixed(2)),
      totalPool: amount,
      method: splitMethod,
      shares: previewShares.map((s) => ({
        userId: s.userId,
        name: s.name,
        role: s.role,
        weight: s.weight,
        payout: s.payout,
      })),
    });
    setTipHistory(getTipDistributions());
    notify(`₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} bahşiş havuzu ${previewShares.length} personele dağıtıldı.`);
  };

  return (
    <div className="space-y-5">
      {toastMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-600 text-white text-xs font-black flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {activeSubView === 'shifts' ? (
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Personel Vardiya Giriş / Çıkış &amp; Mola Puantajı
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Garson, mutfak ve kasa ekiplerinin vardiya başlangıç, mola ve günlük çalışma sürelerini yönetin
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {staffList.map((u) => {
              const rec = shiftsMap[u.id];
              const status = rec?.status || 'off';
              const mins = rec?.accumulatedMinutes || 0;
              return (
                <div
                  key={u.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-black text-sm text-slate-900 dark:text-white">{u.name}</div>
                      <div className="text-[11px] font-bold text-slate-500 uppercase">{u.role}</div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-black border ${
                        status === 'working'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : status === 'break'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {status === 'working' ? '● Vardiyada' : status === 'break' ? '☕ Molada' : '○ Mesai Dışı'}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>Bugünkü Toplam Süre:</span>
                    <span className="font-mono font-black text-slate-800 dark:text-slate-200">
                      {Math.floor(mins / 60)} sa {mins % 60} dk
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleShiftAction(u, 'working')}
                      className="py-1.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <LogIn className="w-3 h-3" /> Giriş
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShiftAction(u, 'break')}
                      className="py-1.5 px-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Coffee className="w-3 h-3" /> Mola
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShiftAction(u, 'off')}
                      className="py-1.5 px-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" /> Çıkış
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Bahşiş Havuzu (Tip Pool) Dağıtımı</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Günlük toplanan nakit/kart bahşişleri çalışma saati veya rol katsayısına göre dağıtın
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Nakit Bahşiş (₺)</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={cashTipInput}
                    onChange={(e) => setCashTipInput(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-base font-black font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Kart / POS Bahşişi (₺)</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={cardTipInput}
                    onChange={(e) => setCardTipInput(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-base font-black font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/70 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Toplam Havuz:</span>
                <span className="font-mono font-black text-slate-900 dark:text-white">
                  ₺{totalPoolAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Dağıtım Yöntemi</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSplitMethod('role')}
                    className={`py-2 px-3 rounded-xl text-xs font-black border cursor-pointer ${
                      splitMethod === 'role'
                        ? 'bg-brand-600 text-white border-brand-500'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    Rol Puanına Göre
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitMethod('hours')}
                    className={`py-2 px-3 rounded-xl text-xs font-black border cursor-pointer ${
                      splitMethod === 'hours'
                        ? 'bg-brand-600 text-white border-brand-500'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    Çalışma Saatine Göre
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveTipPool}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <DollarSign className="w-4 h-4" /> Bahşiş Havuzunu Dağıt &amp; Kaydet
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h4 className="text-sm font-black text-slate-900 dark:text-white">Personel Pay Önizlemesi</h4>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {previewShares.map((s) => (
                <div key={s.userId} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-black text-slate-900 dark:text-white">{s.name}</span>
                    <span className="ml-2 text-slate-500 uppercase text-[10px]">
                      {s.role} • {splitMethod === 'role' ? `Katsayı ${s.weight}x` : `${s.hours.toFixed(1)} sa`}
                    </span>
                  </div>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                    ₺{s.payout.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>

            {tipHistory.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <h5 className="text-xs font-black text-slate-500 uppercase">Son Dağıtım Geçmişi</h5>
                {tipHistory.slice(0, 3).map((rec) => (
                  <div
                    key={rec.id}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-[11px] flex justify-between"
                  >
                    <span className="font-bold">
                      {rec.createdAt} • {rec.method === 'role' ? 'Rol Katsayılı' : 'Saat Bazlı'}
                    </span>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                      ₺{rec.totalPool.toLocaleString('tr-TR')} ({rec.shares.length} Kişi)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
