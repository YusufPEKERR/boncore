import React, { useState } from 'react';
import { 
  Building2, Plus, Search, Filter, Edit, Users, 
  Trash2, ShieldCheck, CheckCircle2, AlertTriangle, 
  Clock, DollarSign, ArrowRight, X, Phone, Mail, MapPin 
} from 'lucide-react';
import { sound } from '../../services/sound';

interface MasterTenantsViewProps {
  tenants: any[];
  onRefresh: () => void;
  onSelectTenantUsers: (tenantId: number) => void;
  onImpersonateTenant: (tenant: any) => void;
}

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

  // New Tenant Form state
  const [newForm, setNewForm] = useState({
    name: '',
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

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = 
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
        body: JSON.stringify(newForm)
      });
      if (!res.ok) throw new Error('Restoran eklenemedi.');
      const data = await res.json();
      alert(`Restoran oluşturuldu!\nYönetici Kullanıcı Adı: ${data.admin_username}\nŞifre: ${data.admin_password}\nPIN: ${data.pin_code}`);
      setIsAddModalOpen(false);
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
      const res = await fetch(`/api/master/tenants/${editingTenant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingTenant.name,
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
      if (!res.ok) throw new Error('Güncelleme başarısız.');
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
            <span>Kayıtlı Restoranlar & İşletmeler ({tenants.length})</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Sisteme üye tüm restoranların aboneliklerini, kullanıcılarını ve şifrelerini buradan yönetebilirsiniz.
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
                          onClick={() => { sound.beep(); setEditingTenant({ ...tenant }); }}
                          title="Restoranı Düzenle"
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
                    onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    placeholder="Örn: Bebek Balıkçısı"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-bold"
                  />
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
                    onChange={(e) => {
                      const p = e.target.value;
                      const price = p === 'starter' ? 790 : p === 'enterprise' ? 2990 : 1490;
                      setNewForm({ ...newForm, plan: p, monthly_price: price });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="starter">Başlangıç (₺790 / ay)</option>
                    <option value="pro">Profesyonel (₺1.490 / ay)</option>
                    <option value="enterprise">Kurumsal & Zincir (₺2.990 / ay)</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1">Aylık Ücret (₺)</label>
                  <input
                    type="number"
                    value={newForm.monthly_price}
                    onChange={(e) => setNewForm({ ...newForm, monthly_price: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  />
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

      {/* Modal: Restoran Düzenle */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
          <div className="relative w-full max-w-xl bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-black text-white">
                Restoranı Düzenle: {editingTenant.name}
              </h3>
              <button onClick={() => setEditingTenant(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateTenant} className="space-y-4 text-xs font-bold text-slate-300">
              <div>
                <label className="block mb-1">Restoran Adı</label>
                <input
                  type="text"
                  value={editingTenant.name}
                  onChange={(e) => setEditingTenant({ ...editingTenant, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Abonelik Planı</label>
                  <select
                    value={editingTenant.plan}
                    onChange={(e) => {
                      const p = e.target.value;
                      const price = p === 'starter' ? 790 : p === 'enterprise' ? 2990 : 1490;
                      setEditingTenant({ ...editingTenant, plan: p, monthly_price: price });
                    }}
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
                  Değişiklikleri Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
