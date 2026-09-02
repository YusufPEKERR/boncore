import React, { useState } from 'react';
import { User, Shield, KeyRound, Globe, CreditCard, AlertTriangle } from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';

interface AdisyoProfileProps {
  currentUser: StaffUser | null;
}

export const AdisyoProfile: React.FC<AdisyoProfileProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<string>('user_info');

  const tabs = [
    { id: 'user_info', label: 'Kullanıcı Bilgileri' },
    { id: 'password', label: 'Parola Değişikliği' },
    { id: 'privacy', label: 'Gizlilik ve Güvenlik' },
    { id: 'language', label: 'Dil ve Bölge Ayarları' },
    { id: 'account', label: 'Hesap Ayarları' }
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 select-none animate-fadeIn font-sans">
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Header (Matching Adisyo Frame 005) */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Profil</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Kullanıcı bilgilerinizi güncelleyebilirsiniz.</p>
          </div>
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
                  disabled
                  value={currentUser?.name || '37799 - fatih'}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-700 dark:text-slate-300 font-bold"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">E-Posta:</label>
                <input
                  type="email"
                  defaultValue="fatih@fatihciftligi.com"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Telefon:</label>
                <input
                  type="tel"
                  defaultValue="+90 532 000 00 00"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                />
              </div>
              <button
                onClick={() => { sound.beep(); alert('Kullanıcı bilgileri güncellendi.'); }}
                className="py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs shadow transition"
              >
                Kaydet
              </button>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-6 max-w-xl text-xs">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Üyelik İptali</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                Üyelik iptaliniz sonrası, mevcut aboneliğiniz paket bitiş tarihi tarihine kadar aktif kalacaktır. Bu tarihe kadar sistemi kullanmaya devam edebilirsiniz.
              </p>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                Abonelik süreniz sona erdiğinde hesabınız kalıcı olarak silinecek ve tüm verileriniz geri alınamaz şekilde sistemden kaldırılacaktır.
              </p>
              <button
                onClick={() => { sound.warning(); alert('Abonelik iptal talebi oluşturuldu.'); }}
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 text-slate-700 dark:text-slate-300 font-bold border border-slate-300 dark:border-slate-700 transition"
              >
                Üyeliği İptal Et
              </button>
            </div>
          )}

          {activeTab !== 'user_info' && activeTab !== 'account' && (
            <div className="py-8 text-center text-slate-400 text-xs">
              Güvenlik ve dil tercihleri sisteminizle senkronize edilmiştir.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
