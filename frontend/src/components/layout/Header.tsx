import React, { useState, useEffect } from 'react';
import { 
  Menu, Grid, FileText, Bell, Headphones, LogOut, 
  Wifi, PhoneCall, RefreshCw, Volume2, VolumeX, 
  Sun, Moon, User as UserIcon, MessageSquare, X, CheckCircle2, Sparkles 
} from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSidebar: () => void;
  currentUser: StaffUser | null;
  onOpenPinModal: () => void;
  onLogout?: () => void;
  isConnected: boolean;
  buzzerCount: number;
  onOpenBuzzerList: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  restaurantTitle?: string;
  onRefreshData?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  manager: 'Yönetici',
  cashier: 'Kasiyer',
  waiter: 'Garson',
  kitchen: 'Mutfak',
  chef: 'Şef',
  courier: 'Kurye'
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSidebar,
  currentUser,
  onOpenPinModal,
  onLogout,
  isConnected,
  buzzerCount,
  onOpenBuzzerList,
  theme,
  onToggleTheme,
  restaurantTitle = 'BONCORE RESTORAN',
  onRefreshData
}) => {
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);
  const [supportMessage, setSupportMessage] = useState<string>('');
  const [supportSent, setSupportSent] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(sound.enabled);

  // Live Date & Time Clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const turkishDays = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const turkishMonths = [
    'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
    'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'
  ];

  const liveDateStr = `${currentTime.getDate()} ${turkishMonths[currentTime.getMonth()]} ${currentTime.getFullYear()}, ${turkishDays[currentTime.getDay()]}`;
  const liveTimeStr = currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const handleSendSupport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportMessage.trim()) return;
    sound.beep();
    setSupportSent(true);
    setTimeout(() => {
      setSupportSent(false);
      setSupportMessage('');
      setIsSupportOpen(false);
    }, 2500);
  };

  return (
    <>
    <header className="h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-3 md:px-4 flex items-center justify-between select-none z-30 shadow-sm transition-colors duration-200">
      {/* Left: Hamburger Menu Button + Brand + Title */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <button
          onClick={() => { sound.beep(); onOpenSidebar(); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition font-bold text-xs cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
        >
          <Menu className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          <span className="hidden sm:inline">Menü</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-600 to-orange-500 flex items-center justify-center text-white font-black text-sm shadow-sm shadow-rose-500/20">
            B
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white tracking-tight">
                BonCore <span className="text-rose-600 dark:text-rose-400">POS</span>
              </span>
              <span className="hidden md:inline-block text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                v2.0
              </span>
            </div>
            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate max-w-[140px] sm:max-w-[200px]">
              {restaurantTitle}
            </div>
          </div>
        </div>
      </div>

      {/* Center: [Masalar] / [Siparişler] Switcher Tabs + Live Date & Time Clock */}
      <div className="hidden md:flex items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
          <button
            onClick={() => { sound.beep(); setActiveTab('tables'); }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'tables' || activeTab === 'dashboard'
                ? 'bg-gradient-to-r from-rose-600 to-orange-600 text-white shadow-sm shadow-rose-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Masalar</span>
          </button>
          <button
            onClick={() => { sound.beep(); setActiveTab('pos'); }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'pos'
                ? 'bg-gradient-to-r from-rose-600 to-orange-600 text-white shadow-sm shadow-rose-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>POS Sipariş</span>
          </button>
        </div>

        {/* Live Date & Clock Pill */}
        <div 
          title="Canlı Sistem Zamanı (UTC+3) - Tüm raporlar, cirolar ve gün sonu bu zamana göre canlı işlenir"
          className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-slate-600 dark:text-slate-300 font-semibold">{liveDateStr}</span>
          <span className="font-mono font-black text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs">
            {liveTimeStr}
          </span>
        </div>
      </div>

      {/* Right Controls Bar */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Waiter Buzzer Notification Bell */}
        {buzzerCount > 0 && (
          <button
            onClick={onOpenBuzzerList}
            className="relative p-1.5 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 transition animate-bounce cursor-pointer"
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
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Verileri Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}

        {/* Caller ID / Phone Icon */}
        <button
          onClick={() => { sound.beep(); setActiveTab('delivery'); }}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title="Caller ID Santral & Paket"
        >
          <PhoneCall className="w-4 h-4" />
        </button>

        {/* Wifi / Connectivity status */}
        <div
          title={isConnected ? 'Canlı WebSocket Bağlantısı Aktif' : 'Çevrimdışı Mod'}
          className={`p-2 rounded-xl flex items-center gap-1 ${isConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500 animate-pulse'}`}
        >
          <Wifi className="w-4 h-4" />
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title={theme === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Sound Toggle */}
        <button
          onClick={() => {
            sound.enabled = !sound.enabled;
            setSoundEnabled(sound.enabled);
            if (sound.enabled) sound.beep();
          }}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition hidden sm:flex cursor-pointer"
          title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
        </button>

        {/* Destek İste Pill Button */}
        <button
          onClick={() => { sound.beep(); setIsSupportOpen(true); }}
          className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-[11px] font-bold transition cursor-pointer"
        >
          <Headphones className="w-3.5 h-3.5" />
          <span>Destek</span>
        </button>

        {/* User Account / PIN Profile Chip */}
        <button
          onClick={onOpenPinModal}
          className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 transition text-xs font-bold cursor-pointer"
          title="Personel Değiştir / Hızlı PIN"
        >
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 text-white font-black text-[11px] flex items-center justify-center shadow-sm">
            {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : <UserIcon className="w-3.5 h-3.5" />}
          </div>
          <div className="text-left leading-tight hidden sm:block">
            <div className="truncate max-w-[110px] font-extrabold text-[11px] text-slate-900 dark:text-white">
              {currentUser ? currentUser.name : 'Personel'}
            </div>
            <div className="text-[9px] font-bold text-rose-600 dark:text-rose-400 uppercase">
              {currentUser ? (ROLE_LABELS[currentUser.role] || currentUser.role) : 'Aktif'}
            </div>
          </div>
        </button>

        {/* Direct Logout Button */}
        {onLogout && (
          <button
            onClick={() => { sound.beep(); onLogout(); }}
            className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/50 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            title="Güvenli Çıkış Yap"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>

    {/* Modern Interactive Support Modal */}
    {isSupportOpen && (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Headphones className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">BonCore POS Canlı Destek</h3>
                <p className="text-xs text-slate-500">7/24 Kesintisiz Restoran Teknik Destek</p>
              </div>
            </div>
            <button onClick={() => setIsSupportOpen(false)} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <a href="tel:08503050505" className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                <PhoneCall className="w-5 h-5 text-emerald-600 mb-1" />
                <span className="text-[11px] text-slate-500">Müşteri Hizmetleri</span>
                <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">0850 305 05 05</span>
              </a>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center">
                <Wifi className="w-5 h-5 text-blue-600 mb-1" />
                <span className="text-[11px] text-slate-500">Uzak Masaüstü ID</span>
                <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">BON-849-210</span>
              </div>
            </div>

            {supportSent ? (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                <div className="font-bold text-sm text-emerald-800 dark:text-emerald-200">Destek Talebiniz Alındı!</div>
                <div className="text-xs text-emerald-600">Teknik ekibimiz birkaç dakika içinde iletişime geçecektir.</div>
              </div>
            ) : (
              <form onSubmit={handleSendSupport} className="space-y-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Hızlı Destek Talebi İletin:
                </label>
                <textarea
                  rows={3}
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  placeholder="Yaşadığınız sorunu veya talebinizi kısaca açıklayınız..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-extrabold text-xs shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Talebi Müşteri Temsilcisine İlet</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
};
