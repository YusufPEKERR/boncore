import React, { useState } from 'react';
import { X, ArrowRight, Merge, RefreshCw, Users, Bell, CheckCircle } from 'lucide-react';
import { Table, Area } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

// 1. Move Table Modal
export const MoveTableModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  areas: Area[];
  sourceTable: Table | null;
  operatorName: string;
  onSuccess: () => void;
}> = ({ isOpen, onClose, areas, sourceTable, operatorName, onSuccess }) => {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  if (!isOpen || !sourceTable) return null;

  const allTables = areas.flatMap(a => a.tables);
  const availableTargets = allTables.filter(t => t.id !== sourceTable.id && t.status === 'empty');

  const handleMove = async () => {
    if (!targetId) {
      setError('Lütfen hedef masa seçiniz.');
      return;
    }
    setLoading(true);
    try {
      await api.moveTable(sourceTable.id, targetId, operatorName);
      sound.beep();
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Masa taşınamadı.');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none font-sans animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Masa Taşı (Transfer)</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-4 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
          <span>Kaynak Masa:</span>
          <span className="font-bold text-blue-600 dark:text-blue-400 text-sm bg-blue-50 dark:bg-blue-500/20 px-3 py-1 rounded-xl">
            {sourceTable.name} ({sourceTable.active_order?.grand_total.toFixed(2) || 0} ₺)
          </span>
        </div>

        <div className="mb-4">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block">Hedef Boş Masa Seçiniz:</label>
          <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
            {availableTargets.map((t) => (
              <button
                key={t.id}
                onClick={() => { sound.beep(); setTargetId(t.id); setError(''); }}
                className={`py-2.5 px-2 rounded-xl font-bold text-xs border transition ${
                  targetId === t.id
                    ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
          {availableTargets.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-semibold">Şu anda boş masa bulunmuyor.</p>
          )}
        </div>

        {error && <div className="mb-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 p-2.5 rounded-xl font-bold">{error}</div>}

        <button
          onClick={handleMove}
          disabled={loading || !targetId}
          className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs transition shadow-md"
        >
          {loading ? 'Taşınıyor...' : 'MASAYI TAŞI'}
        </button>
      </div>
    </div>
  );
};

// 2. Merge Table Modal
export const MergeTableModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  areas: Area[];
  sourceTable: Table | null;
  operatorName: string;
  onSuccess: () => void;
}> = ({ isOpen, onClose, areas, sourceTable, operatorName, onSuccess }) => {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  if (!isOpen || !sourceTable) return null;

  const allTables = areas.flatMap(a => a.tables);
  const occupiedTargets = allTables.filter(t => t.id !== sourceTable.id && (t.status === 'occupied' || t.status === 'bill_requested'));

  const handleMerge = async () => {
    if (!targetId) {
      setError('Lütfen birleştirilecek hedef masayı seçiniz.');
      return;
    }
    setLoading(true);
    try {
      await api.mergeTables(sourceTable.id, targetId, operatorName);
      sound.beep();
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Masalar birleştirilemedi.');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none font-sans animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Merge className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Masa Birleştir (Merge)</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-4 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
          <span>Birleştirilecek Masa:</span>
          <span className="font-bold text-amber-600 dark:text-amber-400 text-sm bg-amber-50 dark:bg-amber-500/20 px-3 py-1 rounded-xl">
            {sourceTable.name} ({sourceTable.active_order?.grand_total.toFixed(2) || 0} ₺)
          </span>
        </div>

        <div className="mb-4">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block">Hedef Dolu Masayı Seçiniz:</label>
          <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
            {occupiedTargets.map((t) => (
              <button
                key={t.id}
                onClick={() => { sound.beep(); setTargetId(t.id); setError(''); }}
                className={`py-2.5 px-2 rounded-xl font-bold text-xs border transition flex flex-col items-center ${
                  targetId === t.id
                    ? 'bg-amber-600 border-amber-400 text-white shadow-md'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span>{t.name}</span>
                <span className="text-[10px] font-normal opacity-80">{t.active_order?.grand_total.toFixed(0)} ₺</span>
              </button>
            ))}
          </div>
          {occupiedTargets.length === 0 && (
            <p className="text-xs text-slate-400 mt-2 font-medium">Birleştirilecek başka aktif dolu masa bulunmuyor.</p>
          )}
        </div>

        {error && <div className="mb-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 p-2.5 rounded-xl font-bold">{error}</div>}

        <button
          onClick={handleMerge}
          disabled={loading || !targetId}
          className="w-full py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-black text-xs transition shadow-md"
        >
          {loading ? 'Birleştiriliyor...' : 'MASALARI BİRLEŞTİR'}
        </button>
      </div>
    </div>
  );
};

// 3. Kuver & Person Count Modal
export const KuverModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  table: Table | null;
  operatorName: string;
  onSuccess: () => void;
}> = ({ isOpen, onClose, table, operatorName, onSuccess }) => {
  const [kuverCount, setKuverCount] = useState<number>(table?.kuver_count || 1);
  const [loading, setLoading] = useState<boolean>(false);

  if (!isOpen || !table) return null;

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.updateKuver(table.id, kuverCount, operatorName);
      sound.beep();
      onSuccess();
      onClose();
    } catch (e) {
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none font-sans animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Kuver / Kişi Sayısı ({table.name})</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-medium">Kişi başı sabit kuver: ₺35.00</p>

        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={() => { sound.beep(); setKuverCount(Math.max(0, kuverCount - 1)); }}
            className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center active:scale-95 transition"
          >
            -
          </button>
          <div className="text-4xl font-extrabold text-slate-900 dark:text-white w-16 text-center font-mono">
            {kuverCount}
          </div>
          <button
            onClick={() => { sound.beep(); setKuverCount(kuverCount + 1); }}
            className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center active:scale-95 transition"
          >
            +
          </button>
        </div>

        <div className="grid grid-cols-5 gap-2 mb-6">
          {[1, 2, 4, 6, 8].map(n => (
            <button
              key={n}
              onClick={() => { sound.beep(); setKuverCount(n); }}
              className="py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-extrabold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
            >
              {n} Kişi
            </button>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-md transition"
        >
          {loading ? 'Kaydediliyor...' : `KAYDET (${kuverCount * 35} ₺)`}
        </button>
      </div>
    </div>
  );
};

// 4. Buzzer / Waiter Call List Modal
export const BuzzerListModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  areas: Area[];
  onClearCall: (tableId: number) => void;
  onOpenTablePos: (table: Table) => void;
}> = ({ isOpen, onClose, areas, onClearCall, onOpenTablePos }) => {
  if (!isOpen) return null;

  const allTables = areas.flatMap(a => a.tables);
  const callingTables = allTables.filter(t => t.waiter_call_reason || t.status === 'waiter_call' || t.status === 'bill_requested');

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none font-sans animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-500/40 rounded-3xl p-6 w-full max-w-md shadow-2xl text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-purple-600 dark:text-purple-400 animate-bounce" />
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Masadan Gelen Çağrılar</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-2.5 max-h-72 overflow-y-auto mb-4 pr-1">
          {callingTables.map((t) => (
            <div key={t.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/90 border border-purple-200 dark:border-purple-500/30 flex items-center justify-between shadow-sm">
              <div>
                <div className="font-black text-base text-slate-900 dark:text-white">{t.name}</div>
                <div className="text-xs font-bold text-purple-600 dark:text-purple-300">
                  {t.waiter_call_reason || (t.status === 'bill_requested' ? 'Hesap İstendi' : 'Garson Çağrısı')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { onOpenTablePos(t); onClose(); }}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-extrabold text-white shadow-sm"
                >
                  Masaya Git
                </button>
                <button
                  onClick={() => onClearCall(t.id)}
                  className="p-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 border border-emerald-300 dark:border-emerald-500/40 transition"
                  title="Çağrıyı Kapat"
                >
                  <CheckCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {callingTables.length === 0 && (
            <div className="text-center py-6 text-slate-400 text-xs font-semibold">
              Şu anda bekleyen masa çağrısı bulunmuyor.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
