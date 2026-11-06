import React, { useState, useEffect } from 'react';
import { 
  Building2, Plus, Search, Filter, Edit, Users, 
  Trash2, ShieldCheck, CheckCircle2, AlertTriangle, 
  Clock, DollarSign, ArrowRight, X, Phone, Mail, MapPin,
  QrCode, Tv, Bike, Globe, Receipt, Package, Award,
  Check, ToggleLeft, ToggleRight, Sparkles, Monitor, Calendar,
  TrendingUp, CheckCheck, XCircle, RotateCcw
} from 'lucide-react';
import { sound } from '../../services/sound';

interface MasterTenantsViewProps {
  tenants: any[];
  onRefresh: () => void;
  onSelectTenantUsers: (tenantId: number) => void;
  onImpersonateTenant: (tenant: any) => void;
}

export interface TenantFeatureState {
  feature_qr_menu: boolean;
  feature_kds: boolean;
  feature_delivery: boolean;
  feature_integrations: boolean;
  feature_e_invoice: boolean;
  feature_stock_recipe: boolean;
  feature_loyalty: boolean;
  feature_hotel: boolean;
  feature_kiosk: boolean;
  feature_reservations: boolean;
  feature_cost_profit: boolean;
}

export const MODULE_CONFIG = [
  { 
    key: 'feature_qr_menu', 
    label: 'QR Menü & Sipariş', 
    icon: QrCode, 
    desc: 'Temassız masa QR menüsü ve dijital sipariş' 
  },
  { 
    key: 'feature_kds', 
    label: 'KDS Mutfak & Bar', 
    icon: Tv, 
    desc: 'Mutfak istasyonları canlı sipariş hazırlık ekranı' 
  },
  { 
    key: 'feature_delivery', 
    label: 'Paket Servis & CallerID', 
    icon: Bike, 
    desc: 'Arayan numara tanıma ve paket kurye yönetimi' 
  },
  { 
    key: 'feature_integrations', 
    label: 'Platform Entegrasyonları', 
    icon: Globe, 
    desc: 'Yemeksepeti, Getir & Trendyol çift yönlü entegrasyon' 
  },
  { 
    key: 'feature_e_invoice', 
    label: 'E-Fatura & ÖKC Mali', 
    icon: Receipt, 
    desc: 'GİB e-Arşiv, e-Fatura ve mali yazarkasa entegrasyonu' 
  },
  { 
    key: 'feature_stock_recipe', 
    label: 'Reçete & Stok Maliyeti', 
    icon: Package, 
    desc: 'Hammadde düşümü, reçete ve anlık birim maliyet' 
  },
  { 
    key: 'feature_loyalty', 
    label: 'Sadakat & SMS Pazarlama', 
    icon: Award, 
    desc: 'Müşteri puan kazanımı ve SMS kampanya merkezi' 
  },
  { 
    key: 'feature_hotel', 
    label: 'Otel Yönetimi (PMS / Folyo)', 
    icon: Building2, 
    desc: 'Oda hesabına adisyon yansıtma ve otel folyo tahsilatı' 
  },
  { 
    key: 'feature_kiosk', 
    label: 'Self-Servis Kiosk & CFD', 
    icon: Monitor, 
    desc: 'Dokunmatik Kiosk ve müşteri çift yönlü çağrı ekranı' 
  },
  { 
    key: 'feature_reservations', 
    label: 'Masa Rezervasyon & Planlama', 
    icon: Calendar, 
    desc: 'Masa rezervasyonları, kapora ve organizasyon takibi' 
  },
  { 
    key: 'feature_cost_profit', 
    label: 'Maliyet, Kâr & Menü Sihirbazı', 
    icon: TrendingUp, 
    desc: 'Menü mühendisliği, hammadde kârlılık ve birim maliyet' 
  }
];

