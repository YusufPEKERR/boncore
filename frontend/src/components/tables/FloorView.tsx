import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Edit3, MoreVertical, Clock, 
  ArrowRight, Merge, RefreshCw, FileText, CheckCircle, ArrowRightLeft,
  LayoutGrid, MapPin, Search, ArrowUpDown, ChevronDown, User, Hash, AlertCircle, Printer, Utensils
} from 'lucide-react';
import { Area, Table, StaffUser } from '../../types';
import { sound } from '../../services/sound';
import { MoveTableModal, MergeTableModal, TransferItemsModal } from './TableActionModals';
import { useRolePermissions } from '../../services/permissions';

interface FloorViewProps {
  areas: Area[];
  onSelectTable: (table: Table) => void;
  currentUser: StaffUser | null;
  onRefreshAreas: () => void;
  onClearBuzzer: (tableId: number) => void;
  loading?: boolean;
  floorSection?: 'tables' | 'orders';
  onFloorSectionChange?: (section: 'tables' | 'orders') => void;
}

interface OpenTableItem extends Table {
  areaName: string;
}

export const FloorView: React.FC<FloorViewProps> = ({
  areas,
  onSelectTable,
  currentUser,
  onRefreshAreas,
  onClearBuzzer,
  loading = false,
  floorSection: externalFloorSection,
  onFloorSectionChange
}) => {
  const [internalFloorSection, setInternalFloorSection] = useState<'tables' | 'orders'>(() => {
    return (localStorage.getItem('boncore_floor_section') as 'tables' | 'orders') || 'tables';
  });

  const { hasPerm } = useRolePermissions(currentUser);
  const canMoveMergeTable = hasPerm('order_table_move_merge', true);
  const canTransferItems = hasPerm('order_transfer_item', false);
  const hasAnyTableAction = canMoveMergeTable || canTransferItems;

  const currentFloorSection = externalFloorSection !== undefined ? externalFloorSection : internalFloorSection;

  const handleSetFloorSection = (section: 'tables' | 'orders') => {
    sound.beep();
    setInternalFloorSection(section);
    try {
      localStorage.setItem('boncore_floor_section', section);
    } catch {}
    if (onFloorSectionChange) {
      onFloorSectionChange(section);
    }
  };

  const [activeAreaId, setActiveAreaId] = useState<number>(() => {
    const saved = localStorage.getItem('boncore_active_area_id');
    if (saved !== null) {
      const parsed = Number(saved);
      if (!isNaN(parsed) && parsed !== 0) return parsed;
    }
    return areas[0]?.id || 1;
  });

  const [viewMode, setViewMode] = useState<'grid' | 'kroki'>(() => {
    return (localStorage.getItem('boncore_floor_view_mode') as 'grid' | 'kroki') || 'grid';
  });

  const [selectedTableForAction, setSelectedTableForAction] = useState<Table | null>(null);

  // Orders Tab Filter & Sort States
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [orderSortDirection, setOrderSortDirection] = useState<'oldest' | 'newest'>('oldest');
  const [orderAreaFilter, setOrderAreaFilter] = useState<number | 'all'>('all');

  // Modals
  const [isMoveOpen, setIsMoveOpen] = useState<boolean>(false);
  const [isMergeOpen, setIsMergeOpen] = useState<boolean>(false);
  const [isTransferItemsOpen, setIsTransferItemsOpen] = useState<boolean>(false);
  const [activeActionTableId, setActiveActionTableId] = useState<number | null>(null);
  const [currentNow, setCurrentNow] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getTableElapsedFormatted = (openedAt?: string) => {
    if (!openedAt) return 'Yeni Açıldı';
    const normalized = /[Zz]|[+-]\d{2}:\d{2}$/.test(openedAt) ? openedAt : `${openedAt}Z`;
    const start = new Date(normalized).getTime();
    if (isNaN(start)) return 'Yeni Açıldı';
    const diffSec = Math.max(0, Math.floor((currentNow - start) / 1000));
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
  };

  const getTableTimestamp = (t: Table): number => {
    const timeStr = t.active_order?.created_at || t.opened_at;
    if (!timeStr) return 0;
    const normalized = /[Zz]|[+-]\d{2}:\d{2}$/.test(timeStr) ? timeStr : `${timeStr}Z`;
    const parsed = new Date(normalized).getTime();
    return isNaN(parsed) ? 0 : parsed;
  };

  useEffect(() => {
    localStorage.setItem('boncore_active_area_id', String(activeAreaId));
  }, [activeAreaId]);

  useEffect(() => {
    localStorage.setItem('boncore_floor_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (areas.length > 0 && !areas.some(a => a.id === activeAreaId)) {
      setActiveAreaId(areas[0].id);
    }
  }, [areas]);

  const currentArea = (areas || []).find(a => a && a.id === activeAreaId) || (areas || [])[0];
  const displayedTables: Table[] = (currentArea && currentArea.tables) || [];

  // All open tables across all areas for "Siparişler" tab
  const allOpenTables: OpenTableItem[] = useMemo(() => {
    const list: OpenTableItem[] = [];
    (areas || []).forEach(area => {
      if (!area) return;
      (area.tables || []).forEach(table => {
        if (!table) return;
        const isOccupied = table.status === 'occupied' || table.status === 'bill_printed' || table.status === 'bill_requested' || table.status === 'waiter_call' || (table.active_order && (table.active_order.grand_total || 0) > 0);
        if (isOccupied) {
          list.push({
            ...table,
            areaName: area.name
          });
        }
      });
    });
    return list;
  }, [areas]);

  // Filtered and sorted open tables
  const displayedOpenTables: OpenTableItem[] = useMemo(() => {
    let result = allOpenTables;

    if (orderAreaFilter !== 'all') {
      result = result.filter(t => t.area_id === orderAreaFilter);
    }

    if (orderSearchQuery.trim()) {
      const q = orderSearchQuery.toLowerCase();
      result = result.filter(t => 
        t.name.toLowerCase().includes(q) ||
        t.areaName.toLowerCase().includes(q) ||
        (t.waiter_name && t.waiter_name.toLowerCase().includes(q)) ||
        (t.active_order?.order_no && t.active_order.order_no.toLowerCase().includes(q))
      );
    }

    // Sort by time: 'oldest' (waiting longest) vs 'newest' (opened most recently)
    return [...result].sort((a, b) => {
      const tA = getTableTimestamp(a);
      const tB = getTableTimestamp(b);
      return orderSortDirection === 'oldest' ? (tA - tB) : (tB - tA);
    });
  }, [allOpenTables, orderAreaFilter, orderSearchQuery, orderSortDirection]);

  const totalOpenRevenue = useMemo(() => {
    return allOpenTables.reduce((acc, t) => acc + (t.active_order?.grand_total || 0), 0);
  }, [allOpenTables]);

  const handleTableClick = (table: Table) => {
    sound.beep();
    onSelectTable(table);
  };

  const handleOpenActionMenu = (e: React.MouseEvent, table: Table) => {
    e.stopPropagation();
    sound.beep();
    setSelectedTableForAction(table);
    setActiveActionTableId(activeActionTableId === table.id ? null : table.id);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-950 select-none overflow-hidden transition-colors duration-200 font-sans">
      {/* Top Main Navigation: [Masalar] & [Siparişler (Açık Adisyonlar)] */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
          <button
            onClick={() => handleSetFloorSection('tables')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
              currentFloorSection === 'tables'
                ? 'bg-[#338d35] text-white shadow-sm shadow-emerald-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Masalar</span>
          </button>

          <button
            onClick={() => handleSetFloorSection('orders')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-black transition cursor-pointer relative ${
              currentFloorSection === 'orders'
                ? 'bg-[#338d35] text-white shadow-sm shadow-emerald-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Siparişler</span>
            {allOpenTables.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black ${
                currentFloorSection === 'orders'
                  ? 'bg-white text-[#338d35]'
                  : 'bg-[#338d35] text-white'
              }`}>
                {allOpenTables.length}
              </span>
            )}
          </button>
        </div>

        {/* Right tools (Refresh and Grid/Kroki if on Masalar) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {currentFloorSection === 'tables' && (
            <div className="hidden xs:flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
              <button
                onClick={() => { sound.beep(); setViewMode('grid'); }}
                className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg flex items-center gap-1 transition ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Izgara Görünümü"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Izgara</span>
              </button>
              <button
                onClick={() => { sound.beep(); setViewMode('kroki'); }}
                className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg flex items-center gap-1 transition ${
                  viewMode === 'kroki'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Kroki / Salon Planı"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden sm:inline">Kroki</span>
              </button>
            </div>
          )}

          <button
            onClick={() => { sound.beep(); onRefreshAreas(); }}
            className={`p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition ${loading ? 'animate-spin' : ''}`}
            title="Masaları Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SECTION 1: MASALAR (BÖLGELER VE IZGARA / KROKI) */}
      {currentFloorSection === 'tables' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Area Horizontal Tabs Bar */}
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-800 px-2.5 sm:px-4 flex items-center justify-between z-10 shadow-2xs overflow-x-auto shrink-0 gap-2">
            <div className="flex items-center gap-1 overflow-x-auto py-1 no-scrollbar flex-1">
              {areas.map((area) => {
                const isAreaActive = activeAreaId === area.id;
                const occupiedInArea = (area.tables || []).filter(t => t.status === 'occupied' || t.status === 'bill_printed' || t.status === 'bill_requested').length;
                const totalInArea = (area.tables || []).length;

                return (
                  <button
                    key={area.id}
                    onClick={() => { sound.beep(); setActiveAreaId(area.id); }}
                    className={`py-2 sm:py-2.5 px-2.5 sm:px-3 text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border-b-2 shrink-0 ${
                      isAreaActive
                        ? 'border-[#338d35] dark:border-emerald-400 text-slate-900 dark:text-white font-extrabold'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span className="uppercase">{area.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      isAreaActive 
                        ? 'bg-[#338d35] text-white dark:bg-emerald-600' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>
                      {occupiedInArea}/{totalInArea}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tables Grid or Static Kroki */}
          {viewMode === 'grid' ? (
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 bg-slate-50 dark:bg-slate-950">
              {loading && displayedTables.length === 0 && (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3 animate-fadeIn">
                  <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
                  <span className="text-sm font-bold">Masalar yükleniyor...</span>
                </div>
              )}

              {!loading && displayedTables.length === 0 && (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3 animate-fadeIn">
                  <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400">
                    <RefreshCw className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-black text-slate-800 dark:text-slate-200">Henüz Masa Bulunmuyor</h3>
                  <p className="text-xs text-slate-400 max-w-sm text-center">Bu bölgede henüz masa tanımlanmamış veya bağlantı bekleniyor.</p>
                  <button
                    onClick={onRefreshAreas}
                    className="mt-2 px-4 py-2 rounded-xl bg-[#338d35] hover:bg-[#28702a] text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Masaları Yenile</span>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4">
                {displayedTables.map((table) => {
                  const isOccupied = table.status === 'occupied' || table.status === 'bill_printed' || !!table.active_order;
                  const isBillRequested = table.status === 'bill_requested';
                  const isBillPrinted = table.status === 'bill_printed';
                  const isReserved = table.status === 'reserved';
                  const hasBuzzer = !!table.waiter_call_reason || table.status === 'waiter_call';
                  const hasReadyFood = !!table.has_ready_items || !!table.active_order?.has_ready_items;
                  const isMenuOpen = activeActionTableId === table.id;

                  return (
                    <div
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={`h-32 sm:h-40 rounded-2xl p-3 sm:p-4 flex flex-col justify-between cursor-pointer transition-all duration-150 pos-touch-card relative border shadow-sm hover:shadow-md ${
                        hasReadyFood
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-slate-900 dark:text-white ring-2 ring-emerald-500/40 shadow-md'
                          : hasBuzzer
                          ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-400 text-purple-900 dark:text-purple-100 animate-pulse'
                          : isBillPrinted
                          ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-400 dark:border-sky-600 text-sky-950 dark:text-sky-100 ring-2 ring-sky-400/50 shadow-md'
                          : isBillRequested
                          ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-400 text-blue-900 dark:text-blue-100'
                          : isOccupied
                          ? 'bg-[#fce8e6] dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-slate-900 dark:text-white'
                          : isReserved
                          ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900/60 text-amber-900 dark:text-amber-100'
                          : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight leading-tight">
                              {table.name}
                            </h3>
                            {hasReadyFood && (
                              <span 
                                title={`Mutfakta Servise Hazır: ${table.ready_items_summary || table.active_order?.ready_items_summary || 'Sipariş hazır'}`}
                                className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white font-black text-[9px] flex items-center gap-1 shadow-sm uppercase tracking-wide animate-pulse"
                              >
                                <Utensils className="w-2.5 h-2.5" />
                                <span>HAZIR</span>
                              </span>
                            )}
                            {isBillPrinted && (
                              <span className="px-1.5 py-0.5 rounded-md bg-sky-600 text-white font-black text-[9px] flex items-center gap-1 shadow-sm uppercase tracking-wide">
                                <Printer className="w-2.5 h-2.5" />
                                <span>YAZDIRILDI</span>
                              </span>
                            )}
                          </div>
                          {isOccupied && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mt-0.5">
                              {table.waiter_name || 'MEHMETABİ'}
                            </span>
                          )}
                        </div>

                        {hasAnyTableAction && (
                          <div className="relative">
                            <button
                              onClick={(e) => handleOpenActionMenu(e, table)}
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-black/5"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {isMenuOpen && (
                              <div 
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-6 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-20 text-xs font-semibold animate-fadeIn"
                              >
                                {canMoveMergeTable && (
                                  <>
                                    <button
                                      onClick={() => { setIsMoveOpen(true); setActiveActionTableId(null); }}
                                      className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                                    >
                                      <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
                                      <span>Masa Taşı</span>
                                    </button>
                                    <button
                                      onClick={() => { setIsMergeOpen(true); setActiveActionTableId(null); }}
                                      className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                                    >
                                      <Merge className="w-3.5 h-3.5 text-amber-500" />
                                      <span>Masa Birleştir</span>
                                    </button>
                                  </>
                                )}
                                {canTransferItems && (
                                  <button
                                    onClick={() => { setIsTransferItemsOpen(true); setActiveActionTableId(null); }}
                                    className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                                  >
                                    <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>Ürün Aktar</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="text-center my-auto">
                        {isOccupied && table.active_order ? (
                          (table.active_order.paid_total || 0) > 0 ? (
                            <div className="flex flex-col items-center">
                              <div className="text-base sm:text-lg font-black font-mono tracking-tight text-slate-900 dark:text-white">
                                <span>₺{Number(table.active_order.grand_total || 0).toFixed(2)}</span>
                                <span className="text-slate-400 font-normal mx-0.5">/</span>
                                <span className="text-emerald-600 dark:text-emerald-400">₺{Number(table.active_order.paid_total || 0).toFixed(2)}</span>
                              </div>
                              <span className="text-[10px] font-extrabold text-brand-600 dark:text-emerald-400 font-mono mt-0.5">
                                Kalan: ₺{Number(table.active_order.remaining_total !== undefined ? table.active_order.remaining_total : (table.active_order.grand_total || 0) - (table.active_order.paid_total || 0)).toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <div className="text-xl font-black text-slate-950 dark:text-white font-mono tracking-tight">
                              ₺{Number(table.active_order.grand_total || 0).toFixed(2)}
                            </div>
                          )
                        ) : isReserved ? (
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                            {table.reservation_name || 'Rezerve'}
                          </span>
                        ) : hasBuzzer ? (
                          <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                            🔔 {table.waiter_call_reason || 'Garson Çağrısı'}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                            Boş
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        {isOccupied ? (
                          <span className="font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1 truncate" title="Masa Açılış Süresi">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{getTableElapsedFormatted(table.active_order?.created_at || table.opened_at)}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">{currentArea?.name}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* STATIC KROKI VIEW */
            <div
              className="flex-1 relative overflow-auto bg-slate-100/70 dark:bg-slate-950 p-4 select-none min-h-[600px]"
              style={{
                backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                backgroundSize: '24px 24px'
              }}
            >
              <div className="absolute top-3 left-3 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs shadow-sm pointer-events-none">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {currentArea?.name} Salon Krokisi
                </span>
                <p className="text-[11px] text-slate-400">
                  Sipariş girmek veya hesap açmak için masaya dokununuz.
                </p>
              </div>

              {displayedTables.map((table) => {
                const isOccupied = table.status === 'occupied' || table.status === 'bill_printed' || !!table.active_order;
                const isBillRequested = table.status === 'bill_requested';
                const isBillPrinted = table.status === 'bill_printed';
                const isReserved = table.status === 'reserved';
                const hasBuzzer = !!table.waiter_call_reason || table.status === 'waiter_call';
                const hasReadyFood = !!table.has_ready_items || !!table.active_order?.has_ready_items;
                const isRound = table.shape === 'round';
                const posX = table.x || 50;
                const posY = table.y || 50;

                return (
                  <div
                    key={table.id}
                    onClick={() => handleTableClick(table)}
                    style={{
                      left: `${posX}px`,
                      top: `${posY}px`,
                      width: '135px',
                      height: '115px'
                    }}
                    className={`absolute flex flex-col justify-between p-3 border select-none cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-sm ${
                      isRound ? 'rounded-full text-center' : 'rounded-2xl'
                    } ${
                      hasReadyFood
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-slate-900 dark:text-white shadow-md ring-2 ring-emerald-500/50 z-20'
                        : hasBuzzer
                        ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-400 text-purple-900 dark:text-purple-100 shadow-md animate-pulse z-20'
                        : isBillPrinted
                        ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-400 dark:border-sky-600 text-sky-950 dark:text-sky-100 shadow-md ring-2 ring-sky-400/50 z-20'
                        : isBillRequested
                        ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-400 text-blue-900 dark:text-blue-100 shadow-md z-20'
                        : isOccupied
                        ? 'bg-[#fce8e6] dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-900/60 text-slate-900 dark:text-white shadow-md z-20'
                        : isReserved
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900/60 text-amber-900 dark:text-amber-100 shadow-md z-20'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-400 z-10'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 min-w-0">
                        <h4 className="font-black text-sm tracking-tight truncate leading-tight">
                          {table.name}
                        </h4>
                        {hasReadyFood && (
                          <span className="px-1 py-0.5 rounded bg-emerald-600 text-white font-black text-[8px] flex items-center gap-0.5 shrink-0 animate-pulse" title={`Mutfakta Hazır: ${table.ready_items_summary || table.active_order?.ready_items_summary || 'Sipariş'}`}>
                            <Utensils className="w-2.5 h-2.5" />
                          </span>
                        )}
                        {isBillPrinted && (
                          <span className="px-1 py-0.5 rounded bg-sky-600 text-white font-black text-[8px] flex items-center gap-0.5 shrink-0" title="Hesap Yazdırıldı">
                            <Printer className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{
                        backgroundColor: isBillPrinted ? '#0284c7' : isOccupied ? '#10b981' : isBillRequested ? '#3b82f6' : isReserved ? '#f59e0b' : '#94a3b8'
                      }} />
                    </div>

                    <div className="text-center my-auto">
                      {isOccupied && table.active_order ? (
                        <div className="text-xs sm:text-sm font-black font-mono">
                          ₺{Number(table.active_order.grand_total || 0).toFixed(2)}
                        </div>
                      ) : isReserved ? (
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">Rezerve</span>
                      ) : hasBuzzer ? (
                        <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300">🔔 Çağrı</span>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium">Boş</span>
                      )}
                    </div>

                    <div className="text-[10px] text-slate-400 text-center truncate">
                      {isOccupied ? (
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {getTableElapsedFormatted(table.active_order?.created_at || table.opened_at)}
                        </span>
                      ) : (
                        <span>{table.waiter_name || currentArea?.name}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: SİPARİŞLER (AÇIK OLAN TÜM MASALARIN ALT ALTA ZAMANA GÖRE LİSTESİ) */}
      {currentFloorSection === 'orders' && (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
          {/* Filter, Search & Time Sort Bar */}
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-3 sm:px-6 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0 shadow-2xs">
            {/* Search input */}
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={orderSearchQuery}
                onChange={(e) => setOrderSearchQuery(e.target.value)}
                placeholder="Masa, bölge veya garson ara..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>

            {/* Area Filter Dropdown */}
            <select
              value={orderAreaFilter}
              onChange={(e) => setOrderAreaFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">Tüm Bölgeler ({allOpenTables.length})</option>
              {areas.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            {/* Time Sort Direction Toggle Button */}
            <button
              onClick={() => {
                sound.beep();
                setOrderSortDirection(prev => prev === 'oldest' ? 'newest' : 'oldest');
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition"
              title="Açılış Zamanına Göre Sırala"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-emerald-600" />
              <span>{orderSortDirection === 'oldest' ? '⏱️ En Uzun Süre Önce' : '⏱️ En Yeni Önce'}</span>
            </button>

            {/* Total summary pill */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs font-black text-emerald-800 dark:text-emerald-300">
              <span>{displayedOpenTables.length} Açık Masa</span>
              <span className="opacity-40">•</span>
              <span>Toplam: ₺{Number(totalOpenRevenue || 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Vertical Stack List of Open Tables (Alt alta sıralı) */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 space-y-2.5 sm:space-y-3">
            {displayedOpenTables.map((table) => {
              const isBillRequested = table.status === 'bill_requested';
              const isBillPrinted = table.status === 'bill_printed';
              const hasBuzzer = !!table.waiter_call_reason || table.status === 'waiter_call';
              const hasReadyFood = !!table.has_ready_items || !!table.active_order?.has_ready_items;
              const activeOrder = table.active_order;
              const hasPartialPay = (activeOrder?.paid_total || 0) > 0;
              const isMenuOpen = activeActionTableId === table.id;

              return (
                <div
                  key={table.id}
                  onClick={() => handleTableClick(table)}
                  className={`w-full bg-white dark:bg-slate-900 border rounded-2xl p-3.5 sm:p-4 shadow-sm hover:shadow-md active:scale-[0.99] transition cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 relative border-l-4 ${
                    hasReadyFood
                      ? 'border-l-emerald-500 border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30'
                      : hasBuzzer
                      ? 'border-l-purple-500 border-purple-200 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20'
                      : isBillPrinted
                      ? 'border-l-sky-500 border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/30'
                      : isBillRequested
                      ? 'border-l-blue-500 border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20'
                      : 'border-l-emerald-500 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300'
                  }`}
                >
                  {/* Left Column: Table Info, Area Badge, Waiter & Order No */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Big Table Badge */}
                    <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase leading-none">MASA</span>
                      <span className="text-base font-black text-slate-900 dark:text-white leading-none mt-0.5">{table.name.replace(/^Masa\s*/i, '')}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-black text-base text-slate-900 dark:text-white tracking-tight">
                          {table.name}
                        </h4>

                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {table.areaName}
                        </span>

                        {hasReadyFood && (
                          <span 
                            title={`Mutfakta Servise Hazır: ${table.ready_items_summary || table.active_order?.ready_items_summary || 'Sipariş'}`}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-600 text-white flex items-center gap-1 shadow-sm uppercase tracking-wide animate-pulse"
                          >
                            <Utensils className="w-3 h-3" />
                            <span>SERVİSE HAZIR: {table.ready_items_summary || table.active_order?.ready_items_summary}</span>
                          </span>
                        )}

                        {hasBuzzer ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 animate-pulse flex items-center gap-1 border border-purple-300">
                            🔔 {table.waiter_call_reason || 'Garson Çağrısı'}
                          </span>
                        ) : isBillPrinted ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 flex items-center gap-1 border border-sky-300 dark:border-sky-700 shadow-sm">
                            <Printer className="w-3 h-3" />
                            <span>HESAP YAZDIRILDI</span>
                          </span>
                        ) : isBillRequested ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 flex items-center gap-1 border border-blue-300">
                            💳 Hesap İstendi
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center gap-1 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                            Açık Adisyon
                          </span>
                        )}
                      </div>

                      {/* Sub row: Live Timer + Waiter Name + Order Info */}
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex-wrap">
                        {/* Live Timer */}
                        <div className="flex items-center gap-1 font-mono font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md">
                          <Clock className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{getTableElapsedFormatted(activeOrder?.created_at || table.opened_at)}</span>
                        </div>

                        {/* Waiter Name */}
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>Garson: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{table.waiter_name || activeOrder?.waiter_name || 'MEHMETABİ'}</strong></span>
                        </div>

                        {/* Order Number & Items */}
                        {activeOrder && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-400">
                            <span>#{activeOrder.order_no || activeOrder.id}</span>
                            <span>•</span>
                            <span className="font-semibold">{activeOrder.items_count || 0} Kalem Ürün</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Amount + Action Button */}
                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className="text-left md:text-right">
                      {activeOrder ? (
                        hasPartialPay ? (
                          <div>
                            <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white">
                              <span>₺{Number(activeOrder.grand_total || 0).toFixed(2)}</span>
                              <span className="text-slate-400 font-normal mx-1">/</span>
                              <span className="text-emerald-600 dark:text-emerald-400">₺{Number(activeOrder.paid_total || 0).toFixed(2)}</span>
                            </div>
                            <div className="text-[11px] font-extrabold text-brand-600 dark:text-emerald-400 font-mono">
                              Kalan: ₺{Number(activeOrder.remaining_total !== undefined ? activeOrder.remaining_total : (activeOrder.grand_total || 0) - (activeOrder.paid_total || 0)).toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <div className="text-lg sm:text-xl font-black font-mono text-slate-950 dark:text-white">
                            ₺{Number(activeOrder.grand_total || 0).toFixed(2)}
                          </div>
                        )
                      ) : (
                        <div className="text-sm font-bold text-slate-400">₺0.00</div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTableClick(table); }}
                        className="py-2 px-3 sm:px-3.5 rounded-xl bg-[#338d35] hover:bg-[#28702a] text-white font-black text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 transition cursor-pointer"
                      >
                        <span>Siparişe Git</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      {/* 3 dots action menu button */}
                      {hasAnyTableAction && (
                        <div className="relative">
                          <button
                            onClick={(e) => handleOpenActionMenu(e, table)}
                            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {isMenuOpen && (
                            <div 
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-8 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-30 text-xs font-semibold animate-fadeIn"
                            >
                              {canMoveMergeTable && (
                                <>
                                  <button
                                    onClick={() => { setIsMoveOpen(true); setActiveActionTableId(null); }}
                                    className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
                                    <span>Masa Taşı</span>
                                  </button>
                                  <button
                                    onClick={() => { setIsMergeOpen(true); setActiveActionTableId(null); }}
                                    className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                                  >
                                    <Merge className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Masa Birleştir</span>
                                  </button>
                                </>
                              )}
                              {canTransferItems && (
                                <button
                                  onClick={() => { setIsTransferItemsOpen(true); setActiveActionTableId(null); }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>Ürün Aktar</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {displayedOpenTables.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3 text-center">
                <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-base font-black text-slate-800 dark:text-slate-200">
                  {orderSearchQuery ? 'Aramaya Uygun Açık Sipariş Bulunamadı' : 'Şu Anda Açık Masa Bulunmuyor'}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  {orderSearchQuery 
                    ? 'Arama kriterlerinizi temizleyerek tekrar deneyebilirsiniz.'
                    : 'Tüm masalar boş veya hesapları kapatılmış durumda. Yeni sipariş girmek için Masalar sekmesinden bir masa seçebilirsiniz.'}
                </p>
                <button
                  onClick={() => handleSetFloorSection('tables')}
                  className="mt-2 px-4 py-2 rounded-xl bg-[#338d35] hover:bg-[#28702a] text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>Masalar Ekranına Dön</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <MoveTableModal
        isOpen={isMoveOpen}
        onClose={() => setIsMoveOpen(false)}
        areas={areas}
        sourceTable={selectedTableForAction}
        operatorName={currentUser?.name || 'Garson'}
        onSuccess={onRefreshAreas}
      />

      <MergeTableModal
        isOpen={isMergeOpen}
        onClose={() => setIsMergeOpen(false)}
        areas={areas}
        sourceTable={selectedTableForAction}
        operatorName={currentUser?.name || 'Garson'}
        onSuccess={onRefreshAreas}
      />

      <TransferItemsModal
        isOpen={isTransferItemsOpen}
        onClose={() => setIsTransferItemsOpen(false)}
        areas={areas}
        sourceTable={selectedTableForAction}
        operatorName={currentUser?.name || 'Garson'}
        onSuccess={onRefreshAreas}
      />
    </div>
  );
};
