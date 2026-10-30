import React, { useState, useEffect } from 'react';
import { 
  Users, KeyRound, Lock, Plus, Edit, ShieldCheck, 
  CheckCircle2, AlertCircle, RefreshCw, X, User, ArrowRight 
} from 'lucide-react';
import { sound } from '../../services/sound';

interface MasterTenantUsersViewProps {
  tenants: any[];
  selectedTenantId: number | null;
  onSelectTenant: (id: number) => void;
}

export const MasterTenantUsersView: React.FC<MasterTenantUsersViewProps> = ({
  tenants,
  selectedTenantId,
  onSelectTenant
}) => {
  const currentTenantId = selectedTenantId || (tenants.length > 0 ? tenants[0].id : 1);
  const selectedTenant = tenants.find(t => t.id === currentTenantId) || tenants[0];

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Password / PIN Change Modal
  const [changingUser, setChangingUser] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState<string>('123456');
  const [newPin, setNewPin] = useState<string>('1234');
  const [saveLoading, setSaveLoading] = useState<boolean>(false);

  // New User Modal
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState<boolean>(false);
  const [newUserName, setNewUserName] = useState<string>('');
  const [newUserUsername, setNewUserUsername] = useState<string>('');
  const [newUserPassword, setNewUserPassword] = useState<string>('123456');
  const [newUserRole, setNewUserRole] = useState<string>('waiter');
  const [newUserPin, setNewUserPin] = useState<string>('');

  useEffect(() => {
    if (currentTenantId) {
      loadTenantUsers(currentTenantId);
    }
  }, [currentTenantId]);

  const loadTenantUsers = async (tenantId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/master/tenants/${tenantId}/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.warn('Failed to load users for tenant', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPasswordModal = (user: any) => {
    sound.beep();
    setChangingUser(user);
    setNewPassword('123456');
    setNewPin(user.pin_code || '1234');
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changingUser) return;

    sound.cashDrawer();
    setSaveLoading(true);

    try {
      const res = await fetch(`/api/master/tenants/${currentTenantId}/users/${changingUser.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_password: newPassword.trim(),
          new_pin: newPin.trim()
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Şifre güncellenemedi.');
      }

      alert(`✅ ${changingUser.name} kullanıcısının şifresi başarıyla "${newPassword}" olarak güncellendi!`);
      setChangingUser(null);
      loadTenantUsers(currentTenantId);
    } catch (err: any) {
      sound.warning();
      alert(err.message || 'Hata oluştu.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserUsername.trim()) {
      alert('Lütfen ad ve kullanıcı adını girin.');
      return;
    }

    sound.cashDrawer();
    try {
      const res = await fetch(`/api/master/tenants/${currentTenantId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName.trim(),
          username: newUserUsername.trim(),
          password: newUserPassword.trim(),
          role: newUserRole,
          pin_code: newUserPin.trim() || undefined
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Kullanıcı oluşturulamadı.');
      }

      alert('Kullanıcı başarıyla oluşturuldu!');
      setIsNewUserModalOpen(false);
      setNewUserName('');
      setNewUserUsername('');
      loadTenantUsers(currentTenantId);
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Tenant Selector */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-emerald-400" />
            <span>Restoran Kullanıcıları & Şifre Yönetimi</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            İstediğiniz restoranı seçin, çalışanlarının şifrelerini ve PIN kodlarını tek tıkla değiştirin.
          </p>
        </div>

        {/* Tenant Selector Dropdown */}
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <label className="text-xs font-bold text-slate-400 shrink-0">Restoran Seç:</label>
          <select
            value={currentTenantId}
            onChange={(e) => onSelectTenant(Number(e.target.value))}
            className="flex-1 lg:w-72 px-3.5 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white font-bold text-xs focus:outline-none focus:border-emerald-500 shadow-xs"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.city || 'İstanbul'})
              </option>
            ))}
          </select>

          <button
            onClick={() => { sound.beep(); setIsNewUserModalOpen(true); }}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition cursor-pointer shadow-md flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Kullanıcı Ekle</span>
          </button>
        </div>
      </div>

      {/* Selected Tenant Info Banner */}
      {selectedTenant && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-base text-white">{selectedTenant.name}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                {selectedTenant.plan}
              </span>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                Giriş Kodu: @{selectedTenant.code}
              </span>
            </div>
            <div className="text-xs text-slate-400 font-medium mt-0.5">
              Yetkili: <b className="text-slate-200">{selectedTenant.owner_name}</b> • Tel: {selectedTenant.phone} • Şehir: {selectedTenant.city}
            </div>
            <div className="text-[11px] text-emerald-400/90 font-medium mt-1">
              💡 Personeller sisteme giriş yaparken Restoran Kullanıcı Adı olarak <strong>@{selectedTenant.code}</strong> girer; şifre veya PIN ise kullanıcının kim olduğunu belirler.
            </div>
          </div>

          <div className="text-xs font-bold text-slate-400">
            Toplam <b className="text-emerald-400">{users.length}</b> Tanımlı Kullanıcı
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Personel Adı</th>
                <th className="py-3.5 px-4">Görevi / Rolü</th>
                <th className="py-3.5 px-4">PIN Kodu</th>
                <th className="py-3.5 px-4">Durum</th>
                <th className="py-3.5 px-4">Son Giriş</th>
                <th className="py-3.5 px-4 text-right">Şifre Değiştir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    Kullanıcılar yükleniyor...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Bu restorana ait kayıtlı kullanıcı bulunmuyor.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-850/60 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-black text-white text-sm">{u.name}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${
                        u.role === 'manager'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : u.role === 'cashier'
                          ? 'bg-blue-950 text-blue-300 border border-blue-800'
                          : u.role === 'chef'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {u.role === 'manager' ? 'Yönetici' : u.role === 'cashier' ? 'Kasiyer' : u.role === 'chef' ? 'Mutfak Şefi' : 'Garson'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-slate-300">
                      {u.pin_code || '---'}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {u.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleString('tr-TR') : 'Giriş yapılmadı'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleOpenPasswordModal(u)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-600/30 to-emerald-600/30 hover:from-brand-600 hover:to-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 font-black text-xs transition cursor-pointer flex items-center gap-1.5 ml-auto"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Şifre & PIN Değiştir</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Şifre ve PIN Değiştir */}
      {changingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
          <div className="relative w-full max-w-md bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-emerald-400" />
                  <span>Şifre & PIN Değiştir</span>
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Personel: <b>{changingUser.name}</b>
                </p>
              </div>
              <button onClick={() => setChangingUser(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePassword} className="space-y-4 text-xs font-bold text-slate-300">
              <div>
                <label className="block mb-1.5">Yeni Giriş Şifresi</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Yeni parola yazın"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-emerald-500 font-bold"
                  />
                </div>
                <div className="flex gap-2 mt-1.5">
                  {['123456', 'restoran2026', 'admin123'].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setNewPassword(sample)}
                      className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] text-slate-400 hover:text-white"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block mb-1.5">Yeni 4 Haneli PIN Kodu (Hızlı Yetki İçin)</label>
                <input
                  type="text"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="Örn: 1234"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-emerald-500 font-bold"
                />
              </div>

              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-[11px] text-emerald-300">
                💡 Değişiklik kaydedildiği anda personelin eski şifresi geçersiz kalır ve anında yeni şifreyle giriş yapabilir.
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setChangingUser(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{saveLoading ? 'Kaydediliyor...' : 'Şifreyi Güncelle'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Yeni Kullanıcı Ekle */}
      {isNewUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
          <div className="relative w-full max-w-md bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <span>Restorana Yeni Personel Ekle</span>
              </h3>
              <button onClick={() => setIsNewUserModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs font-bold text-slate-300">
              <div>
                <label className="block mb-1">Personel Adı Soyadı *</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Örn: Caner Yılmaz"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block mb-1">Giriş Kullanıcı Adı *</label>
                <input
                  type="text"
                  required
                  value={newUserUsername}
                  onChange={(e) => setNewUserUsername(e.target.value)}
                  placeholder="Örn: caner"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block mb-1">Rol / Yetki Seviyesi</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="waiter">Salon Garsonu (Masa & Sipariş)</option>
                  <option value="cashier">Kasiyer (Kasa Tahsilat & Fiş)</option>
                  <option value="chef">Mutfak Şefi (KDS Ekranı)</option>
                  <option value="manager">Yönetici / Müdür (Tam Yetki)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Başlangıç Parolası</label>
                  <input
                    type="text"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1">4 Haneli PIN</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={newUserPin}
                    onChange={(e) => setNewUserPin(e.target.value)}
                    placeholder="Boşsa otomatik"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewUserModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black"
                >
                  Kullanıcıyı Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
