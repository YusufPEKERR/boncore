import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, CheckCircle2, Percent, Calendar } from 'lucide-react';
import { sound } from '../../services/sound';

interface QrallPosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast: (msg: string) => void;
}

export const QrallPosModal: React.FC<QrallPosModalProps> = ({ isOpen, onClose, onSuccessToast }) => {
  const [businessName, setBusinessName] = useState<string>('FATİH ÇİFTLİĞİ');
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('+90 555 000 00 00');
  const [slideIdx, setSlideIdx] = useState<number>(0);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sound.beep();
    onSuccessToast('Bağlantı başarılı...');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-fadeIn font-sans">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Box (Matching Adisyo Frame 040) */}
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 max-h-[90vh] flex flex-col">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 z-20"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Scrollable Modal Content */}
        <div className="overflow-y-auto p-6 md:p-8 space-y-6">
          {/* Top Promo Carousel Card (Matching Frame 040) */}
          <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-850 border border-slate-200 dark:border-slate-700 text-center space-y-4">
            <div className="flex items-center justify-center gap-1.5 text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
              <span className="w-4 h-4 rounded bg-red-600 text-white flex items-center justify-center text-[10px] font-mono">Q</span>
              <span>QRall POS</span>
            </div>

            <h3 className="text-xl font-black text-slate-900 dark:text-white">Komisyon ve Ödemeler</h3>

            {/* Visual Promo Grid */}
            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-center">
                <div className="text-xl font-black text-red-600 dark:text-red-400 font-mono">%5</div>
                <div className="text-[10px] text-red-700 dark:text-red-300 font-bold">+ KDV İşlem Başına</div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl text-center">
                <div className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono">1 15</div>
                <div className="text-[10px] text-blue-700 dark:text-blue-300 font-bold">Her Ayın 1'i ve 15'i Hakediş</div>
              </div>
            </div>

            <button
              type="button"
              className="px-6 py-2.5 rounded-full bg-[#c0392b] hover:bg-[#a93226] text-white font-extrabold text-xs shadow-md transition"
            >
              Başvuruyu Başlat &gt;
            </button>
          </div>

          {/* Explanation Text */}
          <div className="text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
            <p>
              Müşterileriniz artık QR menü üzerinden verdikleri siparişleri kredi kartıyla online ödeyebilir. Ekstra sanal POS veya banka anlaşmasına gerek yok.
            </p>
            <p>
              Masada, Gel-Al ve Adrese Teslim siparişlerinde ödeme, sipariş sırasında tamamlanır. Müşteriniz doğrudan sizden sipariş verir; yemek platformlarının %35'e varan komisyonları yerine kazancınız sizde kalır.
            </p>

            <div className="p-3.5 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-xs font-bold text-red-900 dark:text-red-200 space-y-1">
              <div>Komisyon: %5 + KDV</div>
              <div>Hakediş ödemeleri: Her ayın 1'i ve 15'i</div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-semibold">
            <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
              Başvuru için formu doldurun, sizi arayalım.
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              QRall Online POS başvurunuzu aşağıdaki formu doldurarak oluşturabilirsiniz.
            </p>

            <div>
              <label className="text-slate-500 block mb-1">İşletme Adı:</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Yetkili Adı Soyadı:</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Kısa yanıt"
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

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg transition"
            >
              BAŞVURUYU GÖNDER
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
