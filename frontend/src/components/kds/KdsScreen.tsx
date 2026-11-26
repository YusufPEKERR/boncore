import React, { useState, useEffect } from 'react';
import { 
  Utensils, Flame, Wine, Cake, Clock, CheckCircle2, 
  AlertCircle, RefreshCw, Bell, Settings, Filter, ArrowUpDown 
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';
import { extractCourseFromNote, extractSeatFromNote } from '../../services/competitorFeatures';
import { useWebSocket } from '../../services/websocket';
import { KitchenGroupItem } from './KitchenGroupsDefinitions';

interface KdsScreenProps {
  onNavigateTab?: (tab: string) => void;
}

const DEFAULT_STATIONS = [
  { id: 'kitchen', label: 'Mutfak' },
  { id: 'grill', label: 'Izgara' },
  { id: 'bar', label: 'Bar' },
  { id: 'pastry', label: 'Tatlı' },
];

export const KdsScreen: React.FC<KdsScreenProps> = ({ onNavigateTab }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [station, setStation] = useState<string>('all');
  const [stationTabs, setStationTabs] = useState<Array<{ id: string; label: string }>>(DEFAULT_STATIONS);
  const [stageFilter, setStageFilter] = useState<'all' | 'preparing' | 'ready'>('preparing');
  const [sortAZ, setSortAZ] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [kdsError, setKdsError] = useState<string | null>(null);
  const [approvingItemId, setApprovingItemId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  const loadStationTabs = async () => {
    try {
      const groups: KitchenGroupItem[] = await api.getKitchenGroups();
      if (Array.isArray(groups) && groups.length > 0) {
        const activeOnes = groups
          .filter(g => g.is_active !== false)
          .map(g => ({ id: g.code || String(g.id), label: g.name }));
        setStationTabs(activeOnes.length > 0 ? activeOnes : DEFAULT_STATIONS);
      }
    } catch {
      setStationTabs(DEFAULT_STATIONS);
    }
  };

  useEffect(() => {
    loadStationTabs();
  }, []);

  useWebSocket('all', (type) => {
    if (type === 'KITCHEN_GROUPS_UPDATED') {
      loadStationTabs();
    } else if (type === 'OUT_OF_STOCK_ORDER_ALERT') {
      sound.warning();
      loadKdsOrders();
    } else if (
      type === 'KDS_NEW_ORDER' ||
      type === 'KDS_ORDER_PREPAID' ||
      type === 'KDS_HOLD_FIRE_TOGGLED' ||
      type === 'KDS_ITEMS_ADDED' ||
      type === 'KDS_ITEM_VOIDED' ||
      type === 'KDS_ORDER_READY_ALL' ||
      type === 'ORDER_UPDATED' ||
      type === 'ORDER_PAID' ||
      type === 'STOCK_APPROVAL_RESOLVED' ||
      type === 'KDS_ITEM_STATUS_CHANGED'
    ) {
      loadKdsOrders();
    }
  });

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
      setKdsError(null);
    } catch (e: any) {
      console.warn('Failed to load KDS orders', e);
      setKdsError(e?.message || 'Mutfak siparişleri yüklenemedi.');
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
      setKdsError(null);
      await loadKdsOrders();
    } catch (e: any) {
      sound.warning();
      setKdsError(e?.message || 'Ürün durumu güncellenemedi.');
    }
  };

  const handleApproveNegativeStock = async (itemId: number) => {
    sound.beep();
    setApprovingItemId(itemId);
    try {
      await api.approveOutOfStockItem(itemId, 'Mutfak KDS');
      sound.kitchenBell();
      setKdsError(null);
      await loadKdsOrders();
    } catch (e: any) {
      sound.warning();
      setKdsError(e?.message || 'Eksi stok onayı verilemedi.');
    } finally {
      setApprovingItemId(null);
    }
  };

  const handleReadyAll = async (orderId: number) => {
    sound.kitchenBell();
    try {
      await api.markKdsOrderReadyAll(orderId);
      setKdsError(null);
      await loadKdsOrders();
    } catch (e: any) {
      sound.warning();
      setKdsError(e?.message || 'Sipariş hazır olarak işaretlenemedi.');
    }
  };

  // Format dynamic elapsed time
  const getElapsedFormatted = (createdAtStr?: string) => {
    if (!createdAtStr) return '00:00';
    const normalized = /[Zz]|[+-]\d{2}:\d{2}$/.test(createdAtStr) ? createdAtStr : `${createdAtStr}Z`;
    const start = new Date(normalized).getTime();
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
              ...stationTabs,
            ].map(st => (
              <button
                key={st.id}
                onClick={() => { sound.beep(); setStation(st.id); }}
                className={`px-2.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                  station === st.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => { sound.beep(); onNavigateTab('kitchen_groups'); }}
              title="Mutfak Gruplarını (KDS İstasyonlarını) Yönet"
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shrink-0"
            >
              <Settings className="w-3.5 h-3.5 text-brand-500" />
              <span>Mutfak Grupları</span>
            </button>
          )}

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

      {/* KDS Error Banner */}
      {kdsError && (
        <div className="mx-3 sm:mx-6 mt-3 px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs font-bold flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{kdsError}</span>
          </div>
          <button type="button" onClick={() => setKdsError(null)} className="underline cursor-pointer">Kapat</button>
        </div>
      )}

      {/* Order Cards Grid */}
      <div className="flex-1 overflow-y-auto md:overflow-x-auto p-3 sm:p-6 pb-28 flex flex-col md:flex-row gap-4 sm:gap-5 bg-slate-100 dark:bg-slate-950">
        {processedOrders.map((o) => {
          const isAllReady = o.items.every((it: any) => it.status === 'ready' || it.status === 'served');
          const isPrepaid = Boolean(
            o.is_prepaid || (Number(o.paid_total || 0) > 0 && Number(o.remaining_total ?? 1) <= 0.01)
          );
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
              <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-2.5 py-1 rounded font-mono font-extrabold text-[11px] shadow-sm text-white ${
                    isAllReady ? 'bg-emerald-600' : 'bg-[#338d35]'
                  }`}>
                    {isAllReady ? 'Tamamlandı' : 'Hazırlanıyor'} {getElapsedFormatted(o.created_at)}
                  </span>
                  {isPrepaid && (
                    <span className="px-2 py-1 rounded bg-emerald-600 text-white font-black text-[10px] shadow-sm">
                      ✓ ÖN ÖDEME ALINDI
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 font-semibold">{o.order_no}</span>
              </div>

              {o.notes && String(o.notes).trim() !== '' && (
                <div className="mx-3.5 mt-2.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-900 dark:text-amber-200">
                  <span className="font-black uppercase text-[10px] tracking-wide mr-1.5">Müşteri Notu:</span>
                  <span className="font-semibold">{o.notes}</span>
                </div>
              )}

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
                {o.items.map((it: any) => {
                  const isReady = it.status === 'ready' || it.status === 'served';
                  const isStockConfirm =
                    it.status === 'stock_confirm' ||
                    it.kds_status === 'stock_confirm' ||
                    Boolean(it.requires_stock_approval) ||
                    Boolean(it.kitchen_note && String(it.kitchen_note).includes('[STOK YOK - ONAY BEKLİYOR]'));
                  return (
                    <div
                      key={it.id}
                      className={`p-3 rounded-xl border flex flex-col gap-2 transition ${
                        isStockConfirm
                          ? 'border-rose-400 dark:border-rose-600 bg-rose-50/90 dark:bg-rose-950/30 ring-1 ring-rose-500/30'
                          : isReady
                            ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white">
                            <span className="font-black mr-1.5">{Number.isInteger(Number(it.quantity)) ? `${it.quantity}x` : `${Number(Number(it.quantity).toFixed(3))} Kg`}</span>
                            <span className="uppercase">{it.product_name}</span>
                          </div>
                          {it.variant_name && (
                            <div className="text-[10px] text-slate-500">{it.variant_name}</div>
                          )}
                          {(Number(it.course_stage) > 1 || extractCourseFromNote(it.kitchen_note) || extractSeatFromNote(it.kitchen_note)) && (
                            <div className="flex items-center gap-1 flex-wrap mt-0.5">
                              {(Number(it.course_stage) > 1 || extractCourseFromNote(it.kitchen_note)) && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 text-[10px] font-black">
                                  {extractCourseFromNote(it.kitchen_note) || `${it.course_stage}. Servis`}
                                </span>
                              )}
                              {extractSeatFromNote(it.kitchen_note) && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold">
                                  🪑 {extractSeatFromNote(it.kitchen_note)}
                                </span>
                              )}
                            </div>
                          )}
                          {it.kitchen_note && (
                            <div className="text-[10px] text-blue-600 dark:text-blue-400 italic">Not: {it.kitchen_note}</div>
                          )}
                        </div>

                        {!isStockConfirm && (
                          <button
                            onClick={() => handleProgressItem(it.id, it.status)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm shrink-0 ${
                              it.status === 'served'
                                ? 'bg-slate-600 text-white'
                                : isReady
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white hover:bg-slate-100'
                            }`}
                          >
                            {it.status === 'served' ? 'Servis Edildi' : isReady ? 'Hazırlandı' : 'Hazır'}
                          </button>
                        )}
                      </div>

                      {isStockConfirm && (
                        <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-rose-300 dark:border-rose-700 space-y-2">
                          <div className="flex items-start gap-1.5 text-[11px] font-extrabold text-rose-700 dark:text-rose-300 leading-snug">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Müşteri bu ürünü istedi ama stok yok! Devam edilsin mi?</span>
                          </div>
                          <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                            Onaylarsanız stok eksiye (-) düşecektir (0 → -{Number(it.quantity || 1)}).
                          </div>
                          <button
                            type="button"
                            disabled={approvingItemId === it.id}
                            onClick={() => handleApproveNegativeStock(it.id)}
                            className="w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black text-xs shadow-sm transition cursor-pointer"
                          >
                            {approvingItemId === it.id ? 'Onaylanıyor...' : 'Yine de Devam Et'}
                          </button>
                        </div>
                      )}
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

