import React, { useState, useEffect } from 'react';
import { 
  Utensils, Flame, Wine, Cake, Clock, CheckCircle2, 
  AlertCircle, RefreshCw, Bell, Settings, Filter 
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

export const KdsScreen: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [station, setStation] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadKdsOrders();
    const interval = setInterval(loadKdsOrders, 5000);
    return () => clearInterval(interval);
  }, [station]);

  const loadKdsOrders = async () => {
    try {
      const data = await api.getKdsOrders(station);
      setOrders(data);
    } catch (e) {
      console.warn('Failed to load KDS orders', e);
    } finally {
      setLoading(false);
    }
  };

  const handleProgressItem = async (itemId: number, currentStatus: string) => {
    sound.beep();
    try {
      await api.progressKdsItem(itemId, currentStatus);
      await loadKdsOrders();
    } catch (e) {
      sound.warning();
    }
  };

  const handleReadyAll = async (orderId: number) => {
    sound.kitchenBell();
    try {
      await api.markKdsOrderReadyAll(orderId);
      await loadKdsOrders();
    } catch (e) {
      sound.warning();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden font-sans">
      {/* Top Toolbar (Matching Adisyo Frame 140: A-Z Sırala, Hazırlanıyor Aşaması, Ayarlar) */}
      <div className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white">Mutfak Ekranı (KDS)</h1>
          </div>

          {/* Quick Filter Buttons */}
          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
            <button className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 transition">
              A-Z Sırala
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-[#2c3e50] text-white transition">
              Hazırlanıyor Aşaması
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 transition">
              Hazırlanan Siparişler
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.beep(); loadKdsOrders(); }}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Ayarlar"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Order Cards Grid (Matching Adisyo Frame 140) */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-5 bg-slate-100 dark:bg-slate-950">
        {orders.map((o) => {
          return (
            <div
              key={o.order_id}
              className="w-80 md:w-96 flex-shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col justify-between overflow-hidden"
            >
              {/* Card Header (Frame 140: Yellow icon + MEHMETABİ / 103 + LOCA / Masa + [Tümü Hazır]) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-xs flex-shrink-0 border border-amber-200">
                    <Utensils className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-black text-sm text-slate-900 dark:text-white uppercase">
                      {o.waiter_name || 'MEHMETABİ'} / #{o.order_id}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {o.table_name}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleReadyAll(o.order_id)}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 font-bold text-xs shadow-sm transition"
                >
                  Tümü Hazır
                </button>
              </div>

              {/* Time Badge Row (Frame 140: Hazırlanıyor 00:57:38 in red pill) */}
              <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="px-2.5 py-1 rounded bg-[#c0392b] text-white font-mono font-extrabold text-[11px] shadow-sm">
                  Hazırlanıyor {o.elapsed_minutes || '00'}:57:38
                </span>
                <span className="text-[11px] text-slate-400 font-semibold">{o.order_no}</span>
              </div>

              {/* Items List (Frame 140) */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
                {o.items.map((it: any) => {
                  const isReady = it.status === 'ready';
                  return (
                    <div
                      key={it.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          <span className="font-black mr-1.5">{it.quantity}</span>
                          <span className="uppercase">{it.product_name}</span>
                        </div>
                        {it.variant_name && (
                          <div className="text-[10px] text-slate-500">{it.variant_name}</div>
                        )}
                        {it.kitchen_note && (
                          <div className="text-[10px] text-blue-600 italic">Not: {it.kitchen_note}</div>
                        )}
                      </div>

                      <button
                        onClick={() => handleProgressItem(it.id, it.status)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${
                          isReady
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white hover:bg-slate-100'
                        }`}
                      >
                        {isReady ? 'Hazırlandı' : 'Hazır'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {orders.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs w-full">
            <Utensils className="w-8 h-8 mb-2 opacity-30" />
            <span>Bekleyen mutfak siparişi bulunmuyor.</span>
          </div>
        )}
      </div>
    </div>
  );
};
