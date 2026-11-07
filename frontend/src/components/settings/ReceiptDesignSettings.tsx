import React, { useState } from 'react';
import { 
  Printer, FileText, CheckCircle2, RotateCcw, Eye, Sparkles, 
  Wifi, Instagram, MapPin, Hash, Users, Clock, QrCode, Sliders, 
  Percent, Type, Bold, Building2, Minus
} from 'lucide-react';
import { printThermalReceipt } from '../fiscal/FiscalModal';
import { sound } from '../../services/sound';

export type FontWeight = 'normal' | 'semibold' | 'bold' | 'black';

export interface ReceiptDesignConfig {
  header_title: string;
  header_sub: string;
  show_logo: boolean;
  paper_width: '80mm' | '58mm';

  // Tipografi (Yazı Boyutları ve Kalınlıkları)
  header_size: 'medium' | 'large' | 'xlarge';       // Büyük Yazı / Başlık Boyutu
  header_weight: FontWeight;                         // Büyük Yazı Kalınlığı
  body_size: 'small' | 'medium' | 'large';           // Gövde / Ürün Listesi Boyutu
  body_weight: FontWeight;                           // Gövde / Ürün Listesi Kalınlığı
  sub_size: 'xs' | 'small' | 'normal';               // Alt Yazı / Dipnot Boyutu
  sub_weight: FontWeight;                            // Alt Yazı Kalınlığı
  total_weight: 'bold' | 'extrabold' | 'black';      // Genel Toplam Kalınlığı

  // Çizgi & Ayırıcı Formatı
  divider_style: 'solid' | 'dashed' | 'double';      // Çizgi Türü (Varsayılan: 'solid' düz çizgi)
  divider_thickness: number;                         // Çizgi Kalınlığı (px: 1, 2, 3, 4)

  show_vkn: boolean;                                 // VKN gösterilsin mi
  show_e_adisyon_title: boolean;                     // E-Adisyon Fişi başlığı gösterilsin mi
  e_adisyon_title_text: string;                      // E-Adisyon başlık metni

  font_size?: 'small' | 'medium' | 'large';          // Geriye dönük uyumluluk
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
  header_title: 'FATİH ÇİFTLİĞİ',
  header_sub: '',
  show_logo: false,
  paper_width: '80mm',
  header_size: 'large',
  header_weight: 'bold',
  body_size: 'medium',
  body_weight: 'semibold',
  sub_size: 'small',
  sub_weight: 'semibold',
  total_weight: 'black',
  divider_style: 'solid',
  divider_thickness: 2,
  show_vkn: false,
  show_e_adisyon_title: false,
  e_adisyon_title_text: 'E-ADİSYON FİŞİ',
  font_size: 'medium',
  show_order_no: false,
  show_table_name: true,
  show_waiter_name: true,
  show_date_time: true,
  show_vat_breakdown: true,
  show_payment_details: true,
  show_qr_code: false,
  show_address_phone: false,
  footer_message: 'TEŞEKKÜR EDERİZ • AFİYET OLSUN!',
  footer_sub: 'Mali değeri yoktur, bilgi fişidir.',
  wifi_name: '',
  wifi_password: '',
  instagram: '',
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

  // Fallbacks for older cached configs
  const currentDesign: ReceiptDesignConfig = {
    ...defaultReceiptDesign,
    ...design,
    header_size: design.header_size || 'large',
    header_weight: design.header_weight || 'bold',
    body_size: design.body_size || 'medium',
    body_weight: design.body_weight || 'normal',
    sub_size: design.sub_size || 'small',
    sub_weight: design.sub_weight || 'normal',
    total_weight: design.total_weight || 'black',
    divider_style: design.divider_style || 'solid',
    divider_thickness: design.divider_thickness !== undefined ? design.divider_thickness : 2,
    show_vkn: design.show_vkn !== undefined ? design.show_vkn : false,
    show_e_adisyon_title: design.show_e_adisyon_title !== undefined ? design.show_e_adisyon_title : false,
    e_adisyon_title_text: design.e_adisyon_title_text || 'E-ADİSYON FİŞİ'
  };

  const handleUpdate = <K extends keyof ReceiptDesignConfig>(key: K, value: ReceiptDesignConfig[K]) => {
    onChange({
      ...currentDesign,
      [key]: value
    });
  };

