import React from 'react';
import { 
  Menu, Grid, FileText, Bell, Headphones, Lock, 
  Wifi, PhoneCall, RefreshCw, Volume2, VolumeX, 
  Sun, Moon, AlertCircle, User as UserIcon 
} from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSidebar: () => void;
  currentUser: StaffUser | null;
  onOpenPinModal: () => void;
  isConnected: boolean;
  buzzerCount: number;
  onOpenBuzzerList: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  restaurantTitle?: string;
  onRefreshData?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSidebar,
  currentUser,
  onOpenPinModal,
  isConnected,
  buzzerCount,
  onOpenBuzzerList,
  theme,
  onToggleTheme,
  restaurantTitle = 'FATİH ÇİFTLİĞİ',
  onRefreshData
}) => {
  return (
    <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 md:px-4 flex items-center justify-between select-none z-30 shadow-sm transition-colors duration-200">
      {/* Left: Hamburger Menu Button + Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { sound.beep(); onOpenSidebar(); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition font-bold text-xs"
        >
          <Menu className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          <span className="hidden sm:inline">Menü</span>
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

        <div className="font-extrabold text-sm md:text-base text-slate-900 dark:text-white tracking-tight uppercase">
          {restaurantTitle}
        </div>
      </div>

      {/* Center: Adisyo [Bölgeler] / [Siparişler] Switcher Tabs */}
      <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
        <button
          onClick={() => { sound.beep(); setActiveTab('tables'); }}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
            activeTab === 'tables' || activeTab === 'dashboard'
              ? 'bg-[#2c3e50] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span>Masalar</span>
        </button>
        <button
          onClick={() => { sound.beep(); setActiveTab('pos'); }}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
            activeTab === 'pos'
              ? 'bg-[#2c3e50] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Siparişler</span>
        </button>
      </div>

      {/* Right Controls Bar (Matching Adisyo Top Bar) */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Yaklaşan Ödeme Pill Badge */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-600 text-[11px] font-bold">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Yaklaşan Ödeme</span>
        </div>

        {/* Waiter Buzzer Notification Bell */}
        {buzzerCount > 0 && (
          <button
            onClick={onOpenBuzzerList}
            className="relative p-1.5 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 transition animate-bounce"
            title="Masalardan Çağrı Var!"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow">
              {buzzerCount}
            </span>
          </button>
        )}

        {/* Refresh Icon */}
        {onRefreshData && (
          <button
            onClick={() => { sound.beep(); onRefreshData(); }}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Verileri Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}

        {/* Caller ID / Phone Icon */}
        <button
          onClick={() => { sound.beep(); setActiveTab('delivery'); }}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title="Caller ID Santral & Paket"
        >
          <PhoneCall className="w-4 h-4" />
        </button>

        {/* Wifi / Connectivity status */}
        <div
          title={isConnected ? '0.1s Canlı WebSocket Yayını' : 'Çevrimdışı Mod'}
          className={`p-2 rounded-xl ${isConnected ? 'text-slate-500 dark:text-slate-400' : 'text-amber-500 animate-pulse'}`}
        >
          <Wifi className="w-4 h-4" />
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title={theme === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Sound Toggle */}
        <button
          onClick={() => {
            sound.enabled = !sound.enabled;
            if (sound.enabled) sound.beep();
          }}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition hidden sm:flex"
          title="Ses Aç / Kapa"
        >
          <Volume2 className="w-4 h-4" />
        </button>

        {/* Destek İste Pill Button */}
        <button
          onClick={() => alert('Adisyo Canlı Destek Hattına Bağlanılıyor...')}
          className="hidden xl:flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 text-[11px] font-bold transition"
        >
          <Headphones className="w-3.5 h-3.5" />
          <span>Destek İste</span>
        </button>

        {/* User Account / PIN Profile Chip (Matching Adisyo Frame 005) */}
        <button
          onClick={onOpenPinModal}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 transition text-xs font-bold"
        >
          <UserIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span className="truncate max-w-[120px]">
            {currentUser ? currentUser.name : '37799 - fatih'}
          </span>
        </button>
      </div>
    </header>
  );
};
