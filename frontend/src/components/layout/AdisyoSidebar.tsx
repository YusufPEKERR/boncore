import React, { useState, useEffect } from 'react';
import { 
  X, Home, Layers, Smartphone, Settings, UtensilsCrossed, 
  ChefHat, Activity, Users, FileText, ShoppingBag, Gift, 
  ChevronDown, ChevronRight, Grid, DollarSign, Tag, UsersRound, 
  Percent, ShieldCheck, Warehouse, ArrowDownRight, Trash2, Sliders, User, 
  BarChart3, Store, Award, LogOut, Globe 
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
  onLogout?: () => void;
  onOpenLanding?: () => void;
}

export const AdisyoSidebar: React.FC<AdisyoSidebarProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  currentUser,
  restaurantTitle = 'BONCORE RESTORAN',
  onOpenQrallModal,
  onOpenOkcModal,
  onLogout,
  onOpenLanding
}) => {
  const [isIntegrationsOpen, setIsIntegrationsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('boncore_menu_integrations_open');
    if (saved !== null) return saved === 'true';
    return activeTab === 'integration_menu';
  });

  const [isDefinitionsOpen, setIsDefinitionsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('boncore_menu_definitions_open');
    if (saved !== null) return saved === 'true';
    return ['settings', 'table_definition', 'product_definition', 'kitchen_groups', 'inventory', 'profile'].includes(activeTab);
  });

  const [isOperationsOpen, setIsOperationsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('boncore_menu_operations_open');
    if (saved !== null) return saved === 'true';
    return ['cashier', 'audit'].includes(activeTab);
  });

  const [isUsersOpen, setIsUsersOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('boncore_menu_users_open');
    if (saved !== null) return saved === 'true';
    return ['users', 'rights'].includes(activeTab);
  });

  const [isReportsOpen, setIsReportsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('boncore_menu_reports_open');
    if (saved !== null) return saved === 'true';
    return ['restaurant_statistics', 'closed_bills_report', 'product_sales_report', 'day_end_report'].includes(activeTab);
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
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2.5">
            <img 
              src="/icon-192.png" 
              alt="BonCore POS" 
              className="w-9 h-9 rounded-xl object-contain shadow-sm" 
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight">BonCore <span className="text-brand-600 dark:text-emerald-400">POS</span></span>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.2 rounded">v2.0</span>
              </div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate max-w-[170px]">
                {restaurantTitle}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
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
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#338d35] dark:text-emerald-400 font-bold border-l-4 border-[#338d35]'
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
                    activeTab === 'integration_menu' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>Ürün Eşleştirme Ekranı</span>
                </button>
                <button
                  onClick={() => handleNavClick('integration_menu')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between"
                >
                  <span>Entegrasyon İşlemleri</span>
                  <span className="bg-[#338d35] text-white text-[8px] font-black px-1 py-0.2 rounded">Yeni</span>
                </button>
              </div>
            )}
          </div>

          {/* Dijital Menü (QR) */}
          <button
            onClick={() => handleNavClick('qr')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition text-left ${
              activeTab === 'qr'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#338d35] dark:text-emerald-400 font-bold border-l-4 border-[#338d35]'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <Smartphone className="w-4 h-4 text-slate-500" />
              <span>Dijital Menü (QR)</span>
            </div>
            <span className="bg-[#338d35] text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">
              Canlı
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
                    activeTab === 'settings' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Restaurant Tanımlamaları
                </button>
                <button
                  onClick={() => handleNavClick('table_definition')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'table_definition' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Masa / Bölgeler
                </button>
                <button
                  onClick={() => handleNavClick('product_definition')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'product_definition' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
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
                  onClick={() => handleNavClick('kitchen_groups')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'kitchen_groups' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Mutfak Grupları
                </button>
                <button
                  onClick={() => handleNavClick('profile')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'profile' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
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
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#338d35] dark:text-emerald-400 font-bold border-l-4 border-[#338d35]'
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
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#338d35] dark:text-emerald-400 font-bold border-l-4 border-[#338d35]'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ChefHat className="w-4 h-4 text-slate-500" />
            <span>Mutfak (KDS)</span>
          </button>

          {/* Paket Servis & Kurye */}
          <button
            onClick={() => handleNavClick('delivery')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left ${
              activeTab === 'delivery'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#338d35] dark:text-emerald-400 font-bold border-l-4 border-[#338d35]'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-slate-500" />
            <span>Paket Servis & Kurye</span>
          </button>

          {/* Müşteri Sadakat & Cari (CRM) */}
          <button
            onClick={() => handleNavClick('customers')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition text-left ${
              activeTab === 'customers'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#338d35] dark:text-emerald-400 font-bold border-l-4 border-[#338d35]'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <Gift className="w-4 h-4 text-brand-500" />
              <span>Müşteri Sadakat & Cari</span>
            </div>
            <span className="bg-[#338d35] text-white text-[8px] font-black px-1.5 py-0.5 rounded">CRM</span>
          </button>

          {/* Masa Rezervasyon */}
          <button
            onClick={() => handleNavClick('reservations')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition text-left ${
              activeTab === 'reservations'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#338d35] dark:text-emerald-400 font-bold border-l-4 border-[#338d35]'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-indigo-500" />
              <span>Masa Rezervasyon</span>
            </div>
            <span className="bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">Pro</span>
          </button>

          {/* Self-Servis Kiosk & CFD */}
          <button
            onClick={() => handleNavClick('kiosk')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition text-left ${
              activeTab === 'kiosk'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#338d35] dark:text-emerald-400 font-bold border-l-4 border-[#338d35]'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              <span>Kiosk & Çağrı Ekranı</span>
            </div>
            <span className="bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">CFD</span>
          </button>

          {/* Otel Yönetim (PMS Oda Folyo) */}
          <button
            onClick={() => handleNavClick('hotel')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition text-left ${
              activeTab === 'hotel'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#338d35] dark:text-emerald-400 font-bold border-l-4 border-[#338d35]'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <Warehouse className="w-4 h-4 text-amber-500" />
              <span>Otel Yönetim (PMS)</span>
            </div>
            <span className="bg-amber-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">Folyo</span>
          </button>

          {/* İşlemler (Stok / Kasa / Masraf / Denetim) Dropdown */}
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
                <button
                  onClick={() => handleNavClick('audit')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'audit' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Denetim İzi (Audit Log)
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
                    activeTab === 'users' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Kullanıcılar
                </button>
                <button
                  onClick={() => handleNavClick('rights')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'rights' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
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
                    activeTab === 'restaurant_statistics' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Restaurant İstatistikleri
                </button>
                <button
                  onClick={() => handleNavClick('closed_bills_report')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'closed_bills_report' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Kapatılan Adisyonlar
                </button>
                <button
                  onClick={() => handleNavClick('product_sales_report')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'product_sales_report' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Ürün Satış Raporu
                </button>
                <button
                  onClick={() => handleNavClick('day_end_report')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
                    activeTab === 'day_end_report' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Gün Sonu Raporu (Z)
                </button>
                <button
                  onClick={() => handleNavClick('cost_profit')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${
                    activeTab === 'cost_profit' ? 'text-[#338d35] font-bold bg-emerald-50/80 dark:bg-emerald-950/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>Maliyet & Rapor Sihirbazı</span>
                  <span className="bg-emerald-600 text-white text-[8px] font-black px-1 py-0.2 rounded">Pro</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobil Android APK İndir */}
          <a
            href="/api/app/download"
            download="boncore-pos.apk"
            onClick={() => sound.beep()}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition text-left text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
              <span className="font-semibold">Android POS APK</span>
            </div>
            <span className="bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm">
              İNDİR
            </span>
          </a>

          {/* Uygulama Mağazası (Frame 190) */}
          <button
            onClick={() => handleNavClick('app_store')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left ${
              activeTab === 'app_store'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#338d35] dark:text-emerald-400 font-bold border-l-4 border-[#338d35]'
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
            <span className="bg-[#338d35] text-white text-[9px] font-black px-1.5 py-0.5 rounded">
              Yeni
            </span>
          </button>
        </div>

        {/* Bottom User Profile & Logout Card */}
        <div className="p-3 m-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs space-y-2.5">
          {currentUser && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#338d35] to-emerald-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-slate-900 dark:text-white truncate text-xs">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {currentUser.role === 'manager' ? 'Müdür / Yönetici' : currentUser.role === 'cashier' ? 'Kasiyer' : currentUser.role === 'chef' ? 'Mutfak Şefi' : currentUser.role === 'courier' ? 'Kurye' : 'Garson'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleNavClick('profile')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 transition cursor-pointer"
                title="Profil Ayarları"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {onOpenLanding && (
            <button
              onClick={() => {
                sound.beep();
                onClose();
                onOpenLanding();
              }}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Tanıtım & Anasayfa</span>
            </button>
          )}

          {onLogout && (
            <button
              onClick={() => {
                sound.beep();
                onClose();
                onLogout();
              }}
              className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-[#338d35] dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Güvenli Çıkış Yap</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
