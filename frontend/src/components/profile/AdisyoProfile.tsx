import React, { useState, useEffect } from 'react';
import { User, Shield, KeyRound, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';
import { api } from '../../services/api';

interface AdisyoProfileProps {
  currentUser: StaffUser | null;
  onUserUpdated?: (user: StaffUser) => void;
}

export const AdisyoProfile: React.FC<AdisyoProfileProps> = ({ currentUser, onUserUpdated }) => {
  const [activeTab, setActiveTab] = useState<string>('user_info');
  const [email, setEmail] = useState<string>('admin@boncorepos.com');
  const [phone, setPhone] = useState<string>('+90 532 000 00 00');
  const [name, setName] = useState<string>(currentUser?.name || 'Restoran Yöneticisi');
  const [username, setUsername] = useState<string>(currentUser?.username || 'admin');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  // PIN change state
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');

  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name);
      if (currentUser.username) setUsername(currentUser.username);
    }
  }, [currentUser]);

  const tabs = [
    { id: 'user_info', label: 'Kullanıcı Bilgileri' },
    { id: 'password', label: 'Parola & PIN Değişikliği' },
    { id: 'privacy', label: 'Gizlilik ve Güvenlik' },
    { id: 'account', label: 'Lisans & Hesap Bilgileri' }
  ];

  const showNotice = (text: string, type: 'success' | 'error') => {
    setNotice({ text, type });
    setTimeout(() => setNotice(null), 4000);
  };

  const handleSaveUserInfo = async () => {
    sound.beep();
    setLoading(true);
    try {
      if (currentUser?.id) {
        const updated = await api.updateStaff(currentUser.id, {
          name: name.trim(),
          username: username.trim() || undefined
        });
        localStorage.setItem('boncore_user', JSON.stringify(updated));
        if (onUserUpdated) onUserUpdated(updated);
      }
      showNotice('Kullanıcı bilgileri başarıyla güncellendi.', 'success');
    } catch (err: any) {
      showNotice(err.message || 'Güncelleme yapılamadı.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      sound.warning();
      showNotice('Lütfen mevcut parolanızı girin.', 'error');
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      sound.warning();
      showNotice('Yeni parola en az 4 karakter olmalıdır.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      sound.warning();
      showNotice('Yeni parolalar birbiriyle eşleşmiyor!', 'error');
      return;
    }

    sound.beep();
    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      showNotice('Giriş parolanız başarıyla değiştirildi.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showNotice(err.message || 'Parola güncellenemedi.', 'error');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePin = async () => {
    if (!newPin || newPin.length < 4) {
      sound.warning();
      showNotice('PIN kodu 4 haneli olmalıdır.', 'error');
      return;
    }
    if (newPin !== confirmPin) {
      sound.warning();
      showNotice('Girdiğiniz PIN kodları birbiriyle eşleşmiyor!', 'error');
      return;
    }

    sound.beep();
    setLoading(true);
    try {
      if (currentUser?.id) {
        await api.updateStaff(currentUser.id, {
          pin_code: newPin
        });
        showNotice('Hızlı geçiş PIN kodunuz başarıyla güncellendi.', 'success');
        setNewPin('');
        setConfirmPin('');
      } else {
        showNotice('Oturum açmış kullanıcı ID bulunamadı.', 'error');
      }
    } catch (err: any) {
      showNotice(err.message || 'PIN güncellenemedi.', 'error');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 select-none animate-fadeIn font-sans">
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-rose-600 to-orange-500 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Profil & Güvenlik Ayarları</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                BonCore POS hesap bilgilerinizi, giriş parolanızı ve hızlı PIN kodunuzu yönetin.
              </p>
            </div>
          </div>

          {notice && (
            <div className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn ${
              notice.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
            }`}>
              {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span>{notice.text}</span>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { sound.beep(); setActiveTab(tab.id); }}
              className={`py-3.5 text-xs font-bold whitespace-nowrap transition border-b-2 cursor-pointer ${
                activeTab === tab.id
                  ? 'border-rose-600 text-rose-600 dark:text-rose-400 font-black'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="p-8">
          {activeTab === 'user_info' && (
            <div className="space-y-5 text-xs font-semibold max-w-lg">
              <div>
                <label className="text-slate-500 block mb-1">Ad Soyad / Görünür İsim:</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Giriş Kullanıcı Adı:</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">E-Posta:</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Telefon:</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                />
              </div>
              <button
                disabled={loading}
                onClick={handleSaveUserInfo}
                className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 disabled:opacity-50 text-white font-extrabold text-xs shadow transition cursor-pointer"
              >
                {loading ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
              </button>
            </div>
          )}

          {activeTab === 'password' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-semibold">
              {/* Password Change Card */}
              <form onSubmit={handleUpdatePassword} className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
                  <Lock className="w-4 h-4 text-rose-600" />
                  <span>Giriş Parolasını Değiştir</span>
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Mevcut Parolanız:</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Yeni Parola:</label>
                  <input
                    type="password"
                    placeholder="En az 4 karakter"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Yeni Parola (Tekrar):</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-6 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 disabled:opacity-50 text-white font-extrabold text-xs shadow transition cursor-pointer"
                >
                  {loading ? 'Güncelleniyor...' : 'Giriş Parolasını Güncelle'}
                </button>
              </form>

              {/* Quick PIN Change Card */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
                  <KeyRound className="w-4 h-4 text-amber-500" />
                  <span>Hızlı Geçiş PIN Kodu</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Terminali kilitlemeden personeller arası hızlı geçiş yapmak için kullanılan 4 haneli PIN kodunuz.
                </p>
                <div>
                  <label className="text-slate-500 block mb-1">Yeni 4 Haneli PIN Kodu:</label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white tracking-widest text-center text-base font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Yeni PIN Kodunu Tekrar Girin:</label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white tracking-widest text-center text-base font-mono"
                  />
                </div>
                <button
                  disabled={loading}
                  onClick={handleUpdatePin}
                  className="w-full py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-extrabold text-xs shadow transition cursor-pointer"
                >
                  {loading ? 'Güncelleniyor...' : 'PIN Kodunu Güncelle'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-6 max-w-xl text-xs">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Üyelik ve Lisans Bilgileri</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                BonCore POS v2.0 lisansınız yerel (Local-first) ve bulut senkronize modda sınırsız ve kesintisiz çalışacak şekilde yapılandırılmıştır.
              </p>
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Mevcut Plan:</span>
                  <span className="text-emerald-600">BonCore POS Enterprise v2.0</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Lisans Durumu:</span>
                  <span className="text-blue-600">Ömür Boyu Aktif</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-4 max-w-xl text-xs">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
                <Shield className="w-4 h-4 text-emerald-500" />
                <span>Oturum ve Güvenlik Politikası</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                Tüm kullanıcı parolaları PBKDF2-SHA256 algoritması ile şifrelenerek saklanır ve oturumlarınız kriptografik imzalı erişim anahtarları (Bearer Token) ile korunur.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
