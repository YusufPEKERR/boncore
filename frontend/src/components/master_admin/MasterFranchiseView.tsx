import React, { useState, useEffect } from 'react';
import { 
  GitBranch, Plus, Search, Building2, TrendingUp, 
  ShoppingBag, Utensils, DollarSign, Copy, CheckCircle2, 
  AlertTriangle, X, ArrowRight, Percent, Layers, ShieldCheck
} from 'lucide-react';
import { sound } from '../../services/sound';

export interface FranchiseBrand {
  id: number;
  code: string;
  name: string;
  tax_number?: string;
  tax_office?: string;
  headquarters_address?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  primary_tenant_code?: string;
  status: string;
  branch_count: number;
  created_at?: string;
}

export interface BrandBranchReport {
  branch_id: number;
  branch_code: string;
  branch_name: string;
  city: string;
  is_brand_master: boolean;
  status: string;
  turnover_today: number;
  turnover_month: number;
  orders_today: number;
  active_tables: number;
}

export interface BrandAnalytics {
  brand: {
    id: number;
    code: string;
    name: string;
  };
  consolidated: {
    total_branches: number;
    total_turnover_today: number;
    total_turnover_month: number;
    total_orders_today: number;
    total_active_tables: number;
    average_branch_revenue: number;
  };
  branches: BrandBranchReport[];
}

interface MasterFranchiseViewProps {
  tenants: any[];
  onRefreshMasterData?: () => void;
}

