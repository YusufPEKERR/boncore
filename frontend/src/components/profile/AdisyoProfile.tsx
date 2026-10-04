import React, { useState } from 'react';
import { User, Shield, KeyRound, Globe, CreditCard, AlertTriangle } from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';

interface AdisyoProfileProps {
  currentUser: StaffUser | null;
}

import { api } from '../../services/api';

export const AdisyoProfile: React.FC<AdisyoProfileProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<string>('user_info');
  const [email, setEmail] = useState<string>('fatih@fatihciftligi.com');
  const [phone, setPhone] = useState<string>('+90 532 000 00 00');
  const [name, setName] = useState<string>(currentUser?.name || '37799 - fatih');
  
  // Password / PIN state
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const tabs = [
    { id: 'user_info', label: 'Kullanıcı Bilgileri' },
    { id: 'password', label: 'PIN / Parola Değişikliği' },
    { id: 'privacy', label: 'Gizlilik ve Güvenlik' },
    { id: 'language', label: 'Dil ve Bölge Ayarları' },
    { id: 'account', label: 'Hesap Ayarları' }
  ];

  const showNotice = (text: string, type: 'success' | 'error') => {
    setNotice({ text, type });
    setTimeout(() => setNotice(null), 3500);
  };

  const handleSaveUserInfo = async () => {
    sound.beep();
    setLoading(true);
    try {
      if (currentUser?.id) {
        await api.updateStaff(currentUser.id, {
          name: name.trim()
        });
      }
      showNotice('Kullanıcı bilgileri başarıyla güncellendi.', 'success');
    } catch (err: any) {
      showNotice(err.message || 'Güncelleme yapılamadı.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePin = async () => {
    if (!newPin || newPin.length < 4) {
      sound.warning();
      showNotice('PIN kodu en az 4 haneli olmalıdır.', 'error');
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
        showNotice('Giriş PIN kodunuz başarıyla güncellendi.', 'success');
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
        {/* Header (Matching Adisyo Frame 005) */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Profil & Kullanıcı Ayarları</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Kullanıcı bilgilerinizi ve PIN kodunuzu güncelleyebilirsiniz.</p>
            </div>
          </div>

          {notice && (
            <div className={`px-4 py-2 rounded-xl text-xs font-bold animate-fadeIn ${
              notice.type === 'success' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
            }`}>
              {notice.text}
            </div>
          )}
        </div>

        {/* Navigation Tabs (Frame 015) */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { sound.beep(); setActiveTab(tab.id); }}
              className={`py-3.5 text-xs font-bold whitespace-nowrap transition border-b-2 ${
                activeTab === tab.id
                  ? 'border-amber-500 text-slate-900 dark:text-white font-black'
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
                <label className="text-slate-500 block mb-1">Kullanıcı Adı / Sicil:</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold"
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
                className="py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-extrabold text-xs shadow transition"
              >
                {loading ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          )}

          {activeTab === 'password' && (
            <div className="space-y-5 text-xs font-semibold max-w-lg">
              <div>
                <label className="text-slate-500 block mb-1">Yeni 4 Haneli PIN Kodu:</label>
                <input
                  type="password"
                  maxLength={6}
                  placeholder="****"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white tracking-widest text-center text-base font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Yeni PIN Kodunu Tekrar Girin:</label>
                <input
                  type="password"
                  maxLength={6}
                  placeholder="****"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white tracking-widest text-center text-base font-mono"
                />
              </div>
              <button
                disabled={loading}
                onClick={handleUpdatePin}
                className="py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-extrabold text-xs shadow transition"
              >
                {loading ? 'Güncelleniyor...' : 'PIN Kodunu Güncelle'}
              </button>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-6 max-w-xl text-xs">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Üyelik ve Lisans Bilgileri</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                BonCore POS lisansınız yerel (Local-first) modda sınırsız ve kesintisiz çalışacak şekilde yapılandırılmıştır.
              </p>
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Mevcut Plan:</span>
                  <span className="text-emerald-600">BonCore Enterprise Pro</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Lisans Durumu:</span>
                  <span className="text-blue-600">Ömür Boyu Aktif</span>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'user_info' && activeTab !== 'password' && activeTab !== 'account' && (
            <div className="py-8 text-center text-slate-400 text-xs">
              Güvenlik, dil ve bölge tercihleri sisteminizle senkronize edilmiştir.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
