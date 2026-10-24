import React, { useState, useEffect } from 'react';
import { 
  Utensils, Flame, Wine, Cake, Clock, CheckCircle2, 
  AlertCircle, RefreshCw, Bell, Settings, Filter, ArrowUpDown 
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

export const KdsScreen: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [station, setStation] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<'all' | 'preparing' | 'ready'>('preparing');
  const [sortAZ, setSortAZ] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Tick timer every second for live elapsed display
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
      const nextStatus = (currentStatus === 'ready' || currentStatus === 'hazirlandi' || currentStatus === 'hazir')
        ? 'served'
        : 'ready';
      await api.progressKdsItem(itemId, nextStatus);
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

  // Format dynamic elapsed time
  const getElapsedFormatted = (createdAtStr?: string) => {
    if (!createdAtStr) return '00:00';
    const start = new Date(createdAtStr).getTime();
    if (isNaN(start)) return '00:00';
    const diffSec = Math.max(0, Math.floor((currentTime - start) / 1000));
    const hours = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Filter and sort orders
  const processedOrders = orders
    .filter(o => {
      if (stageFilter === 'all') return true;
      const allReady = o.items.every((it: any) => it.status === 'ready' || it.status === 'served');
      if (stageFilter === 'ready') return allReady;
      if (stageFilter === 'preparing') return !allReady;
      return true;
    })
    .sort((a, b) => {
      if (sortAZ) {
        return (a.table_name || '').localeCompare(b.table_name || '');
      }
      return (a.order_id || 0) - (b.order_id || 0);
    });

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden font-sans">
      {/* Top Toolbar */}
      <div className="min-h-14 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 flex flex-wrap items-center justify-between gap-2 shadow-sm shrink-0">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full lg:w-auto justify-between lg:justify-start">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">Mutfak Ekranı (KDS)</h1>
          </div>

          <button
            onClick={() => { sound.beep(); loadKdsOrders(); }}
            className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Station Selector Dropdown / Pills */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold gap-1 overflow-x-auto max-w-full no-scrollbar">
            {[
              { id: 'all', label: 'Tümü' },
              { id: 'kitchen', label: 'Mutfak' },
              { id: 'grill', label: 'Izgara' },
              { id: 'bar', label: 'Bar' },
              { id: 'pastry', label: 'Tatlı' },
            ].map(st => (
              <button
                key={st.id}
                onClick={() => { sound.beep(); setStation(st.id); }}
                className={`px-2.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 ${
                  station === st.id
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Quick Filter Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 overflow-x-auto max-w-full no-scrollbar">
            <button 
              onClick={() => { sound.beep(); setSortAZ(!sortAZ); }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1 transition whitespace-nowrap shrink-0 ${
                sortAZ 
                  ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' 
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200'
              }`}
            >
              <ArrowUpDown className="w-3 h-3" />
              <span>A-Z {sortAZ && '✓'}</span>
            </button>
            <button 
              onClick={() => { sound.beep(); setStageFilter('preparing'); }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 ${
                stageFilter === 'preparing' 
                  ? 'bg-[#2c3e50] text-white shadow-sm' 
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200'
              }`}
            >
              Hazırlanıyor
            </button>
            <button 
              onClick={() => { sound.beep(); setStageFilter('ready'); }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 ${
                stageFilter === 'ready' 
                  ? 'bg-[#27ae60] text-white shadow-sm' 
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200'
              }`}
            >
              Hazır
            </button>
            <button 
              onClick={() => { sound.beep(); setStageFilter('all'); }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 ${
                stageFilter === 'all' 
                  ? 'bg-slate-700 text-white shadow-sm' 
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200'
              }`}
            >
              Tümü
            </button>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2">
          <button
            onClick={() => { sound.beep(); loadKdsOrders(); }}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Order Cards Grid */}
      <div className="flex-1 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden p-3 sm:p-6 flex flex-col md:flex-row gap-4 sm:gap-5 bg-slate-100 dark:bg-slate-950">
        {processedOrders.map((o) => {
          const isAllReady = o.items.every((it: any) => it.status === 'ready' || it.status === 'served');
          return (
            <div
              key={o.order_id}
              className={`w-full md:w-80 lg:w-96 flex-shrink-0 bg-white dark:bg-slate-900 border rounded-2xl shadow-sm flex flex-col justify-between overflow-hidden transition-all ${
                isAllReady 
                  ? 'border-emerald-400 dark:border-emerald-600/60 ring-2 ring-emerald-500/20' 
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              {/* Card Header */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 border ${
                    isAllReady ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-600 border-amber-200'
                  }`}>
                    {isAllReady ? <CheckCircle2 className="w-5 h-5" /> : <Utensils className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-black text-sm text-slate-900 dark:text-white uppercase">
                      {o.waiter_name || 'GARSON'} / #{o.order_id}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {o.table_name}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleReadyAll(o.order_id)}
                  className={`px-3 py-1.5 rounded-lg border font-bold text-xs shadow-sm transition ${
                    isAllReady
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {isAllReady ? 'Servise Hazır' : 'Tümü Hazır'}
                </button>
              </div>

              {/* Time Badge Row */}
              <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className={`px-2.5 py-1 rounded font-mono font-extrabold text-[11px] shadow-sm text-white ${
                  isAllReady ? 'bg-emerald-600' : 'bg-[#c0392b]'
                }`}>
                  {isAllReady ? 'Tamamlandı' : 'Hazırlanıyor'} {getElapsedFormatted(o.created_at)}
                </span>
                <span className="text-[11px] text-slate-400 font-semibold">{o.order_no}</span>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
                {o.items.map((it: any) => {
                  const isReady = it.status === 'ready' || it.status === 'served';
                  return (
                    <div
                      key={it.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition ${
                        isReady
                          ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          <span className="font-black mr-1.5">{Number.isInteger(Number(it.quantity)) ? `${it.quantity}x` : `${Number(Number(it.quantity).toFixed(3))} Kg`}</span>
                          <span className="uppercase">{it.product_name}</span>
                        </div>
                        {it.variant_name && (
                          <div className="text-[10px] text-slate-500">{it.variant_name}</div>
                        )}
                        {it.kitchen_note && (
                          <div className="text-[10px] text-blue-600 dark:text-blue-400 italic">Not: {it.kitchen_note}</div>
                        )}
                      </div>

                      <button
                        onClick={() => handleProgressItem(it.id, it.status)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${
                          isReady
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
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

        {processedOrders.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs w-full">
            <Utensils className="w-8 h-8 mb-2 opacity-30" />
            <span>Seçili kriterde bekleyen mutfak siparişi bulunmuyor.</span>
          </div>
        )}
      </div>
    </div>
  );
};