export const MasterFranchiseView: React.FC<MasterFranchiseViewProps> = ({
  tenants,
  onRefreshMasterData
}) => {
  const [brands, setBrands] = useState<FranchiseBrand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<BrandAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);

  // Modals
  const [isAddBrandModalOpen, setIsAddBrandModalOpen] = useState<boolean>(false);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState<boolean>(false);

  // Add Brand Form State
  const [newBrandForm, setNewBrandForm] = useState({
    code: '',
    name: '',
    tax_number: '',
    tax_office: '',
    headquarters_address: '',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    primary_tenant_code: ''
  });

  // Clone Menu Form State
  const [cloneForm, setCloneForm] = useState<{
    source_tenant_code: string;
    target_tenant_codes: string[];
    clone_categories: boolean;
    clone_products: boolean;
    price_adjustment_percent: number;
  }>({
    source_tenant_code: '',
    target_tenant_codes: [],
    clone_categories: true,
    clone_products: true,
    price_adjustment_percent: 0
  });

  const [cloneResult, setCloneResult] = useState<any | null>(null);
  const [isCloning, setIsCloning] = useState<boolean>(false);

  useEffect(() => {
    fetchBrands();
  }, []);

  const fetchBrands = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/master/brands?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const brandList: FranchiseBrand[] = Array.isArray(data) ? data : [];
        setBrands(brandList);
        if (brandList.length > 0 && selectedBrandId === null) {
          setSelectedBrandId(brandList[0].id);
          fetchBrandAnalytics(brandList[0].id);
        }
      }
    } catch (err) {
      console.warn('Brands fetch warning:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBrandAnalytics = async (brandId: number) => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/master/brands/${brandId}/analytics?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      } else {
        setAnalytics(null);
      }
    } catch (err) {
      console.warn('Analytics fetch warning:', err);
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleSelectBrand = (brandId: number) => {
    sound.beep();
    setSelectedBrandId(brandId);
    fetchBrandAnalytics(brandId);
  };

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandForm.code.trim() || !newBrandForm.name.trim()) {
      alert('Marka kodu ve adı zorunludur.');
      return;
    }
    sound.cashDrawer();
    try {
      const res = await fetch('/api/master/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBrandForm)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Marka oluşturulamadı.');
      }
      alert('Franchise ana markası başarıyla oluşturuldu!');
      setIsAddBrandModalOpen(false);
      setNewBrandForm({
        code: '',
        name: '',
        tax_number: '',
        tax_office: '',
        headquarters_address: '',
        contact_person: '',
        contact_phone: '',
        contact_email: '',
        primary_tenant_code: ''
      });
      fetchBrands();
      if (onRefreshMasterData) onRefreshMasterData();
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    }
  };

  const handleOpenCloneModal = (defaultSourceCode?: string) => {
    sound.beep();
    const source = defaultSourceCode || (tenants.length > 0 ? tenants[0].code : '');
    setCloneForm({
      source_tenant_code: source,
      target_tenant_codes: [],
      clone_categories: true,
      clone_products: true,
      price_adjustment_percent: 0
    });
    setCloneResult(null);
    setIsCloneModalOpen(true);
  };

  const toggleTargetTenant = (code: string) => {
    setCloneForm(prev => {
      const exists = prev.target_tenant_codes.includes(code);
      if (exists) {
        return { ...prev, target_tenant_codes: prev.target_tenant_codes.filter(c => c !== code) };
      } else {
        return { ...prev, target_tenant_codes: [...prev.target_tenant_codes, code] };
      }
    });
  };

  const handleExecuteClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneForm.source_tenant_code) {
      alert('Kaynak şube seçilmelidir.');
      return;
    }
    if (cloneForm.target_tenant_codes.length === 0) {
      alert('En az bir hedef şube seçilmelidir.');
      return;
    }

    sound.cashDrawer();
    setIsCloning(true);
    setCloneResult(null);
    try {
      const res = await fetch('/api/master/menu/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_tenant_code: cloneForm.source_tenant_code,
          target_tenant_codes: cloneForm.target_tenant_codes,
          clone_categories: cloneForm.clone_categories,
          clone_products: cloneForm.clone_products,
          price_adjustment_percent: Number(cloneForm.price_adjustment_percent),
          cloned_by: 'master_admin'
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Menü klonlama başarısız.');
      }
      const data = await res.json();
      setCloneResult(data);
      if (selectedBrandId) {
        fetchBrandAnalytics(selectedBrandId);
      }
    } catch (err: any) {
      alert(err.message || 'Klonlama hatası oluştu.');
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Şube & Franchise Yönetimi
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800 font-bold uppercase">
                  Merkezi Zincir Ağı
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Holding & ana marka hiyerarşisi, konsolide zincir ciroları, şube karşılaştırmaları ve menü şablonu replikasyonu.
              </p>
            </div>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleOpenCloneModal()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition cursor-pointer"
          >
            <Copy className="w-4 h-4" />
            <span>Menü Şablonu Klonla</span>
          </button>

          <button
            onClick={() => { sound.beep(); setIsAddBrandModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs border border-slate-700 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Yeni Marka Tanımla</span>
          </button>
        </div>
      </div>

      {/* Brands Selection Tabs / Cards */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Kayıtlı Franchise Markaları ({brands.length})
        </div>

        {brands.length === 0 ? (
          <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center">
            <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-white">Henüz Franchise Markası Tanımlanmamış</h3>
            <p className="text-xs text-slate-500 mt-1">Zincir restoranları bir çatı altında gruplamak için "Yeni Marka Tanımla" butonunu kullanın.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {brands.map((b) => {
              const isSelected = selectedBrandId === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => handleSelectBrand(b.id)}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                    isSelected 
                      ? 'bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-500/50' 
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {b.code}
                    </span>
                    <span className="text-[11px] font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded-full border border-indigo-900">
                      {b.branch_count} Şube
                    </span>
                  </div>
                  <div className="font-black text-white text-base mt-2 truncate">{b.name}</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Merkez: <strong className="text-slate-300">@{b.primary_tenant_code || 'Tanımsız'}</strong>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Brand Consolidated Analytics */}
      {selectedBrandId && (
        <div className="space-y-6 pt-2">
          {analyticsLoading ? (
            <div className="p-12 text-center bg-slate-900 rounded-3xl border border-slate-800 text-slate-400 text-xs font-bold animate-pulse">
              Konsolide zincir verileri hesaplanıyor...
            </div>
          ) : analytics ? (
            <>
              {/* Consolidated Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                    <span>Zincir Bugünkü Ciro</span>
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-emerald-400">
                    ₺{Number(analytics.consolidated.total_turnover_today || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {analytics.consolidated.total_branches} bağlı şubenin toplamı
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                    <span>Aylık Kümülatif Ciro</span>
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-black text-white">
                    ₺{Number(analytics.consolidated.total_turnover_month || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Bu takvim ayı içindeki toplam</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                    <span>Bugünkü Sipariş Adedi</span>
                    <ShoppingBag className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-black text-blue-400">
                    {analytics.consolidated.total_orders_today} Adisyon
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {analytics.consolidated.total_active_tables} aktif açık masa
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                    <span>Şube Başı Ortalama</span>
                    <Layers className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-black text-amber-400">
                    ₺{Number(analytics.consolidated.average_branch_revenue || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Günlük ortalama şube hasılatı</div>
                </div>
              </div>

              {/* Branch Comparison Table */}
              <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-white text-base">
                      {analytics.brand.name} — Şube Performans Karşılaştırması
                    </h3>
                    <p className="text-xs text-slate-400">
                      Zincire bağlı şubelerin gerçek zamanlı sipariş ve hasılat verileri
                    </p>
                  </div>

                  <button
                    onClick={() => handleOpenCloneModal(analytics.branches[0]?.branch_code)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950 text-indigo-300 border border-indigo-800/80 hover:bg-indigo-900 text-xs font-bold transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Şubelere Menü Dağıt</span>
                  </button>
                </div>

                {analytics.branches.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    Bu markaya henüz atanmış bir şube bulunmuyor. Restoranlar sekmesinden restoranları bu markaya bağlayabilirsiniz.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 uppercase font-black text-[10px] bg-slate-850">
                          <th className="p-3.5 pl-5">Şube Adı</th>
                          <th className="p-3.5">Şehir</th>
                          <th className="p-3.5">Rol</th>
                          <th className="p-3.5">Bugünkü Ciro</th>
                          <th className="p-3.5">Aylık Ciro</th>
                          <th className="p-3.5">Sipariş</th>
                          <th className="p-3.5">Açık Masa</th>
                          <th className="p-3.5 pr-5 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-slate-300">
                        {analytics.branches.map((br) => (
                          <tr key={br.branch_id} className="hover:bg-slate-800/50 transition">
                            <td className="p-3.5 pl-5 font-bold text-white">
                              <div className="flex items-center gap-2">
                                <span>{br.branch_name}</span>
                                <span className="font-mono text-[10px] text-slate-400">(@{br.branch_code})</span>
                              </div>
                            </td>
                            <td className="p-3.5 text-slate-400">{br.city || '—'}</td>
                            <td className="p-3.5">
                              {br.is_brand_master ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-950 text-indigo-300 border border-indigo-800 flex items-center gap-1 w-fit">
                                  <ShieldCheck className="w-3 h-3 text-indigo-400" />
                                  Ana Merkez
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-bold">Şube</span>
                              )}
                            </td>
                            <td className="p-3.5 font-bold text-emerald-400">
                              ₺{Number(br.turnover_today || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3.5 font-bold text-slate-200">
                              ₺{Number(br.turnover_month || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3.5 text-white font-bold">{br.orders_today}</td>
                            <td className="p-3.5 text-amber-400 font-bold">{br.active_tables}</td>
                            <td className="p-3.5 pr-5 text-right">
                              <button
                                onClick={() => handleOpenCloneModal(br.branch_code)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 cursor-pointer"
                                title="Bu şubenin menüsünü kaynak alarak klonla"
                              >
                                Kaynak Olarak Klonla
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">
              Marka analitik verileri yüklenemedi.
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Add Brand Modal */}
      {isAddBrandModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fadeIn">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">Yeni Franchise Markası</h3>
                  <p className="text-[11px] text-slate-400">Zincir şubelerin bağlanacağı üst kurumsal marka</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddBrandModalOpen(false)} 
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBrand} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-300 font-bold">Marka Adı *</label>
                  <input
                    type="text"
                    required
                    value={newBrandForm.name}
                    onChange={(e) => setNewBrandForm({ ...newBrandForm, name: e.target.value })}
                    placeholder="Örn: Big Chefs Holding"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-slate-300 font-bold">Marka Kodu (Slug) *</label>
                  <input
                    type="text"
                    required
                    value={newBrandForm.code}
                    onChange={(e) => setNewBrandForm({ ...newBrandForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    placeholder="bigchefs"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-300 font-bold">Ana Merkez Şube Kodu</label>
                  <select
                    value={newBrandForm.primary_tenant_code}
                    onChange={(e) => setNewBrandForm({ ...newBrandForm, primary_tenant_code: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  >
                    <option value="">Merkez Seçin...</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.code}>{t.name} (@{t.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-slate-300 font-bold">Yetkili Kişi</label>
                  <input
                    type="text"
                    value={newBrandForm.contact_person}
                    onChange={(e) => setNewBrandForm({ ...newBrandForm, contact_person: e.target.value })}
                    placeholder="Ad Soyad"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-300 font-bold">Vergi Numarası</label>
                  <input
                    type="text"
                    value={newBrandForm.tax_number}
                    onChange={(e) => setNewBrandForm({ ...newBrandForm, tax_number: e.target.value })}
                    placeholder="10 Haneli VKN"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-slate-300 font-bold">İletişim Telefonu</label>
                  <input
                    type="text"
                    value={newBrandForm.contact_phone}
                    onChange={(e) => setNewBrandForm({ ...newBrandForm, contact_phone: e.target.value })}
                    placeholder="0532..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1 text-slate-300 font-bold">Genel Merkez Adresi</label>
                <textarea
                  rows={2}
                  value={newBrandForm.headquarters_address}
                  onChange={(e) => setNewBrandForm({ ...newBrandForm, headquarters_address: e.target.value })}
                  placeholder="Holding merkez ofisi adresi..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddBrandModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black cursor-pointer shadow-md shadow-indigo-600/30"
                >
                  Markayı Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Clone Menu Dialog */}
      {isCloneModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-fadeIn">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">Şubeler Arası Menü Klonla</h3>
                  <p className="text-[11px] text-slate-400">Kaynak şubenin menü yapısını seçilen şubelere otomatik çoğaltır</p>
                </div>
              </div>
              <button 
                onClick={() => setIsCloneModalOpen(false)} 
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteClone} className="p-6 space-y-4 text-xs">
              
              {/* Source Branch Selector */}
              <div>
                <label className="block mb-1 text-slate-300 font-bold">1. Kaynak Şube (Master Menü)</label>
                <select
                  value={cloneForm.source_tenant_code}
                  onChange={(e) => setCloneForm({ ...cloneForm, source_tenant_code: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold"
                  required
                >
                  <option value="">Kaynak şube seçiniz...</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.code}>{t.name} (@{t.code})</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Kategoriler, ürünler, porsiyon varyantları ve opsiyon grupları bu işletmenin veritabanından okunur.
                </p>
              </div>

              {/* Target Branches Multi-Select */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-bold">2. Hedef Şubeler ({cloneForm.target_tenant_codes.length} seçildi)</label>
                  <button
                    type="button"
                    onClick={() => {
                      const allOthers = tenants.filter(t => t.code !== cloneForm.source_tenant_code).map(t => t.code);
                      setCloneForm({ ...cloneForm, target_tenant_codes: allOthers });
                    }}
                    className="text-indigo-400 hover:underline text-[11px] font-bold cursor-pointer"
                  >
                    Tümünü Seç
                  </button>
                </div>

                <div className="max-h-40 overflow-y-auto p-2 rounded-xl bg-slate-850 border border-slate-800 space-y-1.5">
                  {tenants.filter(t => t.code !== cloneForm.source_tenant_code).map(t => {
                    const checked = cloneForm.target_tenant_codes.includes(t.code);
                    return (
                      <label 
                        key={t.id}
                        className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition ${
                          checked ? 'bg-indigo-950/40 border border-indigo-800/60 text-white' : 'hover:bg-slate-800 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTargetTenant(t.code)}
                          className="rounded text-indigo-600 focus:ring-0"
                        />
                        <span className="font-bold text-xs">{t.name}</span>
                        <span className="font-mono text-[10px] text-slate-500">(@{t.code})</span>
                        <span className="text-[10px] text-slate-400 ml-auto">{t.city}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Price adjustment percentage */}
              <div className="p-3.5 rounded-2xl bg-slate-850 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-bold flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-amber-400" />
                    <span>Fiyat Marjı / Fark Oranı (%)</span>
                  </label>
                  <span className={`font-mono font-bold text-xs ${
                    cloneForm.price_adjustment_percent > 0 ? 'text-emerald-400' : cloneForm.price_adjustment_percent < 0 ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {cloneForm.price_adjustment_percent > 0 ? `+${cloneForm.price_adjustment_percent}%` : `${cloneForm.price_adjustment_percent}%`}
                  </span>
                </div>
                
                <input
                  type="range"
                  min="-50"
                  max="100"
                  step="5"
                  value={cloneForm.price_adjustment_percent}
                  onChange={(e) => setCloneForm({ ...cloneForm, price_adjustment_percent: Number(e.target.value) })}
                  className="w-full accent-indigo-500"
                />

                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>-50% (İndirim)</span>
                  <span>0% (Birebir Aynı Fiyat)</span>
                  <span>+100% (2 Kat Fiyat)</span>
                </div>
              </div>

              {/* Success Result Box */}
              {cloneResult && (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 space-y-1 text-emerald-300">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Menü Klonlama Başarıyla Tamamlandı!</span>
                  </div>
                  <div className="text-[11px] text-emerald-400/80">
                    Kaynak: @{cloneResult.source_tenant} ➔ {cloneResult.target_tenants?.length} hedef şube güncellendi.
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Kopyalanan: {cloneResult.total_categories_copied} Kategori, {cloneResult.total_products_copied} Ürün ve varyant.
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCloneModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold cursor-pointer"
                >
                  Kapat
                </button>
                <button
                  type="submit"
                  disabled={isCloning}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black cursor-pointer shadow-md shadow-indigo-600/30 disabled:opacity-50"
                >
                  <Copy className="w-4 h-4" />
                  <span>{isCloning ? 'Menü Klonlanıyor...' : 'Klonlamayı Başlat'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