  const handleResetDefaults = () => {
    sound.beep();
    if (window.confirm('Fiş tasarım ayarlarını varsayılan şablona döndürmek istediğinize emin misiniz?')) {
      onChange({ ...defaultReceiptDesign });
    }
  };

  // Helper values for preview
  const getHeaderFontSize = () => {
    if (currentDesign.header_size === 'xlarge') return '17px';
    if (currentDesign.header_size === 'medium') return '13px';
    return '15px';
  };

  const getHeaderFontWeight = () => {
    if (currentDesign.header_weight === 'black') return '900';
    if (currentDesign.header_weight === 'bold') return '700';
    if (currentDesign.header_weight === 'semibold') return '600';
    return '400';
  };

  const getBodyFontSize = () => {
    if (currentDesign.body_size === 'large') return '12.5px';
    if (currentDesign.body_size === 'small') return '10px';
    return '11px';
  };

  const getBodyFontWeight = () => {
    if (currentDesign.body_weight === 'black') return '900';
    if (currentDesign.body_weight === 'bold') return '700';
    if (currentDesign.body_weight === 'semibold') return '600';
    return '400';
  };

  const getSubFontSize = () => {
    if (currentDesign.sub_size === 'normal') return '10.5px';
    if (currentDesign.sub_size === 'xs') return '8.5px';
    return '9.5px';
  };

  const getSubFontWeight = () => {
    if (currentDesign.sub_weight === 'black') return '900';
    if (currentDesign.sub_weight === 'bold') return '700';
    if (currentDesign.sub_weight === 'semibold') return '600';
    return '400';
  };

  const getTotalWeight = () => {
    if (currentDesign.total_weight === 'bold') return '700';
    if (currentDesign.total_weight === 'extrabold') return '800';
    return '900';
  };

  const getDividerBorder = () => ({
    borderTopStyle: (currentDesign.divider_style || 'solid') as any,
    borderTopWidth: `${currentDesign.divider_thickness ?? 2}px`,
    borderColor: '#0f172a'
  });

  // Sample data for preview and test printing
  const sampleDoc = {
    doc_no: 'EAD20261030000124',
    ettn: 'a9b2c3d4-e5f6-7890-abcd-ef1234567890',
    date: new Date().toLocaleDateString('tr-TR'),
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    company_title: currentDesign.header_title || restaurantInfo?.name || 'BONCORE RESTORAN',
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
    receipt_design: currentDesign
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

  const weightOptions: { id: FontWeight; label: string; tag: string }[] = [
    { id: 'normal', label: 'Normal', tag: '400' },
    { id: 'semibold', label: 'Yarı Kalın', tag: '600' },
    { id: 'bold', label: 'Kalın', tag: '700' },
    { id: 'black', label: 'Ekstra Kalın', tag: '900' }
  ];

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
              Fiş boyutu, büyük başlıklar, alt yazılar ve her boyuttaki yazının kalınlığını (font weight) ayrı ayrı belirleyin.
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

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ================= LEFT CONTROLS (7 cols) ================= */}
        <div className="lg:col-span-7 space-y-5">

          {/* 1. Kağıt Genişliği */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <Sliders className="w-4 h-4 text-brand-600 dark:text-emerald-400" />
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                1. Kağıt Genişliği
              </h4>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                Termal Kağıt Rulo Genişliği:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { sound.beep(); handleUpdate('paper_width', '80mm'); }}
                  className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    currentDesign.paper_width === '80mm'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span className="text-sm font-black">80 mm Termal Rulo</span>
                  <span className="text-[10px] font-normal opacity-80">Standart Masaüstü POS & Mutfak Yazıcısı</span>
                </button>

                <button
                  type="button"
                  onClick={() => { sound.beep(); handleUpdate('paper_width', '58mm'); }}
                  className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    currentDesign.paper_width === '58mm'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span className="text-sm font-black">58 mm Termal Rulo</span>
                  <span className="text-[10px] font-normal opacity-80">Kompakt Mobil & Bluetooth El Terminali</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. Tipografi: Büyük Yazı, Gövde ve Alt Yazı Boyut & Kalınlık Seçimleri */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-5">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-brand-600 dark:text-emerald-400" />
                <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  2. Yazı Boyutları & Kalınlıkları (Tipografi)
                </h4>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Ayrı Ayrı Ayarlanabilir
              </span>
            </div>

