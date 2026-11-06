import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldAlert, Filter, Clock, User, FileText, 
  AlertTriangle, RefreshCw, CheckCircle, Search,
  ArrowRight, DollarSign, X, Eye, Calendar, Utensils
} from 'lucide-react';
import { AuditLog } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filterType, setFilterType] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    loadLogs();
  }, [filterType]);

  const loadLogs = async (customSearch?: string) => {
    setLoading(true);
    try {
      const qSearch = customSearch !== undefined ? customSearch : searchQuery;
      const data = await api.getAuditLogs(filterType || undefined, qSearch || undefined);
      setLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Failed to load audit logs', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sound.beep();
    loadLogs();
  };

  const formatDuration = (minutes?: number) => {
    if (minutes === undefined || minutes === null) return '-';
    if (minutes < 1) return '< 1 dk';
    if (minutes < 60) return `${minutes} dk`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return `${hours} sa ${rem > 0 ? rem + ' dk' : ''}`;
  };

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return '-';
    return `₺${Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'TABLE_OPENED':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            MASA AÇILDI
          </span>
        );
      case 'TABLE_CLOSED':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">
            <CheckCircle className="w-3 h-3 text-blue-500" />
            MASA KAPATILDI
          </span>
        );
      case 'CANCEL_ORDER':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">
            <AlertTriangle className="w-3 h-3 text-rose-500" />
            SİPARİŞ İPTALİ
          </span>
        );
      case 'REOPEN_ORDER':
        return (
          <span className="inline-flex items-center gap-1 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">
            ADİSYON TEKRAR AÇILDI
          </span>
        );
      case 'VOID_ITEM':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">
            ÜRÜN İPTALİ
          </span>
        );
      case 'APPLY_DISCOUNT':
      case 'APPLY_ITEM_DISCOUNT':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">
            İNDİRİM
          </span>
        );
      case 'APPLY_TREAT':
      case 'TREAT_ITEMS':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">
            İKRAM
          </span>
        );
      case 'TABLE_MOVE':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">
            MASA TAŞIMA
          </span>
        );
      case 'TABLE_MERGE':
        return (
          <span className="inline-flex items-center gap-1 bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">
            MASA BİRLEŞTİRME
          </span>
        );
      case 'Z_REPORT':
      case 'Z_REPORT_CLOSED':
        return (
          <span className="inline-flex items-center gap-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">
            Z-RAPORU
          </span>
        );
      case 'CASH_EXPENSE':
        return (
          <span className="inline-flex items-center gap-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">
            KASA MASRAFI
          </span>
        );
      default:
        return (
          <span className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 px-2 py-0.5 rounded text-[10px] font-bold">
            {action}
          </span>
        );
    }
  };

  // Metrics summary
  const metrics = useMemo(() => {
    let closedCount = 0;
    let openedCount = 0;
    let cancelCount = 0;
    let totalMinutes = 0;
    let closedWithDuration = 0;

    logs.forEach(l => {
      if (l.action_type === 'TABLE_CLOSED') {
        closedCount++;
        const mins = l.details?.duration_minutes;
        if (typeof mins === 'number' && mins > 0) {
          totalMinutes += mins;
          closedWithDuration++;
        }
      } else if (l.action_type === 'TABLE_OPENED') {
        openedCount++;
      } else if (l.action_type === 'CANCEL_ORDER' || l.action_type === 'VOID_ITEM') {
        cancelCount++;
      }
    });

    const avgDuration = closedWithDuration > 0 ? Math.round(totalMinutes / closedWithDuration) : 0;
    return { closedCount, openedCount, cancelCount, avgDuration, totalLogs: logs.length };
  }, [logs]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 transition-colors duration-200">
      {/* Header & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <ShieldAlert className="w-7 h-7 text-emerald-500" />
            <span>Güvenlik & Denetim Logları (Audit Trail)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Masaların açılış-kapanış saatleri, oturum süreleri, iptaller, indirimler ve kasa hareketlerinin zaman damgalı dökümü
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.beep(); loadLogs(); }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm text-xs font-bold transition"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
            <span>Yenile</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Toplam Kayıt</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.totalLogs}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-emerald-500/20 shadow-sm">
          <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Masa Açılışları</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{metrics.openedCount}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-blue-500/20 shadow-sm">
          <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Kapanış & Tahsilat</div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
            {metrics.closedCount}
            {metrics.avgDuration > 0 && (
              <span className="text-xs font-normal text-slate-400 ml-2">Ort: {metrics.avgDuration} dk</span>
            )}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-rose-500/20 shadow-sm">
          <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">İptal & İadeler</div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{metrics.cancelCount}</div>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Masa adı, adisyon no, personel veya açıklama ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); loadLogs(''); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
          <select
            value={filterType}
            onChange={(e) => { sound.beep(); setFilterType(e.target.value); }}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs py-2 px-3 font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Tüm Hareketler</option>
            <option value="TABLE_CLOSED">Masa Kapanışları & Tahsilat</option>
            <option value="TABLE_OPENED">Masa Açılışları</option>
            <option value="CANCEL_ORDER">Sipariş & Masa İptalleri</option>
            <option value="REOPEN_ORDER">Adisyon Tekrar Açma</option>
            <option value="VOID_ITEM">Ürün İptalleri</option>
            <option value="APPLY_DISCOUNT">İndirimler</option>
            <option value="APPLY_TREAT">İkramlar</option>
            <option value="TABLE_MOVE">Masa Taşımaları</option>
            <option value="TABLE_MERGE">Masa Birleştirmeleri</option>
            <option value="CASH_EXPENSE">Kasa Masrafları</option>
            <option value="Z_REPORT_CLOSED">Z-Raporları</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <tr>
                <th className="py-3 px-4 font-bold">İşlem Zamanı</th>
                <th className="py-3 px-4 font-bold">İşlem Türü</th>
                <th className="py-3 px-4 font-bold">Masa & Referans</th>
                <th className="py-3 px-4 font-bold">Açılış Saati</th>
                <th className="py-3 px-4 font-bold">Kapanış Saati</th>
                <th className="py-3 px-4 font-bold">Masa Süresi</th>
                <th className="py-3 px-4 font-bold">Tutar</th>
                <th className="py-3 px-4 font-bold">Operatör / Rol</th>
                <th className="py-3 px-4 font-bold">Açıklama / Detay</th>
                <th className="py-3 px-3 font-bold text-center">İncele</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
              {logs.map((l) => {
                const details = l.details || {};
                const openedAt = details.opened_at || '-';
                const closedAt = details.closed_at || '-';
                const duration = details.duration_minutes !== undefined ? details.duration_minutes : null;
                const grandTotal = details.grand_total !== undefined ? details.grand_total : null;
                const tableName = details.table_name || l.target_ref || '-';

                return (
                  <tr 
                    key={l.id} 
                    onClick={() => setSelectedLog(l)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                      {l.timestamp}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getActionBadge(l.action_type)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-bold text-slate-900 dark:text-white">
                      {tableName}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-emerald-600 dark:text-emerald-400">
                      {openedAt !== '-' ? (
                        <span className="flex items-center gap-1 font-semibold">
                          <Clock className="w-3 h-3 text-emerald-500" />
                          {openedAt}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-blue-600 dark:text-blue-400">
                      {closedAt !== '-' ? (
                        <span className="flex items-center gap-1 font-semibold">
                          <Clock className="w-3 h-3 text-blue-500" />
                          {closedAt}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono">
                      {duration !== null ? (
                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded text-[11px] font-bold">
                          {formatDuration(duration)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-bold font-mono text-slate-900 dark:text-white">
                      {grandTotal !== null ? formatCurrency(grandTotal) : '-'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-bold text-slate-900 dark:text-white">{l.operator_name || '-'}</span>
                      {l.operator_role && (
                        <span className="text-[10px] text-slate-400 ml-1 capitalize">({l.operator_role})</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                      {l.reason_text || (l.reason_code ? `[${l.reason_code}]` : '-')}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedLog(l); }}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
                        title="Detayları İncele"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400 dark:text-slate-500">
                    <ShieldAlert className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    Kriterlere uygun denetim logu bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSelectedLog(null)}
        >
          <div 
            className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Denetim İzi Detayı #{selectedLog.id}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* Event Badge & Timestamp */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>{getActionBadge(selectedLog.action_type)}</div>
                <div className="text-slate-400 font-mono text-[11px]">{selectedLog.timestamp}</div>
              </div>

              {/* Table & Session Card */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Masa / Referans</div>
                  <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                    {selectedLog.details?.table_name || selectedLog.target_ref || '-'}
                  </div>
                  {selectedLog.details?.order_no && (
                    <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                      Adisyon #{selectedLog.details.order_no}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Adisyon Tutarı</div>
                  <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                    {selectedLog.details?.grand_total !== undefined 
                      ? formatCurrency(selectedLog.details.grand_total) 
                      : '-'}
                  </div>
                  {selectedLog.details?.paid_total !== undefined && (
                    <div className="text-[11px] text-slate-400">
                      Ödenen: {formatCurrency(selectedLog.details.paid_total)}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Masa Açılış Saati</div>
                  <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {selectedLog.details?.opened_at || '-'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Kapanış / İşlem Saati</div>
                  <div className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                    {selectedLog.details?.closed_at || selectedLog.timestamp || '-'}
                  </div>
                </div>

                <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-700/40 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">Masa Kalış / Oturum Süresi:</span>
                  <span className="font-mono font-black text-xs px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    {formatDuration(selectedLog.details?.duration_minutes)}
                  </span>
                </div>
              </div>

              {/* Personnel Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">İşlemi Yapan Operatör</div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{selectedLog.operator_name || '-'}</div>
                  <div className="text-[10px] text-slate-400 capitalize">{selectedLog.operator_role || '-'}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Garson / Kasiyer</div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                    {selectedLog.details?.waiter_name ? `Garson: ${selectedLog.details.waiter_name}` : ''}
                    {selectedLog.details?.cashier_name ? `Kasiyer: ${selectedLog.details.cashier_name}` : ''}
                    {!selectedLog.details?.waiter_name && !selectedLog.details?.cashier_name && '-'}
                  </div>
                </div>
              </div>

              {/* Reason / Notes */}
              {(selectedLog.reason_code || selectedLog.reason_text) && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <div className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">Sebep & Açıklama</div>
                  {selectedLog.reason_code && (
                    <div className="text-xs font-mono font-bold text-amber-800 dark:text-amber-300 mt-0.5">
                      [{selectedLog.reason_code}]
                    </div>
                  )}
                  {selectedLog.reason_text && (
                    <div className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                      {selectedLog.reason_text}
                    </div>
                  )}
                </div>
              )}

              {/* Raw Details JSON */}
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Ham Sistem Parametreleri</div>
                  <pre className="p-3 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[10px] overflow-x-auto max-h-36">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
