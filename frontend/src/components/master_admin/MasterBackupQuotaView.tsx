import React, { useState, useEffect } from 'react';
import { 
  HardDrive, Download, RotateCcw, Plus, RefreshCw, 
  CheckCircle2, AlertTriangle, ShieldCheck, Database, 
  Image as ImageIcon, FileCheck, Search, X, AlertCircle
} from 'lucide-react';
import { sound } from '../../services/sound';

export interface StorageSummaryTenant {
  code: string;
  name: string;
  plan: string;
  total_used_mb: number;
  allocated_mb: number;
  usage_percentage: number;
}

export interface PlatformStorageSummary {
  total_tenants: number;
  total_storage_used_mb: number;
  total_allocated_mb: number;
  total_backups_count: number;
  platform_usage_percent: number;
  tenants: StorageSummaryTenant[];
}

export interface TenantQuotaDetail {
  tenant_code: string;
  tenant_name: string;
  allocated_quota_mb: number;
  used_db_bytes: number;
  used_db_mb: number;
  used_media_bytes: number;
  used_media_mb: number;
  total_used_mb: number;
  usage_percentage: number;
  is_quota_exceeded: boolean;
  last_calculated_at: string;
}

export interface TenantBackupRecord {
  id: number;
  tenant_code: string;
  backup_name: string;
  file_path: string;
  file_size_bytes: number;
  file_size_mb: number;
  checksum_sha256?: string;
  backup_type: string;
  status: string;
  created_by: string;
  created_at: string;
  restored_at?: string;
}

interface MasterBackupQuotaViewProps {
  tenants: any[];
}

