import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit3, MoreVertical, Clock, Users, 
  ArrowRight, Merge, RefreshCw, FileText, CheckCircle 
} from 'lucide-react';
import { Area, Table, StaffUser } from '../../types';
import { sound } from '../../services/sound';
import { api } from '../../services/api';
import { MoveTableModal, MergeTableModal, KuverModal } from './TableActionModals';

interface FloorViewProps {
  areas: Area[];
  onSelectTable: (table: Table) => void;
  currentUser: StaffUser | null;
  onRefreshAreas: () => void;
  onClearBuzzer: (tableId: number) => void;
  loading?: boolean;
}

export const FloorView: React.FC<FloorViewProps> = ({
  areas,
  onSelectTable,
  currentUser,
  onRefreshAreas,
  onClearBuzzer,
  loading = false
}) => {
  const [activeAreaId, setActiveAreaId] = useState<number>(() => {
    const saved = localStorage.getItem('boncore_active_area_id');
    if (saved !== null) {
      const parsed = Number(saved);
      if (!isNaN(parsed) && parsed !== 0) return parsed;
    }
    return areas[0]?.id || 1;
  });
  const [selectedTableForAction, setSelectedTableForAction] = useState<Table | null>(null);

  // Modals
  const [isMoveOpen, setIsMoveOpen] = useState<boolean>(false);
  const [isMergeOpen, setIsMergeOpen] = useState<boolean>(false);
  const [isKuverOpen, setIsKuverOpen] = useState<boolean>(false);
  const [activeActionTableId, setActiveActionTableId] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem('boncore_active_area_id', String(activeAreaId));
  }, [activeAreaId]);

  useEffect(() => {
    if (areas.length > 0 && !areas.some(a => a.id === activeAreaId)) {
      setActiveAreaId(areas[0].id);
    }
  }, [areas]);

  const currentArea = areas.find(a => a.id === activeAreaId) || areas[0];
  const displayedTables: Table[] = currentArea?.tables || [];

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
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] bg-slate-50 dark:bg-slate-950 select-none overflow-hidden transition-colors duration-200">
      {/* Area Horizontal Tabs Bar (Matching Adisyo Frame 105) */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between z-10 shadow-sm overflow-x-auto">
        <div className="flex items-center gap-1 overflow-x-auto py-1">
          {/* AREA TABS */}
          {areas.map((area) => {
            const isAreaActive = activeAreaId === area.id;
            const occupiedInArea = (area.tables || []).filter(t => t.status === 'occupied' || t.status === 'bill_requested').length;
            const totalInArea = (area.tables || []).length;

            return (
              <button
                key={area.id}
                onClick={() => { sound.beep(); setActiveAreaId(area.id); }}
                className={`py-3 px-3.5 text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 border-b-2 ${
                  isAreaActive
                    ? 'border-[#2c3e50] dark:border-blue-500 text-slate-900 dark:text-white font-extrabold'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="uppercase">{area.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  isAreaActive 
                    ? 'bg-[#2c3e50] text-white dark:bg-blue-600' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}>
                  {occupiedInArea}/{totalInArea}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.beep(); onRefreshAreas(); }}
            className={`p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition ${loading ? 'animate-spin' : ''}`}
            title="Masa Durumlarını Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tables Grid Canvas (Matching Adisyo Frame 105) */}
      <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-slate-50 dark:bg-slate-950">
        {loading && displayedTables.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3 animate-fadeIn">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <span className="text-sm font-bold">Masalar yükleniyor...</span>
          </div>
        )}

        {!loading && displayedTables.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3 animate-fadeIn">
            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400">
              <RefreshCw className="w-8 h-8" />
            </div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-200">Henüz Masa Bulunmuyor</h3>
            <p className="text-xs text-slate-400 max-w-sm text-center">Masalar henüz listelenmedi veya bağlantı bekleniyor.</p>
            <button
              onClick={onRefreshAreas}
              className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Masaları Yenile</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {displayedTables.map((table) => {
            const isOccupied = table.status === 'occupied' || !!table.active_order;
            const isBillRequested = table.status === 'bill_requested';
            const isReserved = table.status === 'reserved';
            const hasBuzzer = !!table.waiter_call_reason || table.status === 'waiter_call';
            const isMenuOpen = activeActionTableId === table.id;

            return (
              <div
                key={table.id}
                onClick={() => handleTableClick(table)}
                className={`h-40 rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all duration-150 pos-touch-card relative border shadow-sm hover:shadow-md ${
                  hasBuzzer
                    ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-400 text-purple-900 dark:text-purple-100 animate-pulse'
                    : isBillRequested
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-400 text-blue-900 dark:text-blue-100'
                    : isOccupied
                    ? 'bg-[#fce8e6] dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-slate-900 dark:text-white'
                    : isReserved
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900/60 text-amber-900 dark:text-amber-100'
                    : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Card Top: Table Name, Waiter Subtext, and 3-dots Menu */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight leading-tight">
                      {table.name}
                    </h3>
                    {isOccupied && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mt-0.5">
                        {table.waiter_name || 'MEHMETABİ'}
                      </span>
                    )}
                  </div>

                  {/* 3 dots action menu button */}
                  <div className="relative">
                    <button
                      onClick={(e) => handleOpenActionMenu(e, table)}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-black/5"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Pop-up Action Menu */}
                    {isMenuOpen && (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-6 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-20 text-xs font-semibold animate-fadeIn"
                      >
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
                        <button
                          onClick={() => { setIsKuverOpen(true); setActiveActionTableId(null); }}
                          className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                        >
                          <Users className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Kişi / Kuver</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Center: Amount Display (Matching Frame 105: ₺3.070,00) */}
                <div className="text-center my-auto">
                  {isOccupied && table.active_order ? (
                    <div className="text-xl font-black text-slate-950 dark:text-white font-mono tracking-tight">
                      ₺{table.active_order.grand_total.toFixed(2)}
                    </div>
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

                {/* Card Bottom: Elapsed Timer or Seats (Matching Frame 105: 56 dk 55 sn) */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  {isOccupied ? (
                    <span className="font-mono text-slate-600 dark:text-slate-300">
                      {table.duration_minutes || 56} dk 55 sn
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span>{table.seats} Kişilik</span>
                    </span>
                  )}

                  {table.kuver_count ? (
                    <span className="text-[10px] font-bold text-slate-500">
                      {table.kuver_count} Misafir
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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

      <KuverModal
        isOpen={isKuverOpen}
        onClose={() => setIsKuverOpen(false)}
        table={selectedTableForAction}
        operatorName={currentUser?.name || 'Garson'}
        onSuccess={onRefreshAreas}
      />
    </div>
  );
};
