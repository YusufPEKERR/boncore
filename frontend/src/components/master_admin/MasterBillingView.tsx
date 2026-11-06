import React, { useState, useEffect } from 'react';
import { 
  CreditCard, DollarSign, TrendingUp, CheckCircle2, 
  AlertCircle, Clock, Plus, Filter, Search, X, Calendar,
  ShieldCheck, ShieldAlert, Key, Globe, Radio, Zap, 
  RefreshCw, Check, AlertTriangle, Lock
} from 'lucide-react';
import { sound } from '../../services/sound';

export interface VPOSGatewayConfig {
  id?: number;
  gateway_provider: 'paytr' | 'iyzico' | 'manual';
  is_production: boolean;
  merchant_id: string;
  api_key: string;
  api_secret?: string;
  api_secret_set?: boolean;
  merchant_salt?: string;
  merchant_salt_set?: boolean;
  callback_url: string;
  is_active: boolean;
  notes?: string;
  updated_at?: string;
}

interface MasterBillingViewProps {
  stats: any;
  tenants: any[];
  invoices: any[];
  onRefresh: () => void;
}

export const MasterBillingView: React.FC<MasterBillingViewProps> = ({
  stats,
  tenants,
  invoices,
  onRefresh
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'invoices' | 'vpos'>('invoices');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isAddInvoiceOpen, setIsAddInvoiceOpen] = useState<boolean>(false);

  // New Invoice Form
  const [newInvTenantId, setNewInvTenantId] = useState<number>(tenants[0]?.id || 1);
  const [newInvAmount, setNewInvAmount] = useState<number>(1490);
  const [newInvPeriod, setNewInvPeriod] = useState<string>('Kasım 2026');
  const [newInvMethod, setNewInvMethod] = useState<string>('credit_card');
  const [newInvStatus, setNewInvStatus] = useState<string>('paid');

  // VPOS Gateway Form State
  const [activeProvider, setActiveProvider] = useState<'paytr' | 'iyzico'>('paytr');
  const [vposConfigs, setVposConfigs] = useState<Record<string, VPOSGatewayConfig>>({
    paytr: {
      gateway_provider: 'paytr',
      is_production: false,
      merchant_id: '492810',
      api_key: 'PAYTR_KEY_DEMO_2026',
      api_secret: '',
      merchant_salt: '',
      callback_url: 'https://api.boncore.com/api/payment/paytr/callback',
      is_active: true,
      notes: 'PayTR Online Tahsilat & Taksit Altyapısı'
    },
    iyzico: {
      gateway_provider: 'iyzico',
      is_production: false,
      merchant_id: 'sandbox-iyzico-1029',
      api_key: 'sandbox-api-key-boncore',
      api_secret: '',
      merchant_salt: '',
      callback_url: 'https://api.boncore.com/api/payment/iyzico/callback',
      is_active: true,
      notes: 'iyzico Checkout & Abonelik API'
    }
  });

  const [loadingVpos, setLoadingVpos] = useState<boolean>(false);
  const [isTestingConn, setIsTestingConn] = useState<boolean>(false);
  const [connTestResult, setConnTestResult] = useState<any | null>(null);
  const [isSavingVpos, setIsSavingVpos] = useState<boolean>(false);
  const [isRunningDueCheck, setIsRunningDueCheck] = useState<boolean>(false);

  useEffect(() => {
    fetchVposSettings();
  }, []);

  const fetchVposSettings = async () => {
    setLoadingVpos(true);
    try {
      const res = await fetch(`/api/master/billing/gateway-settings?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const mapped: Record<string, VPOSGatewayConfig> = { ...vposConfigs };
          for (const item of data) {
            const p = item.gateway_provider?.toLowerCase();
            if (p === 'paytr' || p === 'iyzico') {
              mapped[p] = {
                id: item.id,
                gateway_provider: p,
                is_production: Boolean(item.is_production),
                merchant_id: item.merchant_id || '',
                api_key: item.api_key || '',
                api_secret: item.api_secret || '',
                api_secret_set: item.api_secret_set,
                merchant_salt: item.merchant_salt || '',
                merchant_salt_set: item.merchant_salt_set,
                callback_url: item.callback_url || '',
                is_active: Boolean(item.is_active),
                notes: item.notes || ''
              };
            }
          }
          setVposConfigs(mapped);
        }
      }
    } catch (e) {
      console.warn('VPOS settings load warning:', e);
    } finally {
      setLoadingVpos(false);
    }
  };

  const handleTestConnection = async (provider: 'paytr' | 'iyzico') => {
    sound.beep();
    setIsTestingConn(true);
    setConnTestResult(null);
    try {
      const res = await fetch('/api/master/billing/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway_provider: provider })
      });
      if (res.ok) {
        const data = await res.json();
        setConnTestResult(data);
      } else {
        throw new Error('Bağlantı testi başarısız.');
      }
    } catch (err: any) {
      setConnTestResult({
        success: false,
        message: err.message || 'Bağlantı kurulamadı.'
      });
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleSaveVposConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.cashDrawer();
    setIsSavingVpos(true);
    const cfg = vposConfigs[activeProvider];

    try {
      const res = await fetch('/api/master/billing/gateway-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway_provider: activeProvider,
          is_production: cfg.is_production,
          merchant_id: cfg.merchant_id,
          api_key: cfg.api_key,
          api_secret: cfg.api_secret || undefined,
          merchant_salt: cfg.merchant_salt || undefined,
          callback_url: cfg.callback_url,
          is_active: cfg.is_active,
          notes: cfg.notes
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'VPOS ayarları kaydedilemedi.');
      }

      alert(`${activeProvider.toUpperCase()} Sanal POS ayarları başarıyla güncellendi!`);
      fetchVposSettings();
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    } finally {
      setIsSavingVpos(false);
    }
  };

  const handleRunDueCheck = async () => {
    sound.warning();
    setIsRunningDueCheck(true);
    try {
      const res = await fetch('/api/master/invoices/run-due-check', { method: 'POST' });
      if (!res.ok) throw new Error('Vade kontrolü başarısız.');
      const data = await res.json();
      alert(data.message || 'Otomatik vade kontrolü tamamlandı.');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    } finally {
      setIsRunningDueCheck(false);
    }
  };

  const handleSuspendTenant = async (tenantId: number, tenantName: string) => {
    sound.warning();
    if (window.confirm(`"${tenantName}" işletmesinin hesabını geciken faturalar nedeniyle Askıya Almak (Read-Only) istediğinize emin misiniz?`)) {
      try {
        const res = await fetch(`/api/master/tenants/${tenantId}/features`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'suspended',
            read_only_mode: true
          })
        });
        if (res.ok) {
          alert(`"${tenantName}" işletmesi askıya alındı ve salt okunur moda geçirildi.`);
          onRefresh();
        }
      } catch (e) {
        alert('İşlem başarısız.');
      }
    }
  };

  const filteredInvoices = invoices.filter(i => {
    const matchesSearch = 
      i.tenant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.period?.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus = true;
    if (statusFilter === 'overdue') matchesStatus = i.status === 'overdue' || i.is_overdue;
    else if (statusFilter !== 'all') matchesStatus = i.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleMarkPaid = async (invoiceId: number) => {
    sound.cashDrawer();
    try {
      const res = await fetch(`/api/master/invoices/${invoiceId}/pay`, { method: 'PUT' });
      if (res.ok) {
        onRefresh();
      }
    } catch (e) {
      alert('İşlem başarısız.');
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.cashDrawer();
    try {
      const res = await fetch('/api/master/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: newInvTenantId,
          amount: Number(newInvAmount),
          period: newInvPeriod,
          payment_method: newInvMethod,
          status: newInvStatus
        })
      });
      if (!res.ok) throw new Error('Fatura oluşturulamadı.');
      setIsAddInvoiceOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    }
  };

  const currentCfg = vposConfigs[activeProvider];

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-400" />
            <span>SaaS Finans, Sanal POS & Vade Yönetimi</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            PayTR ve iyzico ödeme ağ geçitleri, yinelenen abonelik faturaları, vade takibi ve borçlu hesap kısıtlamaları.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRunDueCheck}
            disabled={isRunningDueCheck}
            className="px-3.5 py-2 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 font-bold text-xs border border-amber-800/60 transition cursor-pointer flex items-center gap-1.5"
            title="Vadesi geçen faturaları tara ve kısıtlamaları otomatik uygula"
          >
            <Clock className={`w-3.5 h-3.5 ${isRunningDueCheck ? 'animate-spin' : ''}`} />
            <span>Vade Kontrolü Çalıştır</span>
          </button>

          <button
            onClick={() => { sound.beep(); setIsAddInvoiceOpen(true); }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 hover:from-brand-500 hover:to-emerald-500 text-white font-black text-xs transition cursor-pointer shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>+ Yeni Fatura Düzenle</span>
          </button>
        </div>
      </div>

      {/* Sub-Tab Navigation: Invoices vs Virtual POS */}
      <div className="flex border-b border-slate-800 text-xs font-bold gap-2">
        <button
          onClick={() => { sound.beep(); setActiveSubTab('invoices'); }}
          className={`pb-3 px-4 border-b-2 transition cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'invoices'
              ? 'border-emerald-500 text-emerald-400 font-black'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Abonelik & Fatura Geçmişi</span>
        </button>

        <button
          onClick={() => { sound.beep(); setActiveSubTab('vpos'); }}
          className={`pb-3 px-4 border-b-2 transition cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'vpos'
              ? 'border-emerald-500 text-emerald-400 font-black'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Sanal POS Entegrasyon Ayarları (PayTR / iyzico)</span>
        </button>
      </div>

      {activeSubTab === 'vpos' ? (
        /* VPOS SETTINGS PANEL */
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-sm space-y-6">
            
            {/* Provider Switch Buttons */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>Ödeme Ağ Geçidi Kimlik Bilgileri</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Otomatik kredi kartı tahsilatları ve 3D Secure ödemeler için API kimliklerini yönetin.
                </p>
              </div>

              <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-850 border border-slate-800">
                <button
                  type="button"
                  onClick={() => { sound.beep(); setActiveProvider('paytr'); }}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                    activeProvider === 'paytr'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  PayTR VPOS
                </button>
                <button
                  type="button"
                  onClick={() => { sound.beep(); setActiveProvider('iyzico'); }}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                    activeProvider === 'iyzico'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  iyzico Checkout
                </button>
              </div>
            </div>

            {/* Provider Configuration Form */}
            <form onSubmit={handleSaveVposConfig} className="space-y-4 text-xs">
              
              {/* Environment Toggle & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-850 border border-slate-800">
                <div>
                  <label className="block mb-1 text-slate-400 font-bold">Çalışma Ortamı (Environment)</label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-white">
                      <input
                        type="radio"
                        name="is_production"
                        checked={!currentCfg.is_production}
                        onChange={() => setVposConfigs(prev => ({
                          ...prev,
                          [activeProvider]: { ...prev[activeProvider], is_production: false }
                        }))}
                        className="text-amber-500 focus:ring-0"
                      />
                      <span>Sandbox / Test Ortamı</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-400">
                      <input
                        type="radio"
                        name="is_production"
                        checked={currentCfg.is_production}
                        onChange={() => setVposConfigs(prev => ({
                          ...prev,
                          [activeProvider]: { ...prev[activeProvider], is_production: true }
                        }))}
                        className="text-emerald-500 focus:ring-0"
                      />
                      <span>Canlı / Production</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block mb-1 text-slate-400 font-bold">Ağ Geçidi Durumu</label>
                  <label className="flex items-center gap-2 cursor-pointer text-white font-bold">
                    <input
                      type="checkbox"
                      checked={currentCfg.is_active}
                      onChange={(e) => setVposConfigs(prev => ({
                        ...prev,
                        [activeProvider]: { ...prev[activeProvider], is_active: e.target.checked }
                      }))}
                      className="rounded text-emerald-500"
                    />
                    <span>{activeProvider.toUpperCase()} üzerinden tahsilat alma aktif</span>
                  </label>
                </div>
              </div>

              {/* API Credentials Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-slate-300 font-bold">
                    {activeProvider === 'paytr' ? 'Mağaza No (Merchant ID) *' : 'Üye İşyeri Kodu (Merchant ID) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={currentCfg.merchant_id}
                    onChange={(e) => setVposConfigs(prev => ({
                      ...prev,
                      [activeProvider]: { ...prev[activeProvider], merchant_id: e.target.value }
                    }))}
                    placeholder="Örn: 492810"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-slate-300 font-bold">
                    {activeProvider === 'paytr' ? 'Mağaza Parolası (Merchant Key / API Key) *' : 'API Anahtarı (API Key) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={currentCfg.api_key}
                    onChange={(e) => setVposConfigs(prev => ({
                      ...prev,
                      [activeProvider]: { ...prev[activeProvider], api_key: e.target.value }
                    }))}
                    placeholder="API Key"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-slate-300 font-bold">
                    {activeProvider === 'paytr' ? 'Mağaza Gizli Anahtarı (Merchant Salt)' : 'Gizli Anahtar (Secret Key)'}
                  </label>
                  <input
                    type="password"
                    value={currentCfg.merchant_salt || ''}
                    onChange={(e) => setVposConfigs(prev => ({
                      ...prev,
                      [activeProvider]: { ...prev[activeProvider], merchant_salt: e.target.value }
                    }))}
                    placeholder="••••••••••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Mevcut gizli anahtar maskelenmiştir; değiştirmek için yeni değeri yazın.
                  </p>
                </div>

                <div>
                  <label className="block mb-1 text-slate-300 font-bold">Bildirim Dönüş URL (Callback URL)</label>
                  <input
                    type="text"
                    value={currentCfg.callback_url}
                    onChange={(e) => setVposConfigs(prev => ({
                      ...prev,
                      [activeProvider]: { ...prev[activeProvider], callback_url: e.target.value }
                    }))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Connection Test Result Box */}
              {connTestResult && (
                <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${
                  connTestResult.success 
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' 
                    : 'bg-red-950/40 border-red-800 text-red-300'
                }`}>
                  <div className="flex items-center gap-2.5">
                    {connTestResult.success ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
                    <div>
                      <div className="font-bold">{connTestResult.message}</div>
                      <div className="text-[10px] opacity-80 mt-0.5 font-mono">
                        Mod: {connTestResult.mode} • Gecikme: {connTestResult.ping_ms} ms • Durum: {connTestResult.status}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-black/30">
                    Sınandı
                  </span>
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => handleTestConnection(activeProvider)}
                  disabled={isTestingConn}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs border border-slate-700 transition cursor-pointer disabled:opacity-50"
                >
                  <Radio className={`w-3.5 h-3.5 ${isTestingConn ? 'animate-pulse text-amber-400' : 'text-emerald-400'}`} />
                  <span>{isTestingConn ? 'Bağlantı Sınanıyor...' : `${activeProvider.toUpperCase()} Bağlantısını Sına`}</span>
                </button>

                <button
                  type="submit"
                  disabled={isSavingVpos}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-600/30 transition cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingVpos ? 'Kaydediliyor...' : 'Sanal POS Ayarlarını Kaydet'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      ) : (
        /* INVOICES & RECURRING BILLING OVERVIEW (EXISTING FLOW ENHANCED) */
        <div className="space-y-6">
          {/* Financial Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-1.5">
              <div className="text-xs font-bold text-slate-400">Aylık Düzenli Gelir (MRR)</div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-400">
                ₺{Number(stats?.total_mrr || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-500">Tüm aktif restoranlardan aylık garanti gelir</div>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-1.5">
              <div className="text-xs font-bold text-slate-400">Yıllık Koşu Hızı (ARR)</div>
              <div className="text-2xl sm:text-3xl font-black text-white">
                ₺{Number(stats?.total_arr || 0).toLocaleString('tr-TR')}
              </div>
              <div className="text-[11px] text-slate-500">MRR x 12 aylık projeksiyon</div>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-1.5">
              <div className="text-xs font-bold text-slate-400">Bu Ay Tahsil Edilen</div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-300">
                ₺{Number(stats?.paid_invoices_sum || 0).toLocaleString('tr-TR')}
              </div>
              <div className="text-[11px] text-emerald-500 font-bold">✓ Kasaya giren net tahsilat</div>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-1.5">
              <div className="text-xs font-bold text-slate-400">Bekleyen / Geciken Ödemeler</div>
              <div className="text-2xl sm:text-3xl font-black text-amber-400">
                ₺{Number(stats?.pending_invoices_sum || 0).toLocaleString('tr-TR')}
              </div>
              <div className="text-[11px] text-amber-500">Ödeme bekleyen abonelikler</div>
            </div>
          </div>

          {/* 1. RESTORANLARIN GÜNCEL ABONELİK & PLAN TABLOSU */}
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-sm space-y-4">
            <div className="pb-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Restoran Abonelik Planları & Borç Durumu
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Her işletmenin aktif planı, aylık taahhüdü ve askıya alma yetkisi
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Restoran</th>
                    <th className="py-3 px-4">Abonelik Planı</th>
                    <th className="py-3 px-4">Aylık Ücret</th>
                    <th className="py-3 px-4">Durum</th>
                    <th className="py-3 px-4 text-right">Borç Kısıtlaması</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {tenants.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-850/60 transition">
                      <td className="py-3 px-4 font-bold text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{t.name}</span>
                          <span className="font-mono text-[10px] text-slate-400">(@{t.code})</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          t.plan === 'enterprise' 
                            ? 'bg-purple-950 text-purple-300 border border-purple-800'
                            : t.plan === 'pro'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-blue-950 text-blue-300 border border-blue-800'
                        }`}>
                          {t.plan}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-black text-slate-200">
                        ₺{Number(t.monthly_price || 0).toLocaleString('tr-TR')}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : t.status === 'suspended'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}>
                          {t.status === 'active' ? 'Aktif' : t.status === 'suspended' ? 'Askıya Alındı' : 'Salt Okunur / Deneme'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        {t.status !== 'suspended' ? (
                          <button
                            onClick={() => handleSuspendTenant(t.id, t.name)}
                            className="px-2.5 py-1 rounded-lg bg-red-950/50 hover:bg-red-900/60 text-red-300 font-bold text-[11px] border border-red-900/60 transition cursor-pointer flex items-center gap-1 ml-auto"
                            title="Ödeme gecikmesi durumunda tek tıkla hesabı kitle"
                          >
                            <Lock className="w-3 h-3 text-red-400" />
                            <span>Askıya Al (Read-Only)</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-red-400 font-bold">Askıda (Kilitli)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. TÜM FATURA & TAHSİLAT GEÇMİŞİ */}
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-sm space-y-4">
            <div className="pb-3 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Abonelik Fatura & Tahsilat Kayıtları
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Düzenlenen tüm faturalar, vade durumları ve gecikme uyarıları
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-slate-850 border border-slate-700 text-slate-300 text-xs font-bold"
                >
                  <option value="all">Tüm Faturalar</option>
                  <option value="paid">Ödenenler</option>
                  <option value="pending">Bekleyenler</option>
                  <option value="overdue">Gecikenler (Vadesi Geçmiş)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Fatura No</th>
                    <th className="py-3 px-4">Restoran Adı</th>
                    <th className="py-3 px-4">Dönem</th>
                    <th className="py-3 px-4">Tutar</th>
                    <th className="py-3 px-4">Son Ödeme (Vade)</th>
                    <th className="py-3 px-4">Durum</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        Fatura kaydı bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => {
                      const isOverdue = inv.is_overdue || inv.status === 'overdue';
                      return (
                        <tr key={inv.id} className="hover:bg-slate-850/60 transition">
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            {inv.invoice_no}
                          </td>

                          <td className="py-3 px-4 font-bold text-slate-200">
                            {inv.tenant_name}
                          </td>

                          <td className="py-3 px-4 text-slate-300">
                            {inv.period}
                          </td>

                          <td className="py-3 px-4 font-black text-emerald-400">
                            ₺{Number(inv.amount || 0).toLocaleString('tr-TR')}
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                            {inv.due_date ? new Date(inv.due_date).toLocaleDateString('tr-TR') : 'Vade Belirtilmedi'}
                          </td>

                          <td className="py-3 px-4">
                            {inv.status === 'paid' ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                Ödendi
                              </span>
                            ) : isOverdue ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1 w-fit">
                                <AlertTriangle className="w-3 h-3 text-red-400" />
                                <span>Gecikmede {inv.days_overdue ? `(${inv.days_overdue} gün)` : ''}</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                Bekliyor
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            {inv.status !== 'paid' ? (
                              <button
                                onClick={() => handleMarkPaid(inv.id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer"
                              >
                                Ödendi Olarak İşaretle
                              </button>
                            ) : (
                              <span className="text-[11px] text-emerald-400 font-bold flex items-center justify-end gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Tahsil Edildi</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Manuel Fatura / Tahsilat Ekle */}
      {isAddInvoiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
          <div className="relative w-full max-w-md bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>Manuel Abonelik Faturası Düzenle</span>
              </h3>
              <button onClick={() => setIsAddInvoiceOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-4 text-xs font-bold text-slate-300">
              <div>
                <label className="block mb-1">Restoran / İşletme Seçin</label>
                <select
                  value={newInvTenantId}
                  onChange={(e) => setNewInvTenantId(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                >
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name} (@{t.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Fatura Tutarı (₺)</label>
                  <input
                    type="number"
                    value={newInvAmount}
                    onChange={(e) => setNewInvAmount(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                </div>

                <div>
                  <label className="block mb-1">Fatura Dönemi</label>
                  <input
                    type="text"
                    value={newInvPeriod}
                    onChange={(e) => setNewInvPeriod(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Ödeme Yöntemi</label>
                  <select
                    value={newInvMethod}
                    onChange={(e) => setNewInvMethod(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  >
                    <option value="credit_card">Kredi Kartı (VPOS)</option>
                    <option value="bank_transfer">Havale / EFT</option>
                    <option value="cash">Nakit Tahsilat</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1">Durum</label>
                  <select
                    value={newInvStatus}
                    onChange={(e) => setNewInvStatus(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  >
                    <option value="paid">Ödendi (Tahsil Edildi)</option>
                    <option value="pending">Bekliyor</option>
                    <option value="overdue">Gecikmede</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddInvoiceOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black"
                >
                  Faturayı Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
