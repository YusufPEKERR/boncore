import React, { useState } from 'react';
import { 
  Printer, FileText, CheckCircle2, RotateCcw, Eye, Sparkles, 
  Wifi, Instagram, Phone, MapPin, Hash, Users, Clock, QrCode, Sliders, Percent
} from 'lucide-react';
import { printThermalReceipt } from '../fiscal/FiscalModal';
import { sound } from '../../services/sound';

export interface ReceiptDesignConfig {
  header_title: string;
  header_sub: string;
  show_logo: boolean;
  paper_width: '80mm' | '58mm';
  font_size: 'small' | 'medium' | 'large';
  show_order_no: boolean;
  show_table_name: boolean;
  show_waiter_name: boolean;
  show_date_time: boolean;
  show_vat_breakdown: boolean;
  show_payment_details: boolean;
  show_qr_code: boolean;
  show_address_phone: boolean;
  footer_message: string;
  footer_sub: string;
  wifi_name: string;
  wifi_password: string;
  instagram: string;
  custom_note: string;
}

export const defaultReceiptDesign: ReceiptDesignConfig = {
  header_title: 'BONCORE RESTORAN',
  header_sub: 'Lezzet & Keyif Noktası',
  show_logo: true,
  paper_width: '80mm',
  font_size: 'medium',
  show_order_no: true,
  show_table_name: true,
  show_waiter_name: true,
  show_date_time: true,
  show_vat_breakdown: true,
  show_payment_details: true,
  show_qr_code: true,
  show_address_phone: true,
  footer_message: 'TEŞEKKÜR EDERİZ • AFİYET OLSUN!',
  footer_sub: 'Mali değeri yoktur, bilgilendirme fişidir.',
  wifi_name: 'BonCore_Guest',
  wifi_password: 'afiyetolsun',
  instagram: '@boncore_restoran',
  custom_note: ''
};

interface ReceiptDesignSettingsProps {
  design: ReceiptDesignConfig;
  onChange: (updated: ReceiptDesignConfig) => void;
  restaurantInfo?: {
    name?: string;
    phone?: string;
    address?: string;
    taxOffice?: string;
    taxNumber?: string;
  };
  onSave?: () => void;
}