            {/* A) BÜYÜK YAZI / BAŞLIK */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
                  <Bold className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Büyük Yazı (İşletme Adı & Başlıklar)</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {currentDesign.header_size.toUpperCase()} • {currentDesign.header_weight.toUpperCase()}
                </span>
              </div>

              {/* Header Size */}
              <div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">Yazı Boyutu:</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'medium', label: 'Normal', px: '13px' },
                    { id: 'large', label: 'Büyük (Önerilen)', px: '15px' },
                    { id: 'xlarge', label: 'Çok Büyük', px: '17px' }
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { sound.beep(); handleUpdate('header_size', s.id as any); }}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition cursor-pointer flex flex-col items-center ${
                        currentDesign.header_size === s.id
                          ? 'border-emerald-600 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{s.label}</span>
                      <span className="text-[9px] font-mono opacity-70">{s.px}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Header Weight */}
              <div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">Yazı Kalınlığı:</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {weightOptions.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => { sound.beep(); handleUpdate('header_weight', w.id); }}
                      className={`py-1.5 px-1 rounded-lg border text-xs transition cursor-pointer text-center ${
                        currentDesign.header_weight === w.id
                          ? 'border-emerald-600 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20 font-black shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 font-normal'
                      }`}
                      style={{ fontWeight: w.id === 'black' ? 900 : w.id === 'bold' ? 700 : w.id === 'semibold' ? 600 : 400 }}
                    >
                      <span className="block text-[11px]">{w.label}</span>
                      <span className="text-[9px] font-mono opacity-70">({w.tag})</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* B) GÖVDE YAZILARI (Ürünler, Fiyatlar, Kalemler) */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>Gövde Yazıları (Ürün Adları, Miktar & Fiyatlar)</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">
                  {currentDesign.body_size.toUpperCase()} • {currentDesign.body_weight.toUpperCase()}
                </span>
              </div>

              {/* Body Size */}
              <div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">Yazı Boyutu:</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'small', label: 'Küçük', px: '10px' },
                    { id: 'medium', label: 'Standart', px: '11px' },
                    { id: 'large', label: 'Büyük', px: '12.5px' }
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { sound.beep(); handleUpdate('body_size', s.id as any); }}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition cursor-pointer flex flex-col items-center ${
                        currentDesign.body_size === s.id
                          ? 'border-blue-600 bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{s.label}</span>
                      <span className="text-[9px] font-mono opacity-70">{s.px}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Body Weight */}
              <div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">Yazı Kalınlığı:</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {weightOptions.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => { sound.beep(); handleUpdate('body_weight', w.id); }}
                      className={`py-1.5 px-1 rounded-lg border text-xs transition cursor-pointer text-center ${
                        currentDesign.body_weight === w.id
                          ? 'border-blue-600 bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20 font-black shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 font-normal'
                      }`}
                      style={{ fontWeight: w.id === 'black' ? 900 : w.id === 'bold' ? 700 : w.id === 'semibold' ? 600 : 400 }}
                    >
                      <span className="block text-[11px]">{w.label}</span>
                      <span className="text-[9px] font-mono opacity-70">({w.tag})</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* C) ALT YAZI & DİPNOTLAR (Slogan, Tarih, VKN, Wi-Fi, Fiş Altı Mesajı) */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>Alt Yazı & Dipnotlar (Açıklama, Tarih, VKN, Wi-Fi, Teşekkür)</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-purple-600 dark:text-purple-400">
                  {currentDesign.sub_size.toUpperCase()} • {currentDesign.sub_weight.toUpperCase()}
                </span>
              </div>

              {/* Sub Size */}
              <div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">Yazı Boyutu:</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'xs', label: 'Minik', px: '8.5px' },
                    { id: 'small', label: 'Kompakt (Önerilen)', px: '9.5px' },
                    { id: 'normal', label: 'Standart', px: '10.5px' }
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { sound.beep(); handleUpdate('sub_size', s.id as any); }}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition cursor-pointer flex flex-col items-center ${
                        currentDesign.sub_size === s.id
                          ? 'border-purple-600 bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{s.label}</span>
                      <span className="text-[9px] font-mono opacity-70">{s.px}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sub Weight */}
              <div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">Yazı Kalınlığı:</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {weightOptions.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => { sound.beep(); handleUpdate('sub_weight', w.id); }}
                      className={`py-1.5 px-1 rounded-lg border text-xs transition cursor-pointer text-center ${
                        currentDesign.sub_weight === w.id
                          ? 'border-purple-600 bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 font-black shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 font-normal'
                      }`}
                      style={{ fontWeight: w.id === 'black' ? 900 : w.id === 'bold' ? 700 : w.id === 'semibold' ? 600 : 400 }}
                    >
                      <span className="block text-[11px]">{w.label}</span>
                      <span className="text-[9px] font-mono opacity-70">({w.tag})</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* D) GENEL TOPLAM KALINLIĞI */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-black text-slate-800 dark:text-slate-200">Genel Toplam Tutar Kalınlığı</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Fişteki "GENEL TOPLAM" satırının vurgu seviyesi</div>
              </div>

              <div className="flex items-center gap-1.5">
                {[
                  { id: 'bold', label: 'Kalın (700)' },
                  { id: 'extrabold', label: 'Çok Kalın (800)' },
                  { id: 'black', label: 'Ultra Siyah (900)' }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { sound.beep(); handleUpdate('total_weight', t.id as any); }}
                    className={`py-1.5 px-2.5 rounded-lg border text-xs transition cursor-pointer ${
                      currentDesign.total_weight === t.id
                        ? 'border-emerald-600 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20 font-black shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* E) ÇİZGİ & AYIRICI FORMATI */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
                  <Minus className="w-4 h-4 text-emerald-600" />
                  <span>Fiş Ayırıcı Çizgileri (Düz Çizgi & Kalınlık)</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {currentDesign.divider_style === 'solid' ? 'DÜZ ÇİZGİ' : currentDesign.divider_style === 'dashed' ? 'KESİKLİ' : 'ÇİFT ÇİZGİ'} • {currentDesign.divider_thickness}px
                </span>
              </div>

              {/* Çizgi Tipi Seçimi */}
              <div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">Çizgi Tipi:</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'solid', label: 'Düz Çizgi (Önerilen)', lineStyle: 'border-t-2 border-solid' },
                    { id: 'dashed', label: 'Kesikli (-----)', lineStyle: 'border-t-2 border-dashed' },
                    { id: 'double', label: 'Çift Çizgi (═)', lineStyle: 'border-t-4 border-double' }
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { sound.beep(); handleUpdate('divider_style', s.id as any); }}
                      className={`py-2 px-2 rounded-lg border text-xs font-bold transition cursor-pointer flex flex-col items-center gap-1.5 ${
                        currentDesign.divider_style === s.id
                          ? 'border-emerald-600 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{s.label}</span>
                      <div className={`w-12 border-slate-700 dark:border-slate-300 ${s.lineStyle}`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Çizgi Kalınlığı Seçimi */}
              <div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">Çizgi Kalınlığı:</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { val: 1, label: '1 px (İnce)' },
                    { val: 2, label: '2 px (Standart)' },
                    { val: 3, label: '3 px (Kalın)' },
                    { val: 4, label: '4 px (Çok Kalın)' }
                  ].map((th) => (
                    <button
                      key={th.val}
                      type="button"
                      onClick={() => { sound.beep(); handleUpdate('divider_thickness', th.val); }}
                      className={`py-2 px-1 rounded-lg border text-xs transition cursor-pointer flex flex-col items-center gap-1.5 ${
                        currentDesign.divider_thickness === th.val
                          ? 'border-emerald-600 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20 font-black shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 font-normal'
                      }`}
                    >
                      <span className="text-[11px]">{th.label}</span>
                      <div 
                        className="w-10 bg-slate-700 dark:bg-slate-300 rounded-full" 
                        style={{ height: `${th.val}px` }} 
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Başlık Metni & Logo */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <FileText className="w-4 h-4 text-brand-600 dark:text-emerald-400" />
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                3. Fiş Başlığı & Üst Bilgiler
              </h4>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Fiş Başlığı (İşletme Adı):
                </label>
                <input
                  type="text"
                  value={currentDesign.header_title}
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
                  value={currentDesign.header_sub}
                  onChange={(e) => handleUpdate('header_sub', e.target.value)}
                  placeholder="Lezzet & Keyif Noktası"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {currentDesign.show_e_adisyon_title && (
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Fiş Türü Başlığı (Varsayılan: E-ADİSYON FİŞİ):
                  </label>
                  <input
                    type="text"
                    value={currentDesign.e_adisyon_title_text}
                    onChange={(e) => handleUpdate('e_adisyon_title_text', e.target.value)}
                    placeholder="E-ADİSYON FİŞİ"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {/* Logo Switch */}
              <div className="pt-2 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Logo Gösterimi</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Fişin en üst kısmında restoran logosunu yazdır</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentDesign.show_logo}
                    onChange={(e) => handleUpdate('show_logo', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* 4. Görüntülenecek Alanlar (Toggles) */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <Eye className="w-4 h-4 text-brand-600 dark:text-emerald-400" />
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                4. Görüntülenecek Alanlar
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'show_vkn', label: 'Vergi Kimlik No (VKN)', icon: Building2, desc: `Adres & Şirket Bilgilerindeki VKN (${restaurantInfo?.taxNumber || localStorage.getItem('boncore_tax_number') || '3779901422'})` },
                { key: 'show_e_adisyon_title', label: "'E-Adisyon Fişi' İbaresi", icon: FileText, desc: 'Fiş türü / E-Adisyon başlık yazısı' },
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
                const isChecked = Boolean(currentDesign[item.key as keyof ReceiptDesignConfig]);

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
                      onChange={() => {}}
                      className="w-4 h-4 text-emerald-600 rounded-sm focus:ring-emerald-500"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. Fiş Altı (Footer) & İletişim Notları */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <Sparkles className="w-4 h-4 text-brand-600 dark:text-emerald-400" />
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                5. Fiş Altı (Footer) & İletişim Bilgileri
              </h4>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Fiş Altı Veda Mesajı:
                </label>
                <input
                  type="text"
                  value={currentDesign.footer_message}
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
                  value={currentDesign.footer_sub}
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
                    value={currentDesign.wifi_name}
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
                    value={currentDesign.wifi_password}
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
                  value={currentDesign.instagram}
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
                  value={currentDesign.custom_note}
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
            <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
              {currentDesign.paper_width}
            </span>
          </div>

          {/* Receipt Paper Simulation */}
          <div className="bg-slate-200 dark:bg-slate-800/80 p-3 sm:p-5 rounded-2xl flex justify-center shadow-inner overflow-hidden">
            <div 
              style={{
                width: currentDesign.paper_width === '58mm' ? '250px' : '330px',
                lineHeight: '1.35'
              }}
              className="bg-white text-slate-900 font-mono p-4 sm:p-5 rounded-sm shadow-xl transition-all duration-300 select-text border-t-4 border-dashed border-slate-300 relative"
            >
              {/* Top Header & Business Title */}
              <div className="text-center space-y-1 mb-2">
                {currentDesign.show_logo && (
                  <div className="flex justify-center mb-1">
                    <img 
                      src="/logo.png" 
                      alt="Logo" 
                      className="h-9 w-auto max-w-[120px] object-contain grayscale opacity-90 contrast-150" 
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                
                {/* Büyük Yazı / Başlık */}
                <div 
                  style={{ 
                    fontSize: getHeaderFontSize(),
                    fontWeight: getHeaderFontWeight()
                  }}
                  className="uppercase tracking-wide"
                >
                  {currentDesign.header_title || restaurantInfo?.name || 'BONCORE RESTORAN'}
                </div>

                {/* Alt Yazı: Slogan */}
                {currentDesign.header_sub && (
                  <div 
                    style={{ 
                      fontSize: getSubFontSize(),
                      fontWeight: getSubFontWeight()
                    }}
                    className="text-slate-600"
                  >
                    {currentDesign.header_sub}
                  </div>
                )}

                {/* Alt Yazı: Adres & Telefon */}
                {currentDesign.show_address_phone && (
                  <div 
                    style={{ 
                      fontSize: getSubFontSize(),
                      fontWeight: getSubFontWeight()
                    }}
                    className="text-slate-500 pt-0.5"
                  >
                    {restaurantInfo?.address || 'Moda Cad. No:84 Kadıköy / İstanbul'}
                    <br />
                    Tel: {restaurantInfo?.phone || '+90 216 444 37 79'}
                  </div>
                )}

                {/* Alt Yazı: VKN & Fiş Türü / E-Adisyon Başlığı */}
                {(currentDesign.show_vkn || currentDesign.show_e_adisyon_title) && (
                  <div 
                    style={{ 
                      fontSize: getSubFontSize(),
                      fontWeight: getSubFontWeight()
                    }}
                    className="text-slate-600"
                  >
                    {currentDesign.show_vkn && `VKN: ${restaurantInfo?.taxNumber || localStorage.getItem('boncore_tax_number') || '3779901422'}`}
                    {currentDesign.show_vkn && currentDesign.show_e_adisyon_title && ' • '}
                    {currentDesign.show_e_adisyon_title && (currentDesign.e_adisyon_title_text || 'E-ADİSYON FİŞİ')}
                  </div>
                )}

                {/* Alt Yazı: Belge No */}
                {currentDesign.show_order_no && (
                  <div 
                    style={{ 
                      fontSize: getSubFontSize(),
                      fontWeight: getSubFontWeight()
                    }}
                    className="text-slate-500"
                  >
                    Belge No: EAD20261030000124
                  </div>
                )}
              </div>

              {/* Double Divider */}
              <div style={{ borderTopWidth: `${Math.max(currentDesign.divider_thickness || 2, 2)}px`, borderTopStyle: 'solid', borderColor: '#0f172a' }} className="my-2" />

              {/* Meta Info Rows (Alt Yazı Boyutu ve Kalınlığı ile) */}
              <div 
                style={{ 
                  fontSize: getSubFontSize(),
                  fontWeight: getSubFontWeight()
                }}
                className="space-y-0.5"
              >
                {currentDesign.show_table_name && (
                  <div className="flex justify-between">
                    <span><b>Masa:</b> Bahçe 04</span>
                    {currentDesign.show_date_time && <span><b>Tarih:</b> {new Date().toLocaleDateString('tr-TR')}</span>}
                  </div>
                )}
                <div className="flex justify-between">
                  {currentDesign.show_waiter_name && <span><b>Garson:</b> Ahmet K.</span>}
                  {currentDesign.show_date_time && <span><b>Saat:</b> {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
                {currentDesign.show_waiter_name && (
                  <div className="flex justify-between">
                    <span><b>Kasiyer:</b> Kasiyer</span>
                  </div>
                )}
              </div>

              {/* Ayırıcı Çizgi (Dinamik Format & Kalınlık) */}
              <div style={getDividerBorder()} className="my-2" />

              {/* Items Table Header */}
              <div 
                style={{ 
                  fontSize: getSubFontSize(),
                  fontWeight: '700'
                }}
                className="flex justify-between border-b border-slate-300 pb-1"
              >
                <span style={{ width: '45%' }}>ÜRÜN</span>
                <span style={{ width: '15%', textAlign: 'center' }}>ADET</span>
                <span style={{ width: '20%', textAlign: 'right' }}>BİRİM</span>
                <span style={{ width: '20%', textAlign: 'right' }}>TUTAR</span>
              </div>

              {/* Sample Items with Body Size & Weight */}
              <div 
                style={{ 
                  fontSize: getBodyFontSize(),
                  fontWeight: getBodyFontWeight()
                }}
                className="space-y-1.5 py-1"
              >
                <div>
                  <div className="flex justify-between">
                    <span style={{ width: '45%' }}>Dana Antrikot</span>
                    <span style={{ width: '15%', textAlign: 'center' }}>1</span>
                    <span style={{ width: '20%', textAlign: 'right' }}>480.00</span>
                    <span style={{ width: '20%', textAlign: 'right' }}>480.00</span>
                  </div>
                  <div style={{ fontSize: getSubFontSize() }} className="text-slate-500 pl-1">(Orta Pişmiş)</div>
                </div>

                <div className="flex justify-between">
                  <span style={{ width: '45%' }}>Gavurdağı Salata</span>
                  <span style={{ width: '15%', textAlign: 'center' }}>1</span>
                  <span style={{ width: '20%', textAlign: 'right' }}>160.00</span>
                  <span style={{ width: '20%', textAlign: 'right' }}>160.00</span>
                </div>

                <div className="flex justify-between">
                  <span style={{ width: '45%' }}>Yayık Ayranı</span>
                  <span style={{ width: '15%', textAlign: 'center' }}>2</span>
                  <span style={{ width: '20%', textAlign: 'right' }}>45.00</span>
                  <span style={{ width: '20%', textAlign: 'right' }}>90.00</span>
                </div>

                <div className="flex justify-between">
                  <span style={{ width: '45%' }}>Fıstıklı Katmer</span>
                  <span style={{ width: '15%', textAlign: 'center' }}>1</span>
                  <span style={{ width: '20%', textAlign: 'right' }}>220.00</span>
                  <span style={{ width: '20%', textAlign: 'right' }}>220.00</span>
                </div>
              </div>

              {/* Ayırıcı Çizgi (Dinamik Format & Kalınlık) */}
              <div style={getDividerBorder()} className="my-2" />

              {/* Financial Subtotals */}
              <div 
                style={{ 
                  fontSize: getSubFontSize(),
                  fontWeight: getSubFontWeight()
                }}
                className="space-y-0.5"
              >
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
                {currentDesign.show_vat_breakdown && (
                  <div className="flex justify-between text-slate-500">
                    <span>KDV (%10 Dahil):</span>
                    <span>₺88.18</span>
                  </div>
                )}
              </div>

              {/* Grand Total */}
              <div style={{ borderTopWidth: `${Math.max(currentDesign.divider_thickness || 2, 2)}px`, borderTopStyle: 'solid', borderColor: '#0f172a' }} className="my-2" />
              <div 
                style={{ 
                  fontSize: '14px',
                  fontWeight: getTotalWeight()
                }}
                className="flex justify-between py-0.5"
              >
                <span>GENEL TOPLAM:</span>
                <span>₺970.00</span>
              </div>

              {/* Payment Details */}
              {currentDesign.show_payment_details && (
                <>
                  <div style={getDividerBorder()} className="my-1.5" />
                  <div 
                    style={{ 
                      fontSize: getSubFontSize(),
                      fontWeight: getSubFontWeight()
                    }}
                    className="space-y-0.5"
                  >
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
              {(currentDesign.wifi_name || currentDesign.instagram || currentDesign.custom_note) && (
                <>
                  <div style={getDividerBorder()} className="my-2" />
                  <div 
                    style={{ 
                      fontSize: getSubFontSize(),
                      fontWeight: getSubFontWeight()
                    }}
                    className="text-center space-y-0.5 bg-slate-50 p-1.5 rounded-sm border border-slate-200"
                  >
                    {currentDesign.wifi_name && (
                      <div>
                        📶 <b>Wi-Fi:</b> {currentDesign.wifi_name} {currentDesign.wifi_password ? `(Şifre: ${currentDesign.wifi_password})` : ''}
                      </div>
                    )}
                    {currentDesign.instagram && (
                      <div>
                        📷 <b>Instagram:</b> {currentDesign.instagram}
                      </div>
                    )}
                    {currentDesign.custom_note && (
                      <div className="italic text-slate-600 mt-0.5">
                        {currentDesign.custom_note}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* QR Code Area */}
              {currentDesign.show_qr_code && (
                <div className="my-3 text-center flex flex-col items-center">
                  <div className="w-16 h-16 border-2 border-slate-900 p-1 bg-white flex items-center justify-center">
                    <QrCode className="w-14 h-14 text-slate-900" />
                  </div>
                  <div style={{ fontSize: getSubFontSize() }} className="text-slate-500 font-mono mt-0.5 break-all">
                    ETTN: a9b2c3d4-e5f6-7890-abcd-ef1234567890
                  </div>
                </div>
              )}

              {/* Footer Messages with Sub Size and Weight */}
              <div style={{ borderTopWidth: `${Math.max(currentDesign.divider_thickness || 2, 2)}px`, borderTopStyle: 'solid', borderColor: '#0f172a' }} className="my-2" />
              <div className="text-center space-y-0.5 pt-1">
                {currentDesign.footer_message && (
                  <div 
                    style={{ 
                      fontSize: getSubFontSize(),
                      fontWeight: currentDesign.sub_weight === 'normal' ? '700' : getSubFontWeight()
                    }}
                    className="tracking-wide uppercase"
                  >
                    {currentDesign.footer_message}
                  </div>
                )}
                {currentDesign.footer_sub && (
                  <div 
                    style={{ 
                      fontSize: getSubFontSize(),
                      fontWeight: getSubFontWeight()
                    }}
                    className="text-slate-500"
                  >
                    {currentDesign.footer_sub}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
