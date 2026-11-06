import React from 'react';
import { Utensils, X, ArrowRight, Clock } from 'lucide-react';
import { KitchenReadyAlertItem } from '../tables/KitchenAlertsModal';

interface KitchenReadyBannerProps {
  alerts: KitchenReadyAlertItem[];
  onDismiss: (id: string) => void;
  onOpenTablePos: (tableId?: number | null, tableName?: string) => void;
}

export const KitchenReadyBanner: React.FC<KitchenReadyBannerProps> = ({
  alerts,
  onDismiss,
  onOpenTablePos
}) => {
  if (!alerts || alerts.length === 0) return null;

  // Show up to 3 most recent alerts
  const visibleAlerts = alerts.slice(0, 3);

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-3 flex flex-col gap-2 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
      {visibleAlerts.map((alt) => (
        <div
          key={alt.id}
          className="pointer-events-auto bg-slate-900/95 dark:bg-black/95 text-white border-2 border-emerald-500 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md flex flex-col gap-2 ring-4 ring-emerald-500/20"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <Utensils className="w-3.5 h-3.5" />
                Mutfak Siparişi Hazır!
              </span>
            </div>

            <div className="flex items-center gap-2">
              {alt.ready_at && (
                <span className="text-[10px] text-slate-400 font-mono flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {alt.ready_at}
                </span>
              )}
              <button
                onClick={() => onDismiss(alt.id)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="text-base font-black text-white">
              {alt.table_name}
              {alt.order_no && (
                <span className="ml-2 text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded font-normal">
                  #{alt.order_no}
                </span>
              )}
            </div>
            {alt.waiter_name && (
              <span className="text-[11px] text-slate-400 font-medium truncate">
                Garson: <b className="text-slate-200">{alt.waiter_name}</b>
              </span>
            )}
          </div>

          <div className="bg-emerald-950/60 border border-emerald-500/30 rounded-xl p-2 text-xs font-bold text-emerald-200">
            🍽️ {alt.items_summary}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => { onOpenTablePos(alt.table_id, alt.table_name); onDismiss(alt.id); }}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs flex items-center gap-1.5 transition shadow cursor-pointer"
            >
              <span>Masayı Aç</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDismiss(alt.id)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Tamam
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