export const ReceiptDesignSettings: React.FC<ReceiptDesignSettingsProps> = ({
  design,
  onChange,
  restaurantInfo,
  onSave
}) => {
  const [printSuccess, setPrintSuccess] = useState<boolean>(false);

  const handleUpdate = <K extends keyof ReceiptDesignConfig>(key: K, value: ReceiptDesignConfig[K]) => {
    onChange({
      ...design,
      [key]: value
    });
  };

  const handleResetDefaults = () => {
    sound.beep();
    if (window.confirm('Fiş tasarım ayarlarını varsayılan şablona döndürmek istediğinize emin misiniz?')) {
      onChange({ ...defaultReceiptDesign });
    }
  };

  // Sample data for preview and test printing
  const sampleDoc = {
    doc_no: 'EAD20261030000124',
    ettn: 'a9b2c3d4-e5f6-7890-abcd-ef1234567890',
    date: new Date().toLocaleDateString('tr-TR'),
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    company_title: design.header_title || restaurantInfo?.name || 'BONCORE RESTORAN',
    vkn: restaurantInfo?.taxNumber || '3779901422',
    table_name: 'Bahçe 04',
    waiter_name: 'Ahmet K.',
    cashier_name: 'Kasiyer',
    items: [
      { product_name: 'Dana Antrikot Izgara', quantity: 1, unit_price: 480.00, total_price: 480.00, variant: 'Orta Pişmiş' },
      { product_name: 'Gavurdağı Salatası', quantity: 1, unit_price: 160.00, total_price: 160.00 },
      { product_name: 'Yayık Ayranı', quantity: 2, unit_price: 45.00, total_price: 90.00 },
      { product_name: 'Fıstıklı Katmer', quantity: 1, unit_price: 220.00, total_price: 220.00 }
    ],
    subtotal: 950.00,
    kuver: 70.00,
    discount: 50.00,
    grand_total: 970.00,
    vat_summary: {
      vat_10: { rate: 10, base: 881.82, tax: 88.18 }
    },
    payments: [
      { method: 'Nakit', amount: 470.00 },
      { method: 'Kredi Kartı', amount: 500.00 }
    ],
    receipt_design: design
  };

  const handleTestPrint = async () => {
    sound.beep();
    try {
      await printThermalReceipt(sampleDoc);
      setPrintSuccess(true);
      setTimeout(() => setPrintSuccess(false), 3000);
    } catch (e) {
      console.error('Test print failed', e);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/30 dark:via-slate-900 dark:to-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Termal Fiş & Adisyon Şablon Tasarımı</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-black uppercase">Canlı Önizlemeli</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Yazıcıdan çıkacak adisyon fişlerinin kağıt genişliği, yazı boyutu, başlık, logo, QR kod ve alt mesajlarını buradan özelleştirin.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
            title="Şablonu varsayılana sıfırla"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Varsayılana Dön</span>
          </button>

          <button
            type="button"
            onClick={handleTestPrint}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition cursor-pointer flex items-center gap-1.5 active:scale-95"
            title="Örnek fişi yazdır"
          >
            <Printer className="w-4 h-4" />
            <span>Test Fişi Yazdır</span>
          </button>
        </div>
      </div>

      {printSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Örnek fiş termal yazdırma servisine veya tarayıcı önizleme penceresine gönderildi!</span>
        </div>
      )}

      {/* Main Two-Column Layout: Left Controls (7 cols) & Right Live Preview (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ================= LEFT CONTROLS (7 cols) ================= */}
        <div className="lg:col-span-7 space-y-5">

          {/* 1. Kağıt & Yazı Tipi Formatı */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <Sliders className="w-4 h-4 text-brand-600 dark:text-emerald-400" />
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                1. Kağıt & Yazı Formatı
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Paper Width Selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Termal Kağıt Genişliği:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { sound.beep(); handleUpdate('paper_width', '80mm'); }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      design.paper_width === '80mm'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span className="text-sm font-black">80 mm</span>
                    <span className="text-[10px] font-normal opacity-80">Standart POS Rulo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { sound.beep(); handleUpdate('paper_width', '58mm'); }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      design.paper_width === '58mm'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span className="text-sm font-black">58 mm</span>
                    <span className="text-[10px] font-normal opacity-80">Kompakt / Mobil</span>
                  </button>
                </div>
              </div>

              {/* Font Size Selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Fiş Yazı Boyutu:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'small', label: 'Küçük', desc: 'Sıkışık' },
                    { id: 'medium', label: 'Standart', desc: 'Önerilen' },
                    { id: 'large', label: 'Büyük', desc: 'Okunaklı' }
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { sound.beep(); handleUpdate('font_size', s.id as any); }}
                      className={`py-2 px-1.5 rounded-xl border text-xs font-bold transition cursor-pointer flex flex-col items-center justify-center ${
                        design.font_size === s.id
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span>{s.label}</span>
                      <span className="text-[9px] font-normal opacity-70">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Başlık ve Üst Bilgiler */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <FileText className="w-4 h-4 text-brand-600 dark:text-emerald-400" />
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                2. Fiş Başlığı & Üst Bilgiler
              </h4>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Fiş Başlığı (İşletme Adı):
                </label>
                <input
                  type="text"
                  value={design.header_title}
                  onChange={(e) => handleUpdate('header_title', e.target.value)}
                  placeholder={restaurantInfo?.name || "BONCORE RESTORAN"}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Alt Başlık / Slogan:
                </label>
                <input
                  type="text"
                  value={design.header_sub}
                  onChange={(e) => handleUpdate('header_sub', e.target.value)}
                  placeholder="Lezzet & Keyif Noktası"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Logo Switch */}
              <div className="pt-2 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Logo Gösterimi</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Fişin en üst kısmında restoran logosunu yazdır</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={design.show_logo}
                    onChange={(e) => handleUpdate('show_logo', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* 3. Fiş Üzerinde Gösterilecek Alanlar (Toggles) */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <Eye className="w-4 h-4 text-brand-600 dark:text-emerald-400" />
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                3. Görüntülenecek Alanlar
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'show_order_no', label: 'Belge / Sipariş No', icon: Hash, desc: 'EAD... belge numarası' },
                { key: 'show_table_name', label: 'Masa / Alan Adı', icon: FileText, desc: 'Siparişin ait olduğu masa' },
                { key: 'show_waiter_name', label: 'Garson & Kasiyer Adı', icon: Users, desc: 'Siparişi alan ve ödeyen' },
                { key: 'show_date_time', label: 'Tarih & Saat', icon: Clock, desc: 'Yazdırma zamanı' },
                { key: 'show_vat_breakdown', label: 'KDV Dökümü Tablosu', icon: Percent, desc: '%10, %20 matrah ve vergi' },
                { key: 'show_payment_details', label: 'Tahsilat Detayları', icon: Sparkles, desc: 'Nakit, Kredi Kartı ödemeleri' },
                { key: 'show_address_phone', label: 'Adres & Telefon', icon: MapPin, desc: 'İşletme iletişim bilgisi' },
                { key: 'show_qr_code', label: 'GİB / E-Adisyon QR Kodu', icon: QrCode, desc: 'Mali karekod alanı' },
              ].map((item) => {
                const IconComponent = item.icon;
                const isChecked = Boolean(design[item.key as keyof ReceiptDesignConfig]);

                return (
                  <div 
                    key={item.key}
                    onClick={() => handleUpdate(item.key as any, !isChecked)}
                    className={`p-3 rounded-xl border transition cursor-pointer select-none flex items-center justify-between ${
                      isChecked
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/80 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isChecked ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}>
                        <IconComponent className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{item.label}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.desc}</div>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // Controlled by container onClick
                      className="w-4 h-4 text-emerald-600 rounded-sm focus:ring-emerald-500"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Fiş Altı (Footer) & İletişim Notları */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <Sparkles className="w-4 h-4 text-brand-600 dark:text-emerald-400" />
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                4. Fiş Altı (Footer) & İletişim Bilgileri
              </h4>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Fiş Altı Veda Mesajı:
                </label>
                <input
                  type="text"
                  value={design.footer_message}
                  onChange={(e) => handleUpdate('footer_message', e.target.value)}
                  placeholder="TEŞEKKÜR EDERİZ • AFİYET OLSUN!"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Fiş Altı İkincil Bilgi Notu:
                </label>
                <input
                  type="text"
                  value={design.footer_sub}
                  onChange={(e) => handleUpdate('footer_sub', e.target.value)}
                  placeholder="Mali değeri yoktur, bilgilendirme fişidir."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                    <Wifi className="w-3.5 h-3.5 text-blue-500" />
                    <span>Müşteri Wi-Fi Adı:</span>
                  </label>
                  <input
                    type="text"
                    value={design.wifi_name}
                    onChange={(e) => handleUpdate('wifi_name', e.target.value)}
                    placeholder="BonCore_Guest"
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                    <Wifi className="w-3.5 h-3.5 text-blue-500" />
                    <span>Müşteri Wi-Fi Şifresi:</span>
                  </label>
                  <input
                    type="text"
                    value={design.wifi_password}
                    onChange={(e) => handleUpdate('wifi_password', e.target.value)}
                    placeholder="afiyetolsun"
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                  <Instagram className="w-3.5 h-3.5 text-pink-500" />
                  <span>Instagram / Sosyal Medya:</span>
                </label>
                <input
                  type="text"
                  value={design.instagram}
                  onChange={(e) => handleUpdate('instagram', e.target.value)}
                  placeholder="@boncore_restoran"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Özel Not / Kampanya Metni:
                </label>
                <textarea
                  rows={2}
                  value={design.custom_note}
                  onChange={(e) => handleUpdate('custom_note', e.target.value)}
                  placeholder="Ör: Hafta içi her gün 12:00-15:00 arası tatlılarda %20 indirim!"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ================= RIGHT PANEL: REAL-TIME THERMAL RECEIPT PREVIEW (5 cols) ================= */}
        <div className="lg:col-span-5 sticky top-6 space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
              <Eye className="w-4 h-4 text-emerald-600" />
              <span>CANLI TERMAL FİŞ ÖNİZLEMESİ</span>
            </div>
            <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
              {design.paper_width} • {design.font_size === 'small' ? 'Küçük' : design.font_size === 'large' ? 'Büyük' : 'Standart'}
            </span>
          </div>

          {/* Receipt Paper Simulation */}
          <div className="bg-slate-200 dark:bg-slate-800/80 p-3 sm:p-5 rounded-2xl flex justify-center shadow-inner overflow-hidden">
            <div 
              style={{
                width: design.paper_width === '58mm' ? '250px' : '330px',
                fontSize: design.font_size === 'small' ? '10px' : design.font_size === 'large' ? '13px' : '11px',
                lineHeight: '1.35'
              }}
              className="bg-white text-slate-900 font-mono p-4 sm:p-5 rounded-sm shadow-xl transition-all duration-300 select-text border-t-4 border-dashed border-slate-300 relative"
            >
              {/* Paper Top Sawtooth Effect */}
              <div className="text-center space-y-1 mb-2">
                {design.show_logo && (
                  <div className="flex justify-center mb-1">
                    <img 
                      src="/logo.png" 
                      alt="Logo" 
                      className="h-9 w-auto max-w-[120px] object-contain grayscale opacity-90 contrast-150" 
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="font-black text-sm uppercase tracking-wide">
                  {design.header_title || restaurantInfo?.name || 'BONCORE RESTORAN'}
                </div>
                {design.header_sub && (
                  <div className="text-[10px] text-slate-600 font-medium">{design.header_sub}</div>
                )}
                {design.show_address_phone && (
                  <div className="text-[9px] text-slate-500 pt-0.5">
                    {restaurantInfo?.address || 'Moda Cad. No:84 Kadıköy / İstanbul'}
                    <br />
                    Tel: {restaurantInfo?.phone || '+90 216 444 37 79'}
                  </div>
                )}
                <div className="text-[9px] text-slate-600">
                  VKN: {restaurantInfo?.taxNumber || '3779901422'} • E-ADİSYON FİŞİ
                </div>
                {design.show_order_no && (
                  <div className="text-[9px] text-slate-500">Belge No: EAD20261030000124</div>
                )}
              </div>

              {/* Double Divider */}
              <div className="border-t-2 border-slate-900 my-2" />

              {/* Meta Info Rows */}
              <div className="space-y-0.5 text-[10px]">
                {design.show_table_name && (
                  <div className="flex justify-between">
                    <span><b>Masa:</b> Bahçe 04</span>
                    {design.show_date_time && <span><b>Tarih:</b> {new Date().toLocaleDateString('tr-TR')}</span>}
                  </div>
                )}
                <div className="flex justify-between">
                  {design.show_waiter_name && <span><b>Garson:</b> Ahmet K.</span>}
                  {design.show_date_time && <span><b>Saat:</b> {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
                {design.show_waiter_name && (
                  <div className="flex justify-between">
                    <span><b>Kasiyer:</b> Kasiyer</span>
                  </div>
                )}
              </div>

              {/* Dashed Divider */}
              <div className="border-t border-dashed border-slate-400 my-2" />

              {/* Items Table Header */}
              <div className="flex justify-between font-bold border-b border-slate-300 pb-1 text-[10px]">
                <span style={{ width: '45%' }}>ÜRÜN</span>
                <span style={{ width: '15%', textAlign: 'center' }}>ADET</span>
                <span style={{ width: '20%', textAlign: 'right' }}>BİRİM</span>
                <span style={{ width: '20%', textAlign: 'right' }}>TUTAR</span>
              </div>

              {/* Sample Items */}
              <div className="space-y-1.5 py-1 text-[10px]">
                <div>
                  <div className="flex justify-between font-semibold">
                    <span style={{ width: '45%' }}>Dana Antrikot</span>
                    <span style={{ width: '15%', textAlign: 'center' }}>1</span>
                    <span style={{ width: '20%', textAlign: 'right' }}>480.00</span>
                    <span style={{ width: '20%', textAlign: 'right' }} className="font-bold">480.00</span>
                  </div>
                  <div className="text-[9px] text-slate-500 pl-1">(Orta Pişmiş)</div>
                </div>

                <div className="flex justify-between font-semibold">
                  <span style={{ width: '45%' }}>Gavurdağı Salata</span>
                  <span style={{ width: '15%', textAlign: 'center' }}>1</span>
                  <span style={{ width: '20%', textAlign: 'right' }}>160.00</span>
                  <span style={{ width: '20%', textAlign: 'right' }} className="font-bold">160.00</span>
                </div>

                <div className="flex justify-between font-semibold">
                  <span style={{ width: '45%' }}>Yayık Ayranı</span>
                  <span style={{ width: '15%', textAlign: 'center' }}>2</span>
                  <span style={{ width: '20%', textAlign: 'right' }}>45.00</span>
                  <span style={{ width: '20%', textAlign: 'right' }} className="font-bold">90.00</span>
                </div>

                <div className="flex justify-between font-semibold">
                  <span style={{ width: '45%' }}>Fıstıklı Katmer</span>
                  <span style={{ width: '15%', textAlign: 'center' }}>1</span>
                  <span style={{ width: '20%', textAlign: 'right' }}>220.00</span>
                  <span style={{ width: '20%', textAlign: 'right' }} className="font-bold">220.00</span>
                </div>
              </div>

              {/* Dashed Divider */}
              <div className="border-t border-dashed border-slate-400 my-2" />

              {/* Financial Subtotals */}
              <div className="space-y-0.5 text-[10px]">
                <div className="flex justify-between">
                  <span>Ara Toplam:</span>
                  <b>₺950.00</b>
                </div>
                <div className="flex justify-between">
                  <span>Kuver Bedeli:</span>
                  <b>₺70.00</b>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>İndirim:</span>
                  <b>-₺50.00</b>
                </div>
                {design.show_vat_breakdown && (
                  <div className="flex justify-between text-[9px] text-slate-500">
                    <span>KDV (%10 Dahil):</span>
                    <span>₺88.18</span>
                  </div>
                )}
              </div>

              {/* Grand Total */}
              <div className="border-t-2 border-slate-900 my-2" />
              <div className="flex justify-between text-sm font-black py-0.5">
                <span>GENEL TOPLAM:</span>
                <span>₺970.00</span>
              </div>

              {/* Payment Details */}
              {design.show_payment_details && (
                <>
                  <div className="border-t border-dashed border-slate-400 my-1.5" />
                  <div className="space-y-0.5 text-[10px]">
                    <div className="flex justify-between font-bold">
                      <span>✓ ÖDEME (Nakit):</span>
                      <span>₺470.00</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>✓ ÖDEME (Kredi Kartı):</span>
                      <span>₺500.00</span>
                    </div>
                  </div>
                </>
              )}

              {/* Wi-Fi & Social Media */}
              {(design.wifi_name || design.instagram || design.custom_note) && (
                <>
                  <div className="border-t border-dashed border-slate-300 my-2" />
                  <div className="text-[9px] text-center space-y-0.5 bg-slate-50 p-1.5 rounded-sm border border-slate-200">
                    {design.wifi_name && (
                      <div>
                        📶 <b>Wi-Fi:</b> {design.wifi_name} {design.wifi_password ? `(Şifre: ${design.wifi_password})` : ''}
                      </div>
                    )}
                    {design.instagram && (
                      <div>
                        📷 <b>Instagram:</b> {design.instagram}
                      </div>
                    )}
                    {design.custom_note && (
                      <div className="italic text-slate-600 mt-0.5">
                        {design.custom_note}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* QR Code Area */}
              {design.show_qr_code && (
                <div className="my-3 text-center flex flex-col items-center">
                  <div className="w-16 h-16 border-2 border-slate-900 p-1 bg-white flex items-center justify-center">
                    <QrCode className="w-14 h-14 text-slate-900" />
                  </div>
                  <div className="text-[8px] text-slate-500 font-mono mt-0.5 break-all">
                    ETTN: a9b2c3d4-e5f6-7890-abcd-ef1234567890
                  </div>
                </div>
              )}

              {/* Footer Messages */}
              <div className="border-t-2 border-slate-900 my-2" />
              <div className="text-center space-y-0.5 pt-1">
                {design.footer_message && (
                  <div className="font-black text-[10px] tracking-wide uppercase">
                    {design.footer_message}
                  </div>
                )}
                {design.footer_sub && (
                  <div className="text-[9px] text-slate-500">
                    {design.footer_sub}
                  </div>
                )}
              </div>

              {/* Paper Bottom Jagged Teeth Effect */}
              <div className="absolute -bottom-2 left-0 right-0 h-2 bg-transparent overflow-hidden">
                <div className="w-full h-full bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-transparent via-transparent to-slate-200" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
