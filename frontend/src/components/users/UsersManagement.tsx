import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Search, Edit3, Trash2, Key, 
  CheckCircle2, XCircle, Shield, Phone, Mail, MoreVertical, 
  Eye, EyeOff, ChevronDown, ChevronUp, X 
} from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';

interface UsersManagementProps {
  currentUser: StaffUser | null;
  onStaffUpdated?: () => void;
}

interface ExtendedStaffUser extends StaffUser {
  email?: string;
  phone?: string;
  last_login?: string;
  created_at?: string;
}

const initialStaff: ExtendedStaffUser[] = [
  {
    id: 1,
    name: '37799 - Fatih Demir',
    role: 'manager',
    pin_code: '1234',
    email: 'fatih@fatihciftligi.com',
    phone: '+90 532 111 22 33',
    is_active: true,
    last_login: 'Bugün 13:42',
    created_at: '01.01.2024'
  },
  {
    id: 2,
    name: 'Mehmet Abi',
    role: 'waiter',
    pin_code: '1111',
    email: 'mehmet@fatihciftligi.com',
    phone: '+90 533 222 33 44',
    is_active: true,
    last_login: 'Bugün 13:30',
    created_at: '15.02.2024'
  },
  {
    id: 3,
    name: 'Ayşe Yılmaz',
    role: 'cashier',
    pin_code: '2222',
    email: 'ayse@fatihciftligi.com',
    phone: '+90 535 333 44 55',
    is_active: true,
    last_login: 'Bugün 12:15',
    created_at: '10.03.2024'
  },
  {
    id: 4,
    name: 'Ahmet Usta',
    role: 'kitchen',
    pin_code: '3333',
    email: 'ahmet@fatihciftligi.com',
    phone: '+90 536 444 55 66',
    is_active: true,
    last_login: 'Bugün 11:00',
    created_at: '01.04.2024'
  },
  {
    id: 5,
    name: 'Caner Kurye',
    role: 'waiter',
    pin_code: '4444',
    email: 'caner@fatihciftligi.com',
    phone: '+90 537 555 66 77',
    is_active: true,
    last_login: 'Dün 20:45',
    created_at: '20.05.2024'
  }
];

import { api } from '../../services/api';

