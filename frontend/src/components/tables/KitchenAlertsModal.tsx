import React from 'react';
import { X, Utensils, Clock, ArrowRight, CheckCircle, Trash2 } from 'lucide-react';

export interface KitchenReadyAlertItem {
  id: string;
  order_id: number;
  order_no?: string;
  table_id?: number | null;
  table_name: string;
  waiter_name?: string;
  items_summary: string;
  message?: string;
  ready_at?: string;
  timestamp?: number;
}

export const KitchenAlertsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  alerts: KitchenReadyAlertItem[];
  onDismiss: (alertId: string) => void;
  onDismissAll: () => void;
  onOpenTablePos?: (tableId?: number | null, tableName?: string) => void;
}> = ({ isOpen, onClose, alerts, onDismiss, onDismissAll, onOpenTablePos }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none font-sans animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-500/40 rounded-3xl p-6 w-full max-w-lg shadow-2xl text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Utensils className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Mutfaktan Hazır Siparişler</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Garsonların masaya servis etmesi gereken hazır ürünler</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {alerts.length > 0 && (
          <div className="flex justify-end mb-2">
            <button
              onClick={onDismissAll}
              className="text-[11px] font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Tümünü Temizle</span>
            </button>
          </div>
        )}

        <div className="space-y-2.5 max-h-80 overflow-y-auto mb-4 pr-1">
          {alerts.map((alt) => (
            <div key={alt.id} className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-black text-base text-slate-900 dark:text-white">{alt.table_name}</span>
                  {alt.order_no && (
                    <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded font-bold">
                      #{alt.order_no}
                    </span>
                  )}
                  {alt.ready_at && (
                    <span className="text-[11px] text-slate-400 font-mono flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {alt.ready_at}
                    </span>
                  )}
                </div>

                <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mt-1">
                  🍽️ {alt.items_summary}
                </div>

                {alt.waiter_name && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Garson: <span className="font-semibold text-slate-700 dark:text-slate-300">{alt.waiter_name}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {onOpenTablePos && (
                  <button
                    onClick={() => { onOpenTablePos(alt.table_id, alt.table_name); onClose(); }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-extrabold text-white shadow-sm flex items-center gap-1 transition cursor-pointer"
                  >
                    <span>Masaya Git</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onDismiss(alt.id)}
                  className="p-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                  title="Servis Edildi / Kaldır"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </button>
              </div>
            </div>
          ))}

          {alerts.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs font-semibold">
              <Utensils className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2 opacity-40" />
              Şu anda mutfakta bekleyen hazır sipariş bulunmuyor.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