export const getRecommendedFeatures = (plan: string): TenantFeatureState => {
  switch (plan) {
    case 'starter':
      return {
        feature_qr_menu: true,
        feature_kds: false,
        feature_delivery: false,
        feature_integrations: false,
        feature_e_invoice: false,
        feature_stock_recipe: false,
        feature_loyalty: false,
        feature_hotel: false,
        feature_kiosk: false,
        feature_reservations: false,
        feature_cost_profit: false
      };
    case 'enterprise':
      return {
        feature_qr_menu: true,
        feature_kds: true,
        feature_delivery: true,
        feature_integrations: true,
        feature_e_invoice: true,
        feature_stock_recipe: true,
        feature_loyalty: true,
        feature_hotel: true,
        feature_kiosk: true,
        feature_reservations: true,
        feature_cost_profit: true
      };
    case 'pro':
    default:
      return {
        feature_qr_menu: true,
        feature_kds: true,
        feature_delivery: true,
        feature_integrations: true,
        feature_e_invoice: false,
        feature_stock_recipe: true,
        feature_loyalty: false,
        feature_hotel: false,
        feature_kiosk: false,
        feature_reservations: true,
        feature_cost_profit: false
      };
  }
};

export const MasterTenantsView: React.FC<MasterTenantsViewProps> = ({
  tenants,
  onRefresh,
  onSelectTenantUsers,
  onImpersonateTenant
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingTenant, setEditingTenant] = useState<any | null>(null);
  const [editingFeatures, setEditingFeatures] = useState<TenantFeatureState>(getRecommendedFeatures('pro'));
  const [loadingFeatures, setLoadingFeatures] = useState<boolean>(false);

  // New Tenant Form state
  const [newForm, setNewForm] = useState({
    name: '',
    code: '',
    owner_name: '',
    phone: '',
    email: '',
    city: 'İstanbul',
    tax_number: '',
    tax_office: '',
    address: '',
    plan: 'pro',
    monthly_price: 1490,
    status: 'active',
    admin_username: '',
    admin_password: '123456',
    notes: ''
  });
  const [newFeatures, setNewFeatures] = useState<TenantFeatureState>(getRecommendedFeatures('pro'));
  const [codeManuallyEdited, setCodeManuallyEdited] = useState<boolean>(false);

  const slugify = (text: string) => {
    const tr: Record<string, string> = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u' };
    return text.split('').map(char => tr[char] || char).join('').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  };

  const handleNameChange = (val: string) => {
    if (!codeManuallyEdited) {
      setNewForm(prev => ({ ...prev, name: val, code: slugify(val) }));
    } else {
      setNewForm(prev => ({ ...prev, name: val }));
    }
  };

  const handleSelectAllFeatures = (target: 'edit' | 'new') => {
    sound.beep();
    const allEnabled: TenantFeatureState = {
      feature_qr_menu: true,
      feature_kds: true,
      feature_delivery: true,
      feature_integrations: true,
      feature_e_invoice: true,
      feature_stock_recipe: true,
      feature_loyalty: true,
      feature_hotel: true,
      feature_kiosk: true,
      feature_reservations: true,
      feature_cost_profit: true,
    };
    if (target === 'edit') {
      setEditingFeatures(allEnabled);
    } else {
      setNewFeatures(allEnabled);
    }
  };

  const handleDeselectAllFeatures = (target: 'edit' | 'new') => {
    sound.beep();
    const allDisabled: TenantFeatureState = {
      feature_qr_menu: false,
      feature_kds: false,
      feature_delivery: false,
      feature_integrations: false,
      feature_e_invoice: false,
      feature_stock_recipe: false,
      feature_loyalty: false,
      feature_hotel: false,
      feature_kiosk: false,
      feature_reservations: false,
      feature_cost_profit: false,
    };
    if (target === 'edit') {
      setEditingFeatures(allDisabled);
    } else {
      setNewFeatures(allDisabled);
    }
  };

  const handleResetRecommendedFeatures = (target: 'edit' | 'new', plan: string) => {
    sound.beep();
    const rec = getRecommendedFeatures(plan);
    if (target === 'edit') {
      setEditingFeatures(rec);
    } else {
      setNewFeatures(rec);
    }
  };

  const handlePlanChangeNew = (newPlan: string) => {
    const price = newPlan === 'starter' ? 790 : newPlan === 'enterprise' ? 2990 : 1490;
    setNewForm(prev => ({ ...prev, plan: newPlan, monthly_price: price }));
    setNewFeatures(getRecommendedFeatures(newPlan));
  };

  const handlePlanChangeEdit = (newPlan: string) => {
    if (!editingTenant) return;
    const price = newPlan === 'starter' ? 790 : newPlan === 'enterprise' ? 2990 : 1490;
    setEditingTenant({ ...editingTenant, plan: newPlan, monthly_price: price });
    setEditingFeatures(getRecommendedFeatures(newPlan));
  };

  const handleStartEdit = async (tenant: any) => {
    sound.beep();
    setEditingTenant({ ...tenant });
    setLoadingFeatures(true);
    // Initialize with recommended defaults first
    setEditingFeatures(getRecommendedFeatures(tenant.plan || 'pro'));

    try {
      const res = await fetch(`/api/master/tenants/${tenant.id}/features?_t=${Date.now()}`);
      if (res.ok) {
        const d = await res.json();
        setEditingFeatures({
          feature_qr_menu: Boolean(d.feature_qr_menu),
          feature_kds: Boolean(d.feature_kds),
          feature_delivery: Boolean(d.feature_delivery),
          feature_integrations: Boolean(d.feature_integrations),
          feature_e_invoice: Boolean(d.feature_e_invoice),
          feature_stock_recipe: Boolean(d.feature_stock_recipe),
          feature_loyalty: Boolean(d.feature_loyalty),
          feature_hotel: d.feature_hotel !== undefined ? Boolean(d.feature_hotel) : true,
          feature_kiosk: d.feature_kiosk !== undefined ? Boolean(d.feature_kiosk) : true,
          feature_reservations: d.feature_reservations !== undefined ? Boolean(d.feature_reservations) : true,
          feature_cost_profit: d.feature_cost_profit !== undefined ? Boolean(d.feature_cost_profit) : true,
        });
      }
    } catch (e) {
      console.warn('Failed to fetch tenant features', e);
    } finally {
      setLoadingFeatures(false);
    }
  };

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = 
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.code && t.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.owner_name && t.owner_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.phone && t.phone.includes(searchTerm)) ||
      (t.city && t.city.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.tax_number && t.tax_number.includes(searchTerm));

    const matchesPlan = planFilter === 'all' || t.plan === planFilter;
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

    return matchesSearch && matchesPlan && matchesStatus;
  });

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name.trim()) {
      alert('Lütfen restoran adını girin.');
      return;
    }

    sound.cashDrawer();
    try {
      const res = await fetch('/api/master/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newForm,
          code: newForm.code ? newForm.code.trim().toLowerCase() : slugify(newForm.name)
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Restoran eklenemedi.');
      }
      const data = await res.json();

      // Also initialize feature toggles
      if (data && data.id) {
        await fetch(`/api/master/tenants/${data.id}/features`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: newForm.plan,
            ...newFeatures
          })
        }).catch(() => null);
      }

      alert(`Restoran oluşturuldu!\nRestoran Giriş Kodu: ${data.code}\nYönetici Kullanıcı Adı: ${data.admin_username}\nŞifre: ${data.admin_password}\nPIN: ${data.pin_code}`);
      setIsAddModalOpen(false);
      setCodeManuallyEdited(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    }
  };

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    sound.beep();
    try {
      // 1. Update basic tenant fields
      const res = await fetch(`/api/master/tenants/${editingTenant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: editingTenant.code?.trim().toLowerCase(),
          name: editingTenant.name,
          display_name: editingTenant.display_name ?? editingTenant.name,
          owner_name: editingTenant.owner_name,
          phone: editingTenant.phone,
          email: editingTenant.email,
          city: editingTenant.city,
          plan: editingTenant.plan,
          monthly_price: Number(editingTenant.monthly_price),
          status: editingTenant.status,
          notes: editingTenant.notes
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Güncelleme başarısız.');
      }

      // 2. Update feature flags via dedicated PUT /api/master/tenants/:id/features
      const featRes = await fetch(`/api/master/tenants/${editingTenant.id}/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: editingTenant.plan,
          feature_qr_menu: editingFeatures.feature_qr_menu,
          feature_kds: editingFeatures.feature_kds,
          feature_delivery: editingFeatures.feature_delivery,
          feature_integrations: editingFeatures.feature_integrations,
          feature_e_invoice: editingFeatures.feature_e_invoice,
          feature_stock_recipe: editingFeatures.feature_stock_recipe,
          feature_loyalty: editingFeatures.feature_loyalty,
          feature_hotel: editingFeatures.feature_hotel,
          feature_kiosk: editingFeatures.feature_kiosk,
          feature_reservations: editingFeatures.feature_reservations,
          feature_cost_profit: editingFeatures.feature_cost_profit,
          monthly_price: Number(editingTenant.monthly_price),
          status: editingTenant.status
        })
      });

      if (!featRes.ok) {
        console.warn('Feature update warning');
      }

      const data = await res.json().catch(() => ({}));
      alert(`Restoran bilgileri ve 11 modül lisansı başarıyla kaydedildi!`);
      setEditingTenant(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    }
  };

  const handleDeleteTenant = async (id: number, name: string) => {
    sound.warning();
    if (window.confirm(`"${name}" restoran kaydını ve tüm aboneliğini silmek istediğinize emin misiniz?`)) {
      try {
        await fetch(`/api/master/tenants/${id}`, { method: 'DELETE' });
        onRefresh();
      } catch (e) {
        alert('Silinemedi.');
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-400" />
            <span>Kayıtlı Restoranlar & Modül Lisanslama ({tenants.length})</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Sisteme üye restoranların abonelik planlarını, 7 modül anahtarını ve kullanıcılarını buradan yönetin.
          </p>
        </div>

        <button
          onClick={() => { sound.beep(); setIsAddModalOpen(true); }}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 hover:from-brand-500 hover:to-emerald-500 text-white font-black text-xs transition cursor-pointer shadow-md flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Restoran Ekle</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center gap-3 p-3 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Restoran adı, yetkili, telefon, şehir veya VKN ile ara..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-slate-300 text-xs font-bold focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tüm Planlar</option>
            <option value="starter">Başlangıç (₺790)</option>
            <option value="pro">Profesyonel (₺1.490)</option>
            <option value="enterprise">Kurumsal (₺2.990)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-slate-300 text-xs font-bold focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="trial">Deneme Sürümü</option>
            <option value="suspended">Askıda</option>
          </select>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Restoran & Şehir</th>
                <th className="py-3.5 px-4">Yetkili & İletişim</th>
                <th className="py-3.5 px-4">Abonelik Planı</th>
                <th className="py-3.5 px-4">Aylık Ücret</th>
                <th className="py-3.5 px-4">Durum</th>
                <th className="py-3.5 px-4">Kullanıcılar</th>
                <th className="py-3.5 px-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Aramanızla eşleşen restoran bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-slate-850/60 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-black text-white text-sm">{tenant.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span>{tenant.city || 'İstanbul'}</span>
                        {tenant.tax_number && <span>• VKN: {tenant.tax_number}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 inline-flex items-center gap-1">
                          <Building2 className="w-2.5 h-2.5" />
                          <span>Giriş Kodu: <strong>@{tenant.code}</strong></span>
                        </span>
                        {tenant.display_name && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 inline-flex items-center gap-1" title="POS ekranında Menü altında ve fişte görünen başlık">
                            <span>POS Başlığı: <strong className="text-emerald-300">{tenant.display_name}</strong></span>
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-200">{tenant.owner_name || 'Yetkili Belirtilmedi'}</div>
                      <div className="text-[11px] text-emerald-400 font-mono mt-0.5">{tenant.phone}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                        tenant.plan === 'enterprise' 
                          ? 'bg-purple-950 text-purple-300 border border-purple-800'
                          : tenant.plan === 'pro'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-blue-950 text-blue-300 border border-blue-800'
                      }`}>
                        {tenant.plan}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-black text-slate-200">
                      ₺{Number(tenant.monthly_price || 0).toLocaleString('tr-TR')}/ay
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        tenant.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : tenant.status === 'trial'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                          : 'bg-red-500/10 text-red-400 border border-red-500/30'
                      }`}>
                        {tenant.status === 'active' ? 'Aktif' : tenant.status === 'trial' ? 'Deneme Sürümü' : 'Askıda'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => { sound.beep(); onSelectTenantUsers(tenant.id); }}
                        className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
                        title="Bu restoranın personel kullanıcılarını ve şifrelerini yönet"
                      >
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Kullanıcılar & Şifre</span>
                      </button>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => { sound.beep(); onImpersonateTenant(tenant); }}
                          title="Restoranın POS Ekranına Geç (Giriş Yap)"
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white font-bold text-xs transition cursor-pointer border border-emerald-500/30"
                        >
                          POS'a Geç →
                        </button>

                        <button
                          onClick={() => handleStartEdit(tenant)}
                          title="Restoranı ve Modül Lisanslarını Düzenle"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                          title="Restoranı Sil"
                          className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900 text-red-400 hover:text-white transition cursor-pointer border border-red-900/40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Yeni Restoran Ekle */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
          <div className="relative w-full max-w-2xl bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <span>Yeni Restoran / İşletme Ekle</span>
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-4 text-xs font-bold text-slate-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1">Restoran / İşletme Adı *</label>
                  <input
                    type="text"
                    required
                    value={newForm.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Örn: Bebek Balıkçısı"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-emerald-400 flex items-center justify-between">
                    <span>Restoran Kullanıcı Adı (Giriş Kodu) *</span>
                    <span className="text-[10px] text-slate-400 font-normal">Girişte kullanılır</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold">@</span>
                    <input
                      type="text"
                      required
                      value={newForm.code}
                      onChange={(e) => {
                        setCodeManuallyEdited(true);
                        setNewForm({ ...newForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9\-_]/g, '') });
                      }}
                      placeholder="bebek-balikcisi"
                      className="w-full pl-7 pr-3.5 py-2.5 rounded-xl bg-slate-800 border border-emerald-500/50 text-emerald-300 font-mono font-bold focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1">İşletme Yetkilisi / Sahibi</label>
                  <input
                    type="text"
                    value={newForm.owner_name}
                    onChange={(e) => setNewForm({ ...newForm, owner_name: e.target.value })}
                    placeholder="Örn: Mehmet Bey"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block mb-1">Telefon Numarası</label>
                  <input
                    type="text"
                    value={newForm.phone}
                    onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                    placeholder="0532 000 00 00"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block mb-1">E-Posta Adresi</label>
                  <input
                    type="email"
                    value={newForm.email}
                    onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                    placeholder="restoran@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block mb-1">Şehir</label>
                  <input
                    type="text"
                    value={newForm.city}
                    onChange={(e) => setNewForm({ ...newForm, city: e.target.value })}
                    placeholder="İstanbul"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block mb-1">VKN / TCKN</label>
                  <input
                    type="text"
                    value={newForm.tax_number}
                    onChange={(e) => setNewForm({ ...newForm, tax_number: e.target.value })}
                    placeholder="10 Haneli Vergi No"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block mb-1">Abonelik Planı</label>
                  <select
                    value={newForm.plan}
                    onChange={(e) => handlePlanChangeNew(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="starter">Başlangıç (₺790 / ay)</option>
                    <option value="pro">Profesyonel (₺1.490 / ay)</option>
                    <option value="enterprise">Kurumsal & Zincir (₺2.990 / ay)</option>
                  </select>
                </div>
              </div>

              {/* 11-Module Licensing Grid for New Tenant */}
              <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>11 Modül Lisans Yetkileri</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-normal">
                      Abonelik paketine göre önerilen modüller; tek tıkla hepsini seçebilir veya özelleştirebilirsiniz.
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      {Object.values(newFeatures).filter(Boolean).length} / 11 Aktif
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSelectAllFeatures('new')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 transition cursor-pointer"
                      title="Tüm modül lisanslarını aç"
                    >
                      <CheckCheck className="w-3 h-3" />
                      <span>Tümünü Aç (Hepsini Seç)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeselectAllFeatures('new')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] flex items-center gap-1 transition cursor-pointer border border-slate-700"
                      title="Tüm modülleri kapat"
                    >
                      <XCircle className="w-3 h-3" />
                      <span>Tümünü Kapat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetRecommendedFeatures('new', newForm.plan)}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold text-[10px] flex items-center gap-1 transition cursor-pointer border border-slate-700"
                      title="Plana göre önerilen modülleri sıfırla"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Paket Önerisi</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MODULE_CONFIG.map((m) => {
                    const Icon = m.icon;
                    const isChecked = (newFeatures as any)[m.key];
                    return (
                      <div 
                        key={m.key}
                        onClick={() => setNewFeatures(prev => ({ ...prev, [m.key]: !(prev as any)[m.key] }))}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition select-none ${
                          isChecked 
                            ? 'bg-emerald-950/40 border-emerald-500/50 text-white shadow-xs' 
                            : 'bg-slate-800/50 border-slate-750 text-slate-400 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${isChecked ? 'text-emerald-400' : 'text-slate-500'}`} />
                          <div>
                            <div className="text-xs font-bold leading-tight">{m.label}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[170px]">{m.desc}</div>
                          </div>
                        </div>

                        {isChecked ? (
                          <span className="w-5 h-5 rounded-lg bg-emerald-500 text-black flex items-center justify-center font-bold text-[10px]">
                            ✓
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-lg bg-slate-700 text-slate-500 flex items-center justify-center font-bold text-[10px]">
                            —
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Initial User Credentials Box */}
              <div className="p-4 rounded-2xl bg-slate-850 border border-emerald-500/30 space-y-3">
                <div className="text-xs font-black text-emerald-400">
                  🔑 Otomatik Yönetici Giriş Bilgileri
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1 text-[11px] text-slate-400">Yönetici Kullanıcı Adı</label>
                    <input
                      type="text"
                      value={newForm.admin_username}
                      onChange={(e) => setNewForm({ ...newForm, admin_username: e.target.value })}
                      placeholder="Boş bırakılırsa otomatik üretilir"
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] text-slate-400">Başlangıç Şifresi</label>
                    <input
                      type="text"
                      value={newForm.admin_password}
                      onChange={(e) => setNewForm({ ...newForm, admin_password: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black"
                >
                  Restoranı ve Hesabı Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Restoran Düzenle & 7-Modül Lisanslama */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
          <div className="relative w-full max-w-2xl bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-emerald-400" />
                <span>Restoran Düzenle & Modül Lisanslama</span>
              </h3>
              <button onClick={() => setEditingTenant(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateTenant} className="space-y-4 text-xs font-bold text-slate-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1">Restoran Giriş Kodu (Kullanıcı Adı)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold">@</span>
                    <input
                      type="text"
                      required
                      value={editingTenant.code || ''}
                      onChange={(e) => setEditingTenant({ ...editingTenant, code: e.target.value.toLowerCase().replace(/[^a-z0-9\-_]/g, '') })}
                      className="w-full pl-7 pr-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-emerald-400 font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1">Restoran Adı (Şirket Unvanı)</label>
                  <input
                    type="text"
                    required
                    value={editingTenant.name}
                    onChange={(e) => setEditingTenant({ ...editingTenant, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1">POS Ekranı ve Fiş Başlığı</label>
                <input
                  type="text"
                  value={editingTenant.display_name ?? ''}
                  onChange={(e) => setEditingTenant({ ...editingTenant, display_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-emerald-300 font-bold"
                  placeholder="Örn: FATİH ÇİFTLİĞİ"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Abonelik Planı</label>
                  <select
                    value={editingTenant.plan}
                    onChange={(e) => handlePlanChangeEdit(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  >
                    <option value="starter">Başlangıç (₺790)</option>
                    <option value="pro">Profesyonel (₺1.490)</option>
                    <option value="enterprise">Kurumsal (₺2.990)</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1">Aylık Ücret (₺)</label>
                  <input
                    type="number"
                    value={editingTenant.monthly_price}
                    onChange={(e) => setEditingTenant({ ...editingTenant, monthly_price: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                </div>

                <div>
                  <label className="block mb-1">Durum</label>
                  <select
                    value={editingTenant.status}
                    onChange={(e) => setEditingTenant({ ...editingTenant, status: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  >
                    <option value="active">Aktif</option>
                    <option value="trial">Deneme Sürümü</option>
                    <option value="suspended">Askıya Al</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1">Telefon</label>
                  <input
                    type="text"
                    value={editingTenant.phone || ''}
                    onChange={(e) => setEditingTenant({ ...editingTenant, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                </div>
              </div>

              {/* R1: 11-Module Feature Toggles Grid */}
              <div className="p-4 rounded-2xl bg-slate-850 border border-emerald-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>11-Modül Lisanslama & Özellik İzinleri</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 font-normal">
                      Abonelik paketine göre önerilen modüller; tümünü açabilir veya dilediğinizi özelleştirebilirsiniz.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      {Object.values(editingFeatures).filter(Boolean).length} / 11 Aktif
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSelectAllFeatures('edit')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 transition cursor-pointer"
                      title="Tüm 11 modül lisansını aç"
                    >
                      <CheckCheck className="w-3 h-3" />
                      <span>Tümünü Aç (Hepsini Seç)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeselectAllFeatures('edit')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] flex items-center gap-1 transition cursor-pointer border border-slate-700"
                      title="Tüm modülleri kapat"
                    >
                      <XCircle className="w-3 h-3" />
                      <span>Tümünü Kapat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetRecommendedFeatures('edit', editingTenant.plan)}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold text-[10px] flex items-center gap-1 transition cursor-pointer border border-slate-700"
                      title="Plana göre önerilen modülleri sıfırla"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Paket Önerisi</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {MODULE_CONFIG.map((m) => {
                    const Icon = m.icon;
                    const isChecked = (editingFeatures as any)[m.key];
                    return (
                      <div 
                        key={m.key}
                        onClick={() => setEditingFeatures(prev => ({ ...prev, [m.key]: !(prev as any)[m.key] }))}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition select-none ${
                          isChecked 
                            ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow-sm' 
                            : 'bg-slate-800/40 border-slate-750 text-slate-400 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded-lg ${isChecked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold leading-tight">{m.label}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[170px]">{m.desc}</div>
                          </div>
                        </div>

                        {isChecked ? (
                          <span className="w-6 h-6 rounded-lg bg-emerald-500 text-black flex items-center justify-center font-black text-xs shadow-sm">
                            ✓
                          </span>
                        ) : (
                          <span className="w-6 h-6 rounded-lg bg-slate-750 text-slate-500 flex items-center justify-center font-bold text-xs">
                            ✕
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black"
                >
                  Değişiklikleri ve Lisansları Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