export const MasterBackupQuotaView: React.FC<MasterBackupQuotaViewProps> = ({ tenants }) => {
  const [summary, setSummary] = useState<PlatformStorageSummary | null>(null);
  const [selectedTenantCode, setSelectedTenantCode] = useState<string>('');
  const [quota, setQuota] = useState<TenantQuotaDetail | null>(null);
  const [backups, setBackups] = useState<TenantBackupRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingTenantData, setLoadingTenantData] = useState<boolean>(false);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);

  // Restore confirmation modal
  const [restoreBackupTarget, setRestoreBackupTarget] = useState<TenantBackupRecord | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState<string>('');

  useEffect(() => {
    fetchStorageSummary();
  }, []);

  useEffect(() => {
    if (selectedTenantCode) {
      fetchTenantQuotaAndBackups(selectedTenantCode);
    }
  }, [selectedTenantCode]);

  const fetchStorageSummary = async (isManual = false) => {
    if (isManual) sound.beep();
    setLoading(true);
    try {
      const res = await fetch(`/api/master/storage/summary?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
        if (!selectedTenantCode && tenants.length > 0) {
          setSelectedTenantCode(tenants[0].code);
        }
      }
    } catch (err) {
      console.warn('Storage summary warning:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenantQuotaAndBackups = async (tenantCode: string) => {
    setLoadingTenantData(true);
    try {
      const [quotaRes, backupsRes] = await Promise.all([
        fetch(`/api/master/tenants/${tenantCode}/quota?_t=${Date.now()}`),
        fetch(`/api/master/tenants/${tenantCode}/backups?_t=${Date.now()}`)
      ]);

      if (quotaRes.ok) {
        setQuota(await quotaRes.json());
      }
      if (backupsRes.ok) {
        const d = await backupsRes.json();
        setBackups(Array.isArray(d) ? d : []);
      }
    } catch (err) {
      console.warn('Tenant data fetch warning:', err);
    } finally {
      setLoadingTenantData(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!selectedTenantCode) return;
    sound.cashDrawer();
    setIsBackingUp(true);
    try {
      const res = await fetch(`/api/master/tenants/${selectedTenantCode}/backup`, {
        method: 'POST'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Yedek alınamadı.');
      }
      const data = await res.json();
      alert(`Veritabanı yedeği başarıyla oluşturuldu!\nDosya: ${data.backup?.backup_name}\nBoyut: ${data.backup?.file_size_mb} MB`);
      fetchTenantQuotaAndBackups(selectedTenantCode);
      fetchStorageSummary();
    } catch (err: any) {
      alert(err.message || 'Yedekleme sırasında hata oluştu.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleOpenRestoreModal = (backup: TenantBackupRecord) => {
    sound.warning();
    setRestoreBackupTarget(backup);
    setRestoreConfirmText('');
  };

  const handleExecuteRestore = async () => {
    if (!restoreBackupTarget) return;
    if (restoreConfirmText !== 'ONAYLIYORUM') {
      alert('Lütfen geri yüklemeyi onaylamak için kutuya "ONAYLIYORUM" yazınız.');
      return;
    }

    sound.cashDrawer();
    setIsRestoring(true);
    try {
      const res = await fetch(`/api/master/backups/${restoreBackupTarget.id}/restore`, {
        method: 'POST'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Geri yükleme başarısız oldu.');
      }
      const data = await res.json();
      alert(`Veritabanı başarıyla yedeğe geri yüklendi!\nÖnceki durum güvenlik amacıyla "${data.safety_snapshot}" olarak arşivlendi.`);
      setRestoreBackupTarget(null);
      fetchTenantQuotaAndBackups(selectedTenantCode);
    } catch (err: any) {
      alert(err.message || 'Geri yükleme hatası.');
    } finally {
      setIsRestoring(false);
    }
  };

  const getUsageColor = (pct: number) => {
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Yedekleme & Veri Kotası
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 font-bold uppercase">
                  Disk & Snapshot Motoru
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                SQLite WAL-checkpointed tek tıkla veritabanı yedekleme, arşiv indirme, güvenlik anlık görüntülü geri yükleme ve depolama kotası takibi.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => fetchStorageSummary(true)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs border border-slate-700 transition cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
          <span>Yenile</span>
        </button>
      </div>

      {/* Platform Overview KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium mb-1">Toplam Depolama Kullanımı</div>
          <div className="text-2xl font-black text-white">
            {summary?.total_storage_used_mb || 0} MB
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Platform geneli DB ve medya</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium mb-1">Ayrılan Toplam Kota</div>
          <div className="text-2xl font-black text-cyan-400">
            {summary?.total_allocated_mb || 0} MB
          </div>
          <div className="text-[11px] text-slate-500 mt-1">SaaS abonelik limitleri toplamı</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium mb-1">Toplam Alınan Yedek Arşivi</div>
          <div className="text-2xl font-black text-emerald-400">
            {summary?.total_backups_count || 0} Snapshot
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Kurtarma için hazır kopyalar</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium mb-1">Platform Doluluk Oranı</div>
          <div className="text-2xl font-black text-amber-400">
            %{summary?.platform_usage_percent || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Genel sunucu disk yükü</div>
        </div>
      </div>

      {/* Main Two-Column View: Tenant Quota Progress & Backups */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Tenant Selector & Storage Quota Detail */}
        <div className="space-y-4">
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="font-black text-white text-base">İşletme Seçimi & Veri Kotası</h3>

            <div>
              <label className="block mb-1 text-slate-400 text-xs font-bold">Hedef Restoran</label>
              <select
                value={selectedTenantCode}
                onChange={(e) => setSelectedTenantCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold text-xs"
              >
                {tenants.map(t => (
                  <option key={t.id} value={t.code}>{t.name} (@{t.code})</option>
                ))}
              </select>
            </div>

            {loadingTenantData ? (
              <div className="p-6 text-center text-slate-500 text-xs font-bold animate-pulse">
                Depolama kotası hesaplanıyor...
              </div>
            ) : quota ? (
              <div className="space-y-4 pt-2">
                
                {/* Visual Quota Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300">Depolama Doluluk Oranı</span>
                    <span className={`font-mono ${quota.usage_percentage >= 90 ? 'text-red-400' : quota.usage_percentage >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      %{quota.usage_percentage} ({quota.total_used_mb} MB / {quota.allocated_quota_mb} MB)
                    </span>
                  </div>

                  <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden p-0.5 border border-slate-750">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${getUsageColor(quota.usage_percentage)}`}
                      style={{ width: `${Math.min(100, Math.max(2, quota.usage_percentage))}%` }}
                    />
                  </div>
                </div>

                {/* DB vs Media breakdown */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-850 border border-slate-800">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Database className="w-3.5 h-3.5 text-cyan-400" />
                      <span>SQLite Veritabanı</span>
                    </div>
                    <div className="font-black text-white text-sm mt-1">{quota.used_db_mb} MB</div>
                    <div className="text-[10px] text-slate-500">.db + wal + shm</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-850 border border-slate-800">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Medya & Görseller</span>
                    </div>
                    <div className="font-black text-white text-sm mt-1">{quota.used_media_mb} MB</div>
                    <div className="text-[10px] text-slate-500">Yüklenen dosyalar</div>
                  </div>
                </div>

                {/* One-Click Backup Action */}
                <button
                  onClick={handleCreateBackup}
                  disabled={isBackingUp}
                  className="w-full py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs shadow-md shadow-cyan-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isBackingUp ? 'Yedek Alınıyor (WAL Checkpoint)...' : 'Hemen Yeni Yedek Al'}</span>
                </button>

              </div>
            ) : null}

          </div>
        </div>

        {/* Right: Tenant Backups Archive Table */}
        <div className="lg:col-span-2">
          <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-black text-white text-base">
                  @{selectedTenantCode} — Yedek Snapshot Arşivi
                </h3>
                <p className="text-xs text-slate-400">
                  İşletmenin geçmişte alınmış veritabanı kopyaları ve geri yükleme noktaları
                </p>
              </div>
              <span className="text-xs font-bold text-slate-400 bg-slate-800 px-3 py-1 rounded-full">
                {backups.length} Yedek Kaydı
              </span>
            </div>

            {loadingTenantData ? (
              <div className="p-12 text-center text-slate-500 text-xs font-bold animate-pulse">
                Yedek listesi yükleniyor...
              </div>
            ) : backups.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Bu restoran için henüz oluşturulmuş bir veritabanı yedeği bulunmuyor. "Hemen Yeni Yedek Al" butonu ile ilk yedeği alabilirsiniz.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-black text-[10px] bg-slate-850">
                      <th className="p-3.5 pl-5">Yedek Adı</th>
                      <th className="p-3.5">Boyut</th>
                      <th className="p-3.5">Oluşturulma Tarihi</th>
                      <th className="p-3.5">Tür</th>
                      <th className="p-3.5 pr-5 text-right">Eylemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-slate-300">
                    {backups.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-800/50 transition">
                        <td className="p-3.5 pl-5 font-mono font-bold text-white max-w-xs truncate">
                          {b.backup_name}
                        </td>
                        <td className="p-3.5 font-bold text-cyan-400">{b.file_size_mb} MB</td>
                        <td className="p-3.5 text-slate-400 font-mono text-[11px]">
                          {new Date(b.created_at).toLocaleString('tr-TR')}
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 uppercase">
                            {b.backup_type}
                          </span>
                        </td>
                        <td className="p-3.5 pr-5 text-right space-x-2">
                          {/* Download Link */}
                          <a
                            href={`/api/master/backups/${b.id}/download`}
                            download
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 cursor-pointer transition"
                            title="Yedek dosyasını bilgisayara indir"
                          >
                            <Download className="w-3.5 h-3.5 text-cyan-400" />
                            <span>İndir</span>
                          </a>

                          {/* Restore Button */}
                          <button
                            onClick={() => handleOpenRestoreModal(b)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 font-bold text-xs border border-amber-800/60 cursor-pointer transition"
                            title="Bu yedeği canlı veritabanına geri yükle"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                            <span>Geri Yükle</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* RESTORE CONFIRMATION MODAL */}
      {restoreBackupTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-amber-500/50 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-amber-500/10 text-amber-400">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
                <div>
                  <h3 className="font-black text-white text-base">Veritabanı Geri Yükleme Onayı</h3>
                  <p className="text-[11px] text-amber-300/80">Kritik işlem: Mevcut veritabanı yedeğe dönecektir</p>
                </div>
              </div>
              <button 
                onClick={() => setRestoreBackupTarget(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-850 border border-slate-800 space-y-1">
                <div className="text-slate-400 font-bold">Geri Yüklenecek Snapshot:</div>
                <div className="font-mono font-bold text-white text-sm">{restoreBackupTarget.backup_name}</div>
                <div className="text-slate-500 text-[11px]">
                  Hedef İşletme: @{restoreBackupTarget.tenant_code} • Boyut: {restoreBackupTarget.file_size_mb} MB
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-900/60 text-amber-200 text-xs leading-relaxed space-y-1.5">
                <p>
                  ⚠️ <strong>Güvenlik Önlemi:</strong> Sistem geri yükleme başlamadan önce mevcut canlı veritabanının anlık güvenlik kopyasını (Pre-Restore Snapshot) otomatik olarak alacaktır.
                </p>
                <p>
                  Yedek yüklendikten sonra POS terminallerine otomatik bildirim gönderilecek ve veritabanı bağlantı havuzu kesintisiz olarak yenilenecektir.
                </p>
              </div>

              <div>
                <label className="block mb-1 text-slate-300 font-bold">
                  Onaylamak için kutuya büyük harflerle <strong className="text-white">ONAYLIYORUM</strong> yazınız:
                </label>
                <input
                  type="text"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder="ONAYLIYORUM"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRestoreBackupTarget(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRestore}
                  disabled={isRestoring || restoreConfirmText !== 'ONAYLIYORUM'}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black cursor-pointer shadow-md shadow-amber-600/30 disabled:opacity-40"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isRestoring ? 'Geri Yükleniyor...' : 'Geri Yüklemeyi Başlat'}</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};
