import React, { useState } from 'react';
import { 
  ShoppingBag, Search, Check, Plus, ExternalLink, 
  Sparkles, Printer, Phone, Monitor, TrendingUp, FileSpreadsheet, Layers 
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
}

const appsData: AppItem[] = [
  {
    id: 'cost_profit',
    name: 'Maliyet ve Kârlılık Analizi',
    description: 'Ürünlerinizin gerçek maliyetini görün, brüt kâr marjınızı ve kârlılık değişimlerini anlık takip edin.',
    category: 'Restoran Operasyon',
    icon: TrendingUp,
    isInstalled: false,
    priceTag: 'Pro Plan'
  },
  {
    id: 'report_wizard',
    name: 'Rapor Sihirbazı',
    description: 'İşletmenize özel raporlar oluşturun, satışlarınızı istediğiniz kırılımda analiz edin.',
    category: 'Restoran Operasyon',
    icon: FileSpreadsheet,
    isInstalled: false,
    priceTag: 'Pro Plan'
  },
  {
    id: 'thermal_printer',
    name: 'Termal Yazıcı (ESC/POS)',
    description: 'Adisyon ve mutfak yazıcılarınızı bağlayın, fişlerinizi otomatik yazdırın.',
    category: 'Restoran Operasyon',
    icon: Printer,
    isInstalled: true,
    priceTag: 'Yönet'
  },
  {
    id: 'customer_display',
    name: 'Müşteri Bilgi Ekranı (CFD)',
    description: 'Sipariş alırken müşteriye anlık sepet özeti gösterin, şeffaf ve güven veren bir deneyim sunun.',
    category: 'Restoran Operasyon',
    icon: Monitor,
    isInstalled: true,
    priceTag: 'Yönet'
  },
  {
    id: 'android_caller_id',
    name: 'Android Caller ID',
    description: 'Gelen aramaları bilgisayarınıza ileterek arayan müşterinin sipariş ve iletişim bilgilerini anında ekrana getirin.',
    category: 'Kurye',
    icon: Phone,
    isInstalled: true,
    priceTag: 'Yönet'
  },
  {
    id: 'yemeksepeti',
    name: 'Yemeksepeti Entegrasyonu',
    description: 'Gelen siparişleri tek ekranda toplayın, otomatik kurye ve mutfak yönlendirmesi yapın.',
    category: 'Paket Sipariş',
    icon: ShoppingBag,
    isInstalled: true,
    priceTag: 'Aktif'
  },
  {
    id: 'getir_yemek',
    name: 'Getir Yemek Entegrasyonu',
    description: 'Getir Yemek menünüzü ve anlık açık/kapalı durumunuzu Adisyo üzerinden yönetin.',
    category: 'Paket Sipariş',
    icon: ShoppingBag,
    isInstalled: true,
    priceTag: 'Aktif'
  },
  {
    id: 'trendyol_yemek',
    name: 'Trendyol Yemek Entegrasyonu',
    description: 'Trendyol siparişlerini otomatik mutfağa iletin, sipariş durumunu tek tıkla güncelleyin.',
    category: 'Paket Sipariş',
    icon: ShoppingBag,
    isInstalled: true,
    priceTag: 'Aktif'
  }
];

export const AppStore: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'store' | 'installed'>('store');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = [
    { id: 'all', label: 'Tüm Uygulamalar', count: 30 },
    { id: 'Restoran Operasyon', label: 'Restoran Operasyon', count: 5 },
    { id: 'Paket Sipariş', label: 'Paket Sipariş', count: 7 },
    { id: 'Ödeme Yöntemi', label: 'Ödeme Yöntemi', count: 5 },
    { id: 'Kurye', label: 'Kurye', count: 4 },
    { id: 'E-Dönüşüm', label: 'E-Dönüşüm', count: 3 },
  ];

  const filteredApps = appsData.filter(app => {
    const matchesCat = activeCategory === 'all' || app.category === activeCategory;
    const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) || app.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === 'store' || app.isInstalled;
    return matchesCat && matchesSearch && matchesTab;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none animate-fadeIn font-sans transition-colors duration-200 space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Uygulama Mağazası</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          İşletmenizi büyütmek için ihtiyacınız olan tüm çözümleri tek noktadan yönetin.
        </p>
      </div>

      {/* Tabs Bar: Mağaza (30) / Kurulu Uygulamalarım (5) */}
      <div className="flex items-center gap-6 border-b border-slate-200 dark:border-slate-800 text-xs font-bold">
        <button
          onClick={() => { sound.beep(); setActiveTab('store'); }}
          className={`py-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'store'
              ? 'border-red-600 text-red-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>Mağaza</span>
          <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px]">30</span>
        </button>
        <button
          onClick={() => { sound.beep(); setActiveTab('installed'); }}
          className={`py-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'installed'
              ? 'border-red-600 text-red-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>Kurulu Uygulamalarım</span>
          <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px]">5</span>
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
              className={`w-full p-2.5 rounded-xl text-left text-xs font-bold transition flex items-center justify-between ${
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
          {/* Plan Promo Banner (Matching Frame 190) */}
          <div className="p-6 rounded-3xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-7 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white">Planınızı Büyütün</h3>
                <span className="text-[9px] font-black bg-red-600 text-white px-2 py-0.5 rounded-md uppercase">
                  Adisyo Paketleri
                </span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Mevcut Planınız: <span className="font-extrabold text-slate-900 dark:text-white">Standart Paket</span>
              </div>

              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                <div className="font-bold text-slate-800 dark:text-slate-200">Pro ile açılan modüller:</div>
                <div>+ Müşteri Sadakat Modülü</div>
                <div>+ Otel Yönetim Modülü</div>
                <div>+ Rapor Sihirbazı Modülü</div>
                <div>+ Maliyet ve Kârlılık Modülü</div>
              </div>

              <button
                onClick={() => alert('Kurumsal Üst Plan Aktifleştirildi.')}
                className="py-2 px-5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-extrabold text-xs shadow-md transition"
              >
                Paketi Yükselt
              </button>
            </div>

            {/* Suggested Online Integrations */}
            <div className="md:col-span-5 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-rose-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-slate-700 dark:text-slate-300 mb-1">Size Önerilenler:</div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="font-bold text-slate-800 dark:text-slate-200">Yemeksepeti</span>
                <span className="text-slate-500 font-mono">+₺225 / ay</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="font-bold text-slate-800 dark:text-slate-200">Getir Yemek</span>
                <span className="text-slate-500 font-mono">+₺225 / ay</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="font-bold text-slate-800 dark:text-slate-200">Trendyol Yemek</span>
                <span className="text-slate-500 font-mono">+₺225 / ay</span>
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
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-xs md:text-sm text-slate-900 dark:text-white truncate">
                        {app.name}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                        {app.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{app.category}</span>
                    <button
                      onClick={() => {
                        sound.beep();
                        alert(`${app.name} modülü yapılandırıldı.`);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition"
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
    </div>
  );
};
