import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, Filter, Clock, User, FileText, 
  AlertTriangle, RefreshCw, CheckCircle 
} from 'lucide-react';
import { AuditLog } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filterType, setFilterType] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadLogs();
  }, [filterType]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs(filterType || undefined);
      setLogs(data);
    } catch (e) {
      console.warn('Failed to load audit logs', e);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'VOID_ITEM':
        return <span className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-[10px] font-bold">ÜRÜN İPTALİ</span>;
      case 'APPLY_DISCOUNT':
        return <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-[10px] font-bold">İNDİRİM</span>;
      case 'APPLY_TREAT':
        return <span className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-bold">İKRAM</span>;
      case 'TABLE_MOVE':
        return <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold">MASA TAŞIMA</span>;
      case 'TABLE_MERGE':
        return <span className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded text-[10px] font-bold">MASA BİRLEŞTİRME</span>;
      case 'Z_REPORT':
        return <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold">Z-RAPORU</span>;
      case 'CASH_EXPENSE':
        return <span className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded text-[10px] font-bold">KASA MASRAFI</span>;
      default:
        return <span className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 px-2 py-0.5 rounded text-[10px] font-bold">{action}</span>;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none transition-colors duration-200">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-red-500" />
            <span>Güvenlik & Denetim Logları (Audit Trail)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            İptal edilen ürünler, ikramlar, indirimler ve kasa hareketlerinin değiştirilemez zaman damgalı dökümü
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Action Filter */}
          <select
            value={filterType}
            onChange={(e) => { sound.beep(); setFilterType(e.target.value); }}
            className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs p-2.5 font-bold shadow-sm"
          >
            <option value="">Tüm Hareketler</option>
            <option value="VOID_ITEM">Ürün İptalleri</option>
            <option value="APPLY_DISCOUNT">İndirimler</option>
            <option value="APPLY_TREAT">İkramlar</option>
            <option value="TABLE_MOVE">Masa Taşımaları</option>
            <option value="TABLE_MERGE">Masa Birleştirmeleri</option>
            <option value="CASH_EXPENSE">Kasa Masrafları</option>
            <option value="Z_REPORT">Z-Raporları</option>
          </select>

          <button
            onClick={() => { sound.beep(); loadLogs(); }}
            className="p-2.5 rounded-2xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-sm"
            title="Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <tr>
                <th className="py-3.5 px-4 font-bold">Zaman</th>
                <th className="py-3.5 px-4 font-bold">İşlem Türü</th>
                <th className="py-3.5 px-4 font-bold">Operatör / Rol</th>
                <th className="py-3.5 px-4 font-bold">Hedef Referans</th>
                <th className="py-3.5 px-4 font-bold">Zorunlu Sebep Kodu</th>
                <th className="py-3.5 px-4 font-bold">Açıklama / Detay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3.5 px-4 font-mono text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                    {l.timestamp}
                  </td>
                  <td className="py-3.5 px-4">{getActionBadge(l.action_type)}</td>
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-900 dark:text-white">{l.operator_name}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-1 capitalize">({l.operator_role})</span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">{l.target_ref || '-'}</td>
                  <td className="py-3.5 px-4">
                    {l.reason_code ? (
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px] text-amber-700 dark:text-amber-300 font-bold">
                        {l.reason_code}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                    {l.reason_text || (l.details ? JSON.stringify(l.details) : '-')}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 dark:text-slate-500">
                    Kayıtlı denetim logu bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
