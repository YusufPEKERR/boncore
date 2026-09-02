import React, { useState, useEffect } from 'react';
import { 
  X, Home, Layers, Smartphone, Settings, UtensilsCrossed, 
  ChefHat, Activity, Users, FileText, ShoppingBag, Gift, 
  ChevronDown, ChevronRight, Grid, DollarSign, Tag, UsersRound, 
  Percent, ShieldCheck, Warehouse, ArrowDownRight, Trash2, Sliders, User, 
  BarChart3, Store, Award 
} from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';

interface AdisyoSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: StaffUser | null;
  restaurantTitle?: string;
  onOpenQrallModal: () => void;
  onOpenOkcModal?: () => void;
}

export const AdisyoSidebar: React.FC<AdisyoSidebarProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  currentUser,
  restaurantTitle = 'FATİH ÇİFTLİĞİ - 37799',
  onOpenQrallModal,
  onOpenOkcModal
}) => {
  const [isIntegrationsOpen, setIsIntegrationsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('boncore_menu_integrations_open');
    if (saved !== null) return saved === 'true';
    return activeTab === 'integration_menu';
  });

  const [isDefinitionsOpen, setIsDefinitionsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('boncore_menu_definitions_open');
    if (saved !== null) return saved === 'true';
    return ['settings', 'table_definition', 'product_definition', 'inventory', 'profile'].includes(activeTab);
  });

  const [isOperationsOpen, setIsOperationsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('boncore_menu_operations_open');
    if (saved !== null) return saved === 'true';
    return ['cashier'].includes(activeTab);
  });

  const [isUsersOpen, setIsUsersOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('boncore_menu_users_open');
    if (saved !== null) return saved === 'true';
    return ['users', 'rights'].includes(activeTab);
  });

  const [isReportsOpen, setIsReportsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('boncore_menu_reports_open');
    if (saved !== null) return saved === 'true';
    return ['restaurant_statistics'].includes(activeTab);
  });

  useEffect(() => {
    localStorage.setItem('boncore_menu_integrations_open', String(isIntegrationsOpen));
  }, [isIntegrationsOpen]);

  useEffect(() => {
    localStorage.setItem('boncore_menu_definitions_open', String(isDefinitionsOpen));
  }, [isDefinitionsOpen]);

  useEffect(() => {
    localStorage.setItem('boncore_menu_operations_open', String(isOperationsOpen));
  }, [isOperationsOpen]);

  useEffect(() => {
    localStorage.setItem('boncore_menu_users_open', String(isUsersOpen));
  }, [isUsersOpen]);

  useEffect(() => {
    localStorage.setItem('boncore_menu_reports_open', String(isReportsOpen));
  }, [isReportsOpen]);

  if (!isOpen) return null;

  const handleNavClick = (tabId: string) => {
    sound.beep();
    setActiveTab(tabId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex select-none animate-fadeIn font-sans">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose} 
      />

      {/* Slide-out Sidebar Drawer */}
      <div className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 h-full shadow-2xl flex flex-col z-10 border-r border-slate-200 dark:border-slate-800 transition-colors duration-200">
        {/* Brand Header (Frame 010 / Frame 190) */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#c0392b] flex items-center justify-center text-white font-black text-base shadow-sm">
              <span className="font-serif">a</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight">Adisyo</span>
                <span className="text-[9px] font-bold text-slate-400">3.0</span>
              </div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate max-w-[170px]">
                {restaurantTitle}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Navigation Menu List (Exact Video 3 Tree) */}
        <div className="flex-1 overflow-y-auto py-2 px-2 text-xs font-semibold space-y-0.5">
          {/* Ana Sayfa (Dashboard) */}
          <button
            onClick={() => handleNavClick('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left ${
              activeTab === 'dashboard'
                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-bold border-l-4 border-red-600'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Home className="w-4 h-4 text-slate-500" />
            <span>Ana Sayfa</span>
          </button>

          {/* Entegrasyon İşlemleri Dropdown */}
          <div>
            <button
              onClick={() => setIsIntegrationsOpen(!isIntegrationsOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition"
            >
              <div className="flex items-center gap-3">
                <Layers className="w-4 h-4 text-slate-500" />
                <span className="font-bold">Entegrasyon İşlemleri</span>
              </div>
              {isIntegrationsOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isIntegrationsOpen && (
              <div className="pl-7 pr-1 py-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800 ml-4">
                <button
                  onClick={() => handleNavClick('integration_menu')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${
                    activeTab === 'integration_menu' ? 'text-red-600 font-bold bg-red-50/80 dark:bg-red-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>Ürün Eşleştirme Ekranı</span>
                </button>
                <button
                  onClick={() => handleNavClick('integration_menu')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between"
                >
                  <span>Entegrasyon İşlemleri</span>
                  <span className="bg-red-600 text-white text-[8px] font-black px-1 py-0.2 rounded">Yeni</span>
                </button>
              </div>
            )}
          </div>

          {/* Dijital Menü (QR) */}
          <button
            onClick={() => {
              onClose();
              onOpenQrallModal();
            }}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition text-left text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <div className="flex items-center gap-3">
              <Smartphone className="w-4 h-4 text-slate-500" />
              <span>Dijital Menü</span>
            </div>
            <span className="bg-red-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">
              Yepyeni
            </span>
          </button>

          {/* Tanımlamalar Dropdown */}
          <div>
            <button
              onClick={() => setIsDefinitionsOpen(!isDefinitionsOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-4 h-4 text-slate-500" />
                <span className="font-bold">Tanımlamalar</span>
              </div>
              {isDefinitionsOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isDefinitionsOpen && (
              <div className="pl-7 pr-1 py-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800 ml-4">
                <button
                  onClick={() => handleNavClick('settings')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'settings' ? 'text-red-600 font-bold bg-red-50/80 dark:bg-red-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Restaurant Tanımlamaları
                </button>
                <button
                  onClick={() => handleNavClick('table_definition')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'table_definition' ? 'text-red-600 font-bold bg-red-50/80 dark:bg-red-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Masa / Bölgeler
                </button>
                <button
                  onClick={() => handleNavClick('product_definition')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'product_definition' ? 'text-red-600 font-bold bg-red-50/80 dark:bg-red-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Menü / Ürünler
                </button>
                <button
                  onClick={() => handleNavClick('inventory')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Birimler & Reçeteler
                </button>
                <button
                  onClick={() => handleNavClick('kds')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Mutfak Grupları
                </button>
                <button
                  onClick={() => handleNavClick('profile')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'profile' ? 'text-red-600 font-bold bg-red-50/80 dark:bg-red-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Profil & Kullanıcı Bilgisi
                </button>
              </div>
            )}
          </div>

          {/* Sipariş (Masa & POS) */}
          <button
            onClick={() => handleNavClick('tables')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left ${
              activeTab === 'tables' || activeTab === 'pos'
                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-bold border-l-4 border-red-600'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <UtensilsCrossed className="w-4 h-4 text-slate-500" />
            <span>Masalar (Sipariş)</span>
          </button>

          {/* Mutfak (KDS) */}
          <button
            onClick={() => handleNavClick('kds')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left ${
              activeTab === 'kds'
                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-bold border-l-4 border-red-600'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ChefHat className="w-4 h-4 text-slate-500" />
            <span>Mutfak</span>
          </button>

          {/* İşlemler (Stok / Kasa / Masraf) Dropdown */}
          <div>
            <button
              onClick={() => setIsOperationsOpen(!isOperationsOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition"
            >
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4 text-slate-500" />
                <span className="font-bold">İşlemler</span>
              </div>
              {isOperationsOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isOperationsOpen && (
              <div className="pl-7 pr-1 py-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800 ml-4">
                <button
                  onClick={() => handleNavClick('inventory')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Stok İşlemleri
                </button>
                <button
                  onClick={() => handleNavClick('cashier')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Gider / Masraf İşlemleri
                </button>
                <button
                  onClick={() => handleNavClick('inventory')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Zayi / Fire İşlemleri
                </button>
              </div>
            )}
          </div>

          {/* Kullanıcılar & Yetkiler Dropdown (Frame 110) */}
          <div>
            <button
              onClick={() => setIsUsersOpen(!isUsersOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition"
            >
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-slate-500" />
                <span className="font-bold">Kullanıcılar</span>
              </div>
              {isUsersOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isUsersOpen && (
              <div className="pl-7 pr-1 py-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800 ml-4">
                <button
                  onClick={() => handleNavClick('users')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'users' ? 'text-red-600 font-bold bg-red-50/80 dark:bg-red-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Kullanıcılar
                </button>
                <button
                  onClick={() => handleNavClick('rights')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'rights' ? 'text-red-600 font-bold bg-red-50/80 dark:bg-red-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Yetki / İzin Ekranı
                </button>
              </div>
            )}
          </div>

          {/* Raporlar Dropdown (Frame 150 & 190) */}
          <div>
            <button
              onClick={() => setIsReportsOpen(!isReportsOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition"
            >
              <div className="flex items-center gap-3">
                <BarChart3 className="w-4 h-4 text-slate-500" />
                <span className="font-bold">Raporlar</span>
              </div>
              {isReportsOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isReportsOpen && (
              <div className="pl-7 pr-1 py-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800 ml-4">
                <button
                  onClick={() => handleNavClick('restaurant_statistics')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'restaurant_statistics' ? 'text-red-600 font-bold bg-red-50/80 dark:bg-red-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Restaurant İstatistikleri
                </button>
                <button
                  onClick={() => handleNavClick('restaurant_statistics')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Ürün Satış Raporu
                </button>
                <button
                  onClick={() => handleNavClick('restaurant_statistics')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Gün Sonu Raporu (Z)
                </button>
              </div>
            )}
          </div>

          {/* Uygulama Mağazası (Frame 190) */}
          <button
            onClick={() => handleNavClick('app_store')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left ${
              activeTab === 'app_store'
                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-bold border-l-4 border-red-600'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Store className="w-4 h-4 text-slate-500" />
            <span>Uygulama Mağazası</span>
          </button>

          {/* Tavsiye Et ve Kazan */}
          <button
            onClick={() => {
              onClose();
              onOpenQrallModal();
            }}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition text-left text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          >
            <div className="flex items-center gap-3">
              <Award className="w-4 h-4 text-amber-500" />
              <span>Tavsiye Et ve Kazan</span>
            </div>
            <span className="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
              Yeni
            </span>
          </button>
        </div>

        {/* Bottom Adisyo Promo Badge (Frame 190 / 220) */}
        <div className="p-3 m-3 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 rounded-2xl text-[11px] text-amber-900 dark:text-amber-200 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300">
            <Gift className="w-4 h-4 text-amber-600" />
            <span>Planınızı Yükseltin</span>
          </div>
          <p className="text-[10px] text-amber-800/90 dark:text-amber-300/80 leading-tight">
            Daha fazla özellik için üst plana geçin.
          </p>
          <button
            onClick={() => {
              onClose();
              if (onOpenOkcModal) onOpenOkcModal();
              else onOpenQrallModal();
            }}
            className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-[10px] shadow-sm transition"
          >
            Yükselt
          </button>
        </div>
      </div>
    </div>
  );
};
