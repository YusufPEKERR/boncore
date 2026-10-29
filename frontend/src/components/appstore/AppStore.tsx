import React, { useState } from 'react';
import {
  ShoppingBag, Search, Check, Printer, Phone, Monitor, TrendingUp,
  FileSpreadsheet, Users, Calendar, Building2, CreditCard, Truck,
  FileText, Smartphone, Scale, ChefHat, ShieldCheck, Gift, QrCode
} from 'lucide-react';
import { sound } from '../../services/sound';

interface AppItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: any;
  isInstalled: boolean;
  priceTag: string;
  targetTab?: string;
}

interface AppStoreProps {
  onNavigateTab?: (tab: string) => void;
}

const initialAppsData: AppItem[] = [
  // Restoran Operasyon (11)
  {
    id: 'customers_loyalty',
    name: 'Müşteri Sadakat (CRM) & Cari Modülü',
    description: 'Müşterilerinize para puan kazandırın, VIP sadakat seviyeleri, kampanya kuralları ve veresiye (cari) hesapları yönetin.',
    category: 'Restoran Operasyon',
    icon: Gift,
    isInstalled: true,
    priceTag: 'Modülü Aç',
    targetTab: 'customers'
  },
  {
    id: 'reservations',
    name: 'Masa Rezervasyon & Misafir Planlama',
    description: 'Tarih, saat, kişi sayısı ve kapora takibi ile masa rezervasyonlarınızı dijital olarak yönetin.',
    category: 'Restoran Operasyon',
    icon: Calendar,
    isInstalled: true,
    priceTag: 'Modülü Aç',
    targetTab: 'reservations'
  },
  {
    id: 'cost_profit',
    name: 'Maliyet ve Kârlılık Analizi',
    description: 'Ürünlerinizin gerçek reçete maliyetini görün, brüt kâr marjınızı ve net işletme kârlılığınızı anlık takip edin.',
    category: 'Restoran Operasyon',
    icon: TrendingUp,
    isInstalled: true,
    priceTag: 'Modülü Aç',
    targetTab: 'cost_profit'
  },
  {
    id: 'report_wizard',
    name: 'Rapor Sihirbazı',
    description: 'İşletmenize özel dinamik raporlar oluşturun, satışlarınızı istediğiniz kırılımda analiz edip Excel/CSV indirin.',
    category: 'Restoran Operasyon',
    icon: FileSpreadsheet,
    isInstalled: true,
    priceTag: 'Modülü Aç',
    targetTab: 'cost_profit'
  },
  {
    id: 'hotel_pms',
    name: 'Otel Yönetim (PMS / Oda Folyo) Modülü',
    description: 'Otel misafirlerinin restoran ve bar adisyonlarını doğrudan oda hesabına (Folyo) yansıtın ve çıkışta tahsil edin.',
    category: 'Restoran Operasyon',
    icon: Building2,
    isInstalled: true,
    priceTag: 'Modülü Aç',
    targetTab: 'hotel'
  },
  {
    id: 'kiosk_cfd',
    name: 'Self-Servis Kiosk & Müşteri Çağrı Ekranı (CFD)',
    description: 'Dokunmatik Kiosk üzerinden insansız sipariş alın ve canlı sıra çağrı ekranında hazır siparişleri duyurun.',
    category: 'Restoran Operasyon',
    icon: Monitor,
    isInstalled: true,
    priceTag: 'Modülü Aç',
    targetTab: 'kiosk'
  },
  {
    id: 'cas_scale',
    name: 'CAS CL-3000 / Tartılı Ürün Entegrasyonu',
    description: 'Ethernet TCP/IP terazi bağlantısı ile gramajlı ürünleri kasada otomatik tartarak adisyona ekleyin.',
    category: 'Restoran Operasyon',
    icon: Scale,
    isInstalled: true,
    priceTag: 'Yönet',
    targetTab: 'settings'
  },
  {
    id: 'thermal_printer',
    name: 'Termal Yazıcı (ESC/POS Donanım Köprüsü)',
    description: 'Adisyon ve mutfak yazıcılarınızı bağlayın, fişlerinizi otomatik departmanlara göre yazdırın.',
    category: 'Restoran Operasyon',
    icon: Printer,
    isInstalled: true,
    priceTag: 'Yönet',
    targetTab: 'settings'
  },
  {
    id: 'qr_digital_menu',
    name: 'QR Dijital Menü & Masadan Sipariş',
    description: 'Müşterileriniz masadaki QR kodu okutarak menüyü incelesin, garson çağırsın veya sipariş versin.',
    category: 'Restoran Operasyon',
    icon: QrCode,
    isInstalled: true,
    priceTag: 'Modülü Aç',
    targetTab: 'qr'
  },
  {
    id: 'kds_kitchen',
    name: 'Mutfak Ekranı (KDS)',
    description: 'Siparişleri mutfak istasyonlarında anlık görüntüleyin, hazırlık sürelerini ve hazır bildirimlerini yönetin.',
    category: 'Restoran Operasyon',
    icon: ChefHat,
    isInstalled: true,
    priceTag: 'Modülü Aç',
    targetTab: 'kds'
  },
  {
    id: 'audit_security',
    name: 'Gelişmiş Denetim İzi & İptal/İkram Takibi',
    description: 'Personel iptal, iade, ikram ve iskonto işlemlerini anlık loglayın ve yetkilendirin.',
    category: 'Restoran Operasyon',
    icon: ShieldCheck,
    isInstalled: true,
    priceTag: 'Modülü Aç',
    targetTab: 'audit'
  },

  // Paket Sipariş (7)
  {
    id: 'yemeksepeti',
    name: 'Yemeksepeti Entegrasyonu',
    description: 'Gelen siparişleri tek ekranda toplayın, otomatik kurye ve mutfak yönlendirmesi yapın.',
    category: 'Paket Sipariş',
    icon: ShoppingBag,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'delivery'
  },
  {
    id: 'getir_yemek',
    name: 'Getir Yemek Entegrasyonu',
    description: 'Getir Yemek menünüzü ve anlık açık/kapalı durumunuzu Adisyo üzerinden yönetin.',
    category: 'Paket Sipariş',
    icon: ShoppingBag,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'delivery'
  },
  {
    id: 'trendyol_yemek',
    name: 'Trendyol Yemek Entegrasyonu',
    description: 'Trendyol siparişlerini otomatik mutfağa iletin, sipariş durumunu tek tıkla güncelleyin.',
    category: 'Paket Sipariş',
    icon: ShoppingBag,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'delivery'
  },
  {
    id: 'migros_yemek',
    name: 'Migros Yemek Entegrasyonu',
    description: 'Migros Yemek siparişlerinizi POS ekranınıza düşürün ve ürün eşleştirmelerini tek tıkla yapın.',
    category: 'Paket Sipariş',
    icon: ShoppingBag,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'integration_menu'
  },
  {
    id: 'fudy',
    name: 'Fudy Paket Sipariş',
    description: 'Fudy üzerinden gelen online siparişleri otomatik kabul edin ve fiş yazdırın.',
    category: 'Paket Sipariş',
    icon: ShoppingBag,
    isInstalled: false,
    priceTag: 'Kur',
    targetTab: 'delivery'
  },
  {
    id: 'whatsapp_order',
    name: 'WhatsApp Sipariş Hattı Botu',
    description: 'WhatsApp işletme hattınızdan gelen siparişleri otomatik paket servis ekranına aktarın.',
    category: 'Paket Sipariş',
    icon: Smartphone,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'delivery'
  },
  {
    id: 'web_direct_order',
    name: 'Komisyonsuz Online Web Sipariş',
    description: 'Kendi web siteniz üzerinden %0 komisyonla doğrudan paket ve gel-al sipariş kabul edin.',
    category: 'Paket Sipariş',
    icon: ShoppingBag,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'qr'
  },

  // Ödeme Yöntemi (5)
  {
    id: 'gmt_okc',
    name: 'Yeni Nesil ÖKC / Pos Cihazı (Beko, Ingenico, Hugin, Pax)',
    description: 'Kablo veya yerel ağ üzerinden yazar kasa POS cihazlarına tutar gönderin ve mali fiş kesin.',
    category: 'Ödeme Yöntemi',
    icon: CreditCard,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'cashier'
  },
  {
    id: 'multinet',
    name: 'Multinet Up Yemek Kartı',
    description: 'Multinet yemek kartı ve QR ödemelerini POS ekranından doğrudan tahsil edin.',
    category: 'Ödeme Yöntemi',
    icon: CreditCard,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'cashier'
  },
  {
    id: 'sodexo_pluxee',
    name: 'Pluxee (Sodexo) Ödeme Entegrasyonu',
    description: 'Pluxee mobil kod ve kart ödemelerini kasada hızlıca doğrulayın.',
    category: 'Ödeme Yöntemi',
    icon: CreditCard,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'cashier'
  },
  {
    id: 'ticket_edenred',
    name: 'Ticket Restaurant (Edenred)',
    description: 'Ticket QR ve temassız yemek kartı tahsilatlarını tek tıkla tamamlayın.',
    category: 'Ödeme Yöntemi',
    icon: CreditCard,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'cashier'
  },
  {
    id: 'setcard_metropol',
    name: 'Setcard & MetropolCard Entegrasyonu',
    description: 'Setcard ve MetropolCard bakiye sorgulama ve ödeme alma entegrasyonu.',
    category: 'Ödeme Yöntemi',
    icon: CreditCard,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'cashier'
  },

  // Kurye (4)
  {
    id: 'android_caller_id',
    name: 'Android & USB Caller ID (Arayan Numara Tanıma)',
    description: 'Gelen aramaları bilgisayarınıza ileterek arayan müşterinin adres ve geçmiş siparişlerini anında ekrana getirin.',
    category: 'Kurye',
    icon: Phone,
    isInstalled: true,
    priceTag: 'Yönet',
    targetTab: 'delivery'
  },
  {
    id: 'paketbanabana',
    name: 'BanaBana Kurye Entegrasyonu',
    description: 'Kendi kuryeniz olmadığında tek tıkla dış kaynak kurye çağırın ve haritadan takip edin.',
    category: 'Kurye',
    icon: Truck,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'delivery'
  },
  {
    id: ' Vigo_courier',
    name: 'Vigo & Paketタクシー Kurye Havuzu',
    description: 'Yoğun saatlerde paket siparişlerinizi otomatik Vigo kurye ağına yönlendirin.',
    category: 'Kurye',
    icon: Truck,
    isInstalled: false,
    priceTag: 'Kur',
    targetTab: 'delivery'
  },
  {
    id: 'boncore_courier_app',
    name: 'BonCore Kurye Mobil Takip & Zimmet',
    description: 'Kuryelerinizin üzerindeki nakit/POS zimmetini ve teslimat sürelerini canlı izleyin.',
    category: 'Kurye',
    icon: Users,
    isInstalled: true,
    priceTag: 'Modülü Aç',
    targetTab: 'delivery'
  },

  // E-Dönüşüm (3)
  {
    id: 'efatura_earsiv',
    name: 'E-Fatura & E-Arşiv Fatura Entegrasyonu',
    description: 'Adisyonlarınızı tek tıkla GİB onaylı E-Fatura veya E-Arşiv faturaya dönüştürüp müşteriye SMS/E-posta gönderin.',
    category: 'E-Dönüşüm',
    icon: FileText,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'cashier'
  },
  {
    id: 'eadisyon',
    name: 'GİB E-Adisyon Entegrasyonu',
    description: 'Masada açılan adisyonları Gelir İdaresi Başkanlığı E-Adisyon sistemine gerçek zamanlı bildirin.',
    category: 'E-Dönüşüm',
    icon: FileText,
    isInstalled: true,
    priceTag: 'Aktif',
    targetTab: 'cashier'
  },
  {
    id: 'erp_accounting',
    name: 'Logo / Mikro / Paraşüt Muhasebe Aktarımı',
    description: 'Gün sonu Z raporlarınızı, stok hareketlerinizi ve masraf fişlerinizi ön muhasebe programınıza aktarın.',
    category: 'E-Dönüşüm',
    icon: FileSpreadsheet,
    isInstalled: true,
    priceTag: 'Modülü Aç',
    targetTab: 'day_end_report'
  }
];

