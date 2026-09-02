import React, { useState } from 'react';
import { X, Megaphone, CheckCircle2, Clock, Mail, ShieldAlert, Sparkles } from 'lucide-react';
import { sound } from '../../services/sound';

interface OkcIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast: (msg: string) => void;
}

export const OkcIntegrationModal: React.FC<OkcIntegrationModalProps> = ({
  isOpen,
  onClose,
  onSuccessToast
}) => {
  const [fullName, setFullName] = useState<string>('Ahmet Yılmaz');
  const [phone, setPhone] = useState<string>('+90 555 000 00 00');
  const [brand, setBrand] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sound.beep();
    onSuccessToast('ÖKC Başvuru talebiniz alındı. Temsilcimiz gün içinde arayacaktır.');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-fadeIn font-sans">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Card (Matching Adisyo Frame 220) */}
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 max-h-[92vh] flex flex-col text-slate-900 dark:text-slate-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 z-20"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 md:p-8 space-y-5">
          {/* Megaphone Top Icon */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shadow-md">
              <Megaphone className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              Yazar Kasa Entegrasyonunda %30 Avantaj!
            </h3>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
            <p className="font-bold text-slate-800 dark:text-slate-200">Değerli İş Ortağımız,</p>
            <p>
              Vergi denetimleri ve dijital kayıt süreçlerinde herhangi bir aksaklık yaşamamak için yazar kasa (ÖKC) entegrasyonlarınızı şimdiden tamamlayın.
            </p>

            <div className="space-y-2 pt-1 text-xs">
              <div className="flex items-start gap-2">
                <span className="text-red-600 flex-shrink-0">🏧</span>
                <span>Adisyo mevcut müşterilerine özel tüm yazar kasa entegrasyon hizmetlerinde %30 indirim sunuyor!</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>Hem entegrasyon süreçlerinizi tamamlayın hem de bu özel avantajdan yararlanın.</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <span>Son dakikaya bırakmayın. Hazırlığınızı şimdi yapın, %30 indirim fırsatını kaçırmayın!</span>
              </div>
              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <span>Detaylı bilgi için bizimle iletişime geçebilirsiniz.</span>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-2 text-xs font-semibold">
            <div className="font-bold text-slate-800 dark:text-slate-200">
              Bilgilerinizi bırakın, gün içerisinde arayalım.
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Ad Soyad:</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Telefon Numarası:</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Kullandığınız ÖKC POS Markası:</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
              >
                <option value="">Marka seçin</option>
                <option value="Beko 300TR">Beko 300TR / 400TR</option>
                <option value="Ingenico iWE280">Ingenico iWE280 / Move 5000</option>
                <option value="Hugin FP-300">Hugin FP-300 / Tiger</option>
                <option value="Profilo S900">Profilo S900 / Verifone</option>
                <option value="Vera Delta">Vera Delta Plus</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-lg transition"
            >
              Gönder
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-bold transition"
              >
                Bir Daha Gösterme
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