export const UsersManagement: React.FC<UsersManagementProps> = ({ currentUser, onStaffUpdated }) => {
  const [users, setUsers] = useState<ExtendedStaffUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showPins, setShowPins] = useState<Record<number, boolean>>({});

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<ExtendedStaffUser | null>(null);

  // Custom Role Dropdown State in Modal
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState<boolean>(false);

  // Form State
  const [formName, setFormName] = useState<string>('');
  const [formEmail, setFormEmail] = useState<string>('');
  const [formPhone, setFormPhone] = useState<string>('');
  const [formRole, setFormRole] = useState<'waiter' | 'kitchen' | 'courier' | 'cashier' | 'manager' | 'call_center' | 'technical'>('manager');
  const [formPin, setFormPin] = useState<string>('1234');
  const [formActive, setFormActive] = useState<boolean>(true);

  useEffect(() => {
    loadStaffUsers();
  }, []);

  const loadStaffUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getStaffList();
      if (data && data.length > 0) {
        setUsers(data);
      } else {
        setUsers(initialStaff);
      }
    } catch (err) {
      console.warn('Failed to load staff list from backend:', err);
      setUsers(initialStaff);
    } finally {
      setLoading(false);
    }
  };

  const roleOptions = [
    { id: 'waiter', label: 'Garson' },
    { id: 'kitchen', label: 'Mutfak' },
    { id: 'courier', label: 'Kurye' },
    { id: 'cashier', label: 'Kasa' },
    { id: 'manager', label: 'Müdür' },
    { id: 'call_center', label: 'Çağrı Merkezi', isUpgrade: true },
    { id: 'technical', label: 'Teknik', subtext: '( Yazıcı kullanımı için gerekli olup, kullanıcı limitinize dahil değildir )' }
  ];

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormRole('waiter');
    setFormPin('1234');
    setFormActive(true);
    setIsRoleDropdownOpen(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: ExtendedStaffUser) => {
    setEditingUser(u);
    setFormName(u.name);
    setFormEmail(u.email || '');
    setFormPhone(u.phone || '');
    setFormRole((u.role as any) || 'manager');
    setFormPin(u.pin_code || '1234');
    setFormActive(u.is_active);
    setIsRoleDropdownOpen(false);
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.beep();
    try {
      if (editingUser) {
        await api.updateStaff(editingUser.id, {
          name: formName,
          role: formRole,
          pin_code: formPin,
          is_active: formActive
        });
      } else {
        await api.createStaff({
          name: formName,
          role: formRole,
          pin_code: formPin,
          is_active: formActive
        });
      }
      await loadStaffUsers();
      onStaffUpdated?.();
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Kullanıcı kaydedilemedi.');
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) {
      sound.beep();
      try {
        await api.deleteStaff(id);
        await loadStaffUsers();
        onStaffUpdated?.();
        setIsModalOpen(false);
      } catch (err: any) {
        alert(err.message || 'Kullanıcı silinemedi.');
      }
    }
  };

  const togglePinVisibility = (id: number) => {
    setShowPins(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.phone && u.phone.includes(searchQuery));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleLabel = (role: string) => {
    const match = roleOptions.find(r => r.id === role);
    return match ? match.label : role;
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'manager':
        return <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 text-xs font-black">Müdür / Yönetici</span>;
      case 'cashier':
        return <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 text-xs font-black">Kasa / Kasiyer</span>;
      case 'waiter':
        return <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 text-xs font-black">Garson</span>;
      case 'kitchen':
      case 'chef':
        return <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 text-xs font-black">Mutfak / Şef</span>;
      case 'courier':
        return <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 text-xs font-black">Kurye</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-xs font-bold">{role}</span>;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none animate-fadeIn font-sans transition-colors duration-200 space-y-6">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-900 dark:text-white">Kullanıcılar & Personel Yönetimi</h1>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono text-xs font-bold">
              {users.length} Kullanıcı
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Sisteme giriş yapabilen personelleri, rollerini ve hızlı PIN kodlarını buradan yönetebilirsiniz.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-md transition flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          <span>Yeni Kullanıcı Ekle</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="İsim, e-posta veya telefon ile ara..."
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-red-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Rol Filtresi:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-bold focus:outline-none"
          >
            <option value="all">Tüm Roller</option>
            <option value="manager">Müdür / Yönetici</option>
            <option value="cashier">Kasa / Kasiyer</option>
            <option value="waiter">Garson</option>
            <option value="kitchen">Mutfak / Şef</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/60 p-4 border-b border-slate-200 dark:border-slate-800 text-xs font-black text-slate-700 dark:text-slate-300 uppercase">
          <div className="col-span-4">Personel / Kullanıcı</div>
          <div className="col-span-2">Rol</div>
          <div className="col-span-2">Hızlı PIN</div>
          <div className="col-span-2">Son Giriş</div>
          <div className="col-span-2 text-right">İşlemler</div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredUsers.map((u) => {
            const isPinVisible = showPins[u.id];
            return (
              <div key={u.id} className="grid grid-cols-12 p-4 items-center text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                {/* User Info */}
                <div className="col-span-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white font-black text-sm flex items-center justify-center border border-slate-200 dark:border-slate-700 flex-shrink-0">
                    {u.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-sm text-slate-900 dark:text-white truncate">
                      {u.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {u.email || u.phone}
                    </div>
                  </div>
                </div>

                {/* Role Badge */}
                <div className="col-span-2">
                  {getRoleBadge(u.role)}
                </div>

                {/* Quick PIN */}
                <div className="col-span-2 flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                    {isPinVisible ? u.pin_code : '● ● ● ●'}
                  </span>
                  <button
                    onClick={() => togglePinVisibility(u.id)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                    title={isPinVisible ? 'Gizle' : 'Göster'}
                  >
                    {isPinVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Last Login */}
                <div className="col-span-2 text-slate-500 font-medium">
                  {u.last_login}
                </div>

                {/* Actions */}
                <div className="col-span-2 flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(u)}
                    className="p-2 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Düzenle"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteUser(u.id)}
                    className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-xs font-semibold">
              Arama kriterlerine uygun kullanıcı bulunamadı.
            </div>
          )}
        </div>
      </div>

      {/* 1-to-1 Adisyo 3.0 "Kullanıcı Güncelle / Ekle" Modalı (Matching User Screenshot) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-fadeIn font-sans">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-10 overflow-visible text-slate-900 dark:text-slate-100 transition-all">
            {/* Header */}
            <div className="p-6 pb-4 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {editingUser ? 'Kullanıcı Güncelle' : 'Kullanıcı Ekle'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {editingUser 
                    ? 'Güncellemek istediğiniz kullanıcının bilgilerini giriniz' 
                    : 'Eklemek istediğiniz kullanıcının bilgilerini giriniz'}
                </p>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveUser} className="p-6 pt-2 space-y-5 text-xs">
              {/* Field 1: Görev Seçiniz* (Adisyo Custom Dropdown Matching Screenshot) */}
              <div className="relative">
                <label className="text-[11px] font-bold text-red-600 block mb-1">
                  Görev Seçiniz*
                </label>

                {/* Selected Trigger Box */}
                <div
                  onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  className="w-full pb-2 border-b-2 border-red-600 flex items-center justify-between cursor-pointer font-bold text-sm text-slate-900 dark:text-white"
                >
                  <span>{getRoleLabel(formRole)}</span>
                  {isRoleDropdownOpen ? (
                    <ChevronUp className="w-4 h-4 text-red-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>

                {/* Open Dropdown Menu (Matching Screenshot) */}
                {isRoleDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-1 z-30 divide-y divide-slate-100 dark:divide-slate-700 animate-fadeIn">
                    {roleOptions.map((opt) => {
                      const isSelected = formRole === opt.id;
                      return (
                        <div
                          key={opt.id}
                          onClick={() => {
                            sound.beep();
                            setFormRole(opt.id as any);
                            setIsRoleDropdownOpen(false);
                          }}
                          className={`p-3 cursor-pointer transition flex items-center justify-between ${
                            isSelected
                              ? 'bg-slate-200 dark:bg-slate-700 text-slate-950 dark:text-white font-bold'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">{opt.label}</span>
                            {opt.subtext && (
                              <span className="text-[10px] text-slate-400 font-normal">
                                {opt.subtext}
                              </span>
                            )}
                          </div>

                          {opt.isUpgrade && (
                            <span className="bg-[#c0392b] text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                              Yükselt
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Field 2: Ad Soyad* */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Ad Soyad*
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Örn: Fatih Demir"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Field 3: PIN Kodu* */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  4 Haneli PIN Kodu*
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={formPin}
                  onChange={(e) => setFormPin(e.target.value)}
                  placeholder="1234"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white font-black text-sm tracking-widest focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Subtext info under PIN (Exact verbatim text from screenshot) */}
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Birden fazla kullanıcının tek bir ekranı kullandığı durumlarda, kullanıcılar arasında hızlıca geçiş yapmak için kullanılır. Mail ve şifre ile giriş yapma zorunluluğu ortadan kalkar.
              </p>

              {/* Optional Contact Fields */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    E-posta
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="personel@fatihciftligi.com"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    Telefon Numarası
                  </label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+90 532 000 00 00"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Bottom Actions (Matching Adisyo Screenshot: [Sil] text button + [Güncelle] red button) */}
              <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                {editingUser && (
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(editingUser.id)}
                    className="text-red-600 hover:text-red-700 font-bold text-xs transition mr-auto"
                  >
                    Sil
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-800 dark:hover:text-white font-bold text-xs"
                >
                  İptal
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-md transition active:scale-95"
                >
                  {editingUser ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