export const AppStore: React.FC<AppStoreProps> = ({ onNavigateTab }) => {
  const [apps, setApps] = useState<AppItem[]>(initialAppsData);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'store' | 'installed'>('store');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPlan, setCurrentPlan] = useState<string>('BonCore Kurumsal Pro Paket');
  const [planToast, setPlanToast] = useState<string>('');

  const categories = [
    { id: 'all', label: 'Tüm Uygulamalar', count: apps.length },
    { id: 'Restoran Operasyon', label: 'Restoran Operasyon', count: apps.filter(a => a.category === 'Restoran Operasyon').length },
    { id: 'Paket Sipariş', label: 'Paket Sipariş', count: apps.filter(a => a.category === 'Paket Sipariş').length },
    { id: 'Ödeme Yöntemi', label: 'Ödeme Yöntemi', count: apps.filter(a => a.category === 'Ödeme Yöntemi').length },
    { id: 'Kurye', label: 'Kurye', count: apps.filter(a => a.category === 'Kurye').length },
    { id: 'E-Dönüşüm', label: 'E-Dönüşüm', count: apps.filter(a => a.category === 'E-Dönüşüm').length },
  ];

  const installedCount = apps.filter(a => a.isInstalled).length;

  const filteredApps = apps.filter(app => {
    const matchesCat = activeCategory === 'all' || app.category === activeCategory;
    const matchesSearch =
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === 'store' || app.isInstalled;
    return matchesCat && matchesSearch && matchesTab;
  });

  const handleAppAction = (app: AppItem) => {
    sound.beep();
    if (!app.isInstalled) {
      sound.cashDrawer();
      setApps(prev => prev.map(item => item.id === app.id ? { ...item, isInstalled: true, priceTag: 'Modülü Aç' } : item));
      setPlanToast(`${app.name} başarıyla kuruldu ve aktif edildi!`);
      setTimeout(() => setPlanToast(''), 4000);
      return;
    }
    if (app.targetTab && onNavigateTab) {
      onNavigateTab(app.targetTab);
    } else {
      setPlanToast(`${app.name} aktif olarak çalışıyor.`);
      setTimeout(() => setPlanToast(''), 3500);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none animate-fadeIn font-sans transition-colors duration-200 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Uygulama Mağazası & Modüller</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Adisyo Pro ekosistemindeki tüm restoran operasyon, CRM, rezervasyon, otel PMS, Kiosk ve online paket entegrasyonlarını tek noktadan yönetin.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Modül veya entegrasyon ara..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Tabs Bar: Mağaza (30) / Kurulu Uygulamalarım */}
      <div className="flex items-center gap-6 border-b border-slate-200 dark:border-slate-800 text-xs font-bold">
        <button
          onClick={() => { sound.beep(); setActiveTab('store'); }}
          className={`py-3 flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'store'
              ? 'border-red-600 text-red-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>Mağaza (Tüm Modüller)</span>
          <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px]">{apps.length}</span>
        </button>
        <button
          onClick={() => { sound.beep(); setActiveTab('installed'); }}
          className={`py-3 flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'installed'
              ? 'border-red-600 text-red-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>Kurulu Uygulamalarım</span>
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px]">{installedCount}</span>
        </button>
      </div>

      {/* Main 2-Column Grid: Left Category Sidebar + Right Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Categories Sidebar (3 cols) */}
        <div className="lg:col-span-3 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-3">
            Kategoriler
          </div>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => { sound.beep(); setActiveCategory(c.id); }}
              className={`w-full p-2.5 rounded-xl text-left text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                activeCategory === c.id
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
              }`}
            >
              <span>{c.label}</span>
              <span className="text-[11px] text-slate-400 font-mono">{c.count}</span>
            </button>
          ))}
        </div>

        {/* Right Content Area (9 cols) */}
        <div className="lg:col-span-9 space-y-6">
          {/* Plan Promo Banner */}
          <div className="p-6 rounded-3xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-7 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white">Adisyo Pro Kurumsal Paket</h3>
                <span className="text-[9px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-md uppercase">
                  TÜM MODÜLLER AKTİF
                </span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Mevcut Planınız: <span className="font-extrabold text-rose-600 dark:text-rose-400">{currentPlan}</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-semibold">
                <button onClick={() => onNavigateTab && onNavigateTab('customers')} className="text-left hover:text-rose-600 cursor-pointer">✓ Müşteri Sadakat & Cari (CRM)</button>
                <button onClick={() => onNavigateTab && onNavigateTab('reservations')} className="text-left hover:text-rose-600 cursor-pointer">✓ Masa Rezervasyon Modülü</button>
                <button onClick={() => onNavigateTab && onNavigateTab('cost_profit')} className="text-left hover:text-rose-600 cursor-pointer">✓ Maliyet, Kârlılık & Rapor Sihirbazı</button>
                <button onClick={() => onNavigateTab && onNavigateTab('hotel')} className="text-left hover:text-rose-600 cursor-pointer">✓ Otel Yönetim (PMS Oda Folyo)</button>
                <button onClick={() => onNavigateTab && onNavigateTab('kiosk')} className="text-left hover:text-rose-600 cursor-pointer">✓ Self-Servis Kiosk & CFD Ekranı</button>
                <button onClick={() => onNavigateTab && onNavigateTab('settings')} className="text-left hover:text-rose-600 cursor-pointer">✓ CAS Terazi & Termal Yazıcı Köprüsü</button>
              </div>
            </div>

            {/* Quick Launch Shortcuts */}
            <div className="md:col-span-5 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-rose-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="font-black text-slate-800 dark:text-slate-200 mb-1">Hızlı Modül Geçişi:</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onNavigateTab && onNavigateTab('customers')}
                  className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 font-bold text-left hover:bg-rose-100 transition cursor-pointer"
                >
                  🎁 CRM & Veresiye
                </button>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('reservations')}
                  className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 font-bold text-left hover:bg-indigo-100 transition cursor-pointer"
                >
                  📅 Rezervasyonlar
                </button>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('cost_profit')}
                  className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-300 font-bold text-left hover:bg-emerald-100 transition cursor-pointer"
                >
                  📊 Maliyet & Kârlılık
                </button>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('hotel')}
                  className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-300 font-bold text-left hover:bg-amber-100 transition cursor-pointer"
                >
                  🏨 Otel Oda Folyo
                </button>
              </div>
            </div>
          </div>

          {/* Module Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredApps.map((app) => {
              const Icon = app.icon;
              return (
                <div
                  key={app.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      app.isInstalled
                        ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-black text-xs md:text-sm text-slate-900 dark:text-white truncate">
                          {app.name}
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                        {app.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{app.category}</span>
                    <button
                      onClick={() => handleAppAction(app)}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                        app.isInstalled
                          ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {app.priceTag}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Plan & App Toast */}
      {planToast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white font-bold text-xs py-3 px-5 rounded-2xl shadow-2xl flex items-center gap-2 z-50">
          <Check className="w-4 h-4" />
          <span>{planToast}</span>
        </div>
      )}
    </div>
  );
};
