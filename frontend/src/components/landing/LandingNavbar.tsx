import React, { useState, useEffect } from 'react';
import { 
  Utensils, LogIn, Sparkles, Moon, Sun, Menu as MenuIcon, 
  X, ArrowRight, ShieldCheck, PhoneCall, ChevronRight, CheckCircle2
} from 'lucide-react';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';

interface LandingNavbarProps {
  onOpenLogin: () => void;
  onOpenDemo: () => void;
  onOpenMasterAdmin?: () => void;
  currentUser: StaffUser | null;
  onGoToApp: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({
  onOpenLogin,
  onOpenDemo,
  onOpenMasterAdmin,
  currentUser,
  onGoToApp,
  theme,
  onToggleTheme,
}) => {
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      setIsScrolled(scrollPos > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    sound.beep();
    setIsMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-sm border-b border-slate-200/80 dark:border-slate-800/80 py-3'
          : 'bg-transparent py-4 sm:py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-5 xl:px-8">
        <div className="flex items-center justify-between gap-2 xl:gap-3">
          
          {/* Brand Logo */}
          <div 
            onClick={() => { sound.beep(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="flex items-center gap-2 xl:gap-2.5 cursor-pointer group select-none shrink-0"
          >
            <img 
              src="/icon-192.png" 
              alt="BonCore POS" 
              className="w-8 h-8 xl:w-10 xl:h-10 rounded-xl object-cover shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-200 shrink-0" 
            />
            <div className="whitespace-nowrap">
              <div className="flex items-center gap-1 xl:gap-1.5">
                <span className="text-base xl:text-xl font-black tracking-tight text-slate-900 dark:text-white">
                  Bon<span className="text-brand-600 dark:text-emerald-400">Core</span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                  POS
                </span>
              </div>
              <p className="hidden xl:block text-[10px] font-bold text-slate-400 dark:text-slate-500 leading-none -mt-0.5">
                Bulut Restoran Yönetimi
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav aria-label="Ana Navigasyon" className="hidden lg:flex items-center gap-2.5 xl:gap-6 text-[11px] xl:text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
            <button 
              onClick={() => scrollToSection('ozellikler')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              Özellikler
            </button>
            <button 
              onClick={() => scrollToSection('cozumler')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              Çözümler
            </button>
            <button 
              onClick={() => scrollToSection('donanim')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              Donanım & Entegrasyon
            </button>
            <button 
              onClick={() => scrollToSection('fiyatlar')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              Fiyatlar
            </button>
            <button 
              onClick={() => scrollToSection('sss')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              S.S.S.
            </button>
            <button 
              onClick={() => scrollToSection('iletisim')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              İletişim
            </button>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-1.5 xl:gap-2.5 shrink-0">
            
            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Açık Moda Geç' : 'Karanlık Moda Geç'}
              title={theme === 'dark' ? 'Açık Mod' : 'Karanlık Mod'}
              className="p-2 xl:p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-emerald-400 hover:border-emerald-500/40 transition cursor-pointer shadow-xs shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* SaaS Master Admin Butonu */}
            {onOpenMasterAdmin && (
              <button
                onClick={() => { sound.beep(); onOpenMasterAdmin(); }}
                className="hidden sm:flex items-center gap-1 xl:gap-1.5 px-2.5 xl:px-3 py-2 xl:py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold text-[11px] xl:text-xs transition cursor-pointer shadow-xs whitespace-nowrap shrink-0"
                title="SaaS Platform Süper Yönetici Paneli"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>SaaS Panel</span>
              </button>
            )}

            {/* Giriş Yap / Sisteme Git Butonu (Kullanıcının Özel İsteği) */}
            {currentUser ? (
              <button
                onClick={() => { sound.beep(); onGoToApp(); }}
                className="flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-4 py-2 xl:py-2.5 rounded-xl border border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition cursor-pointer font-bold text-[11px] xl:text-xs shadow-xs whitespace-nowrap shrink-0"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="hidden xl:inline">Panele Dön:</span>
                <span className="font-black max-w-[90px] xl:max-w-[140px] truncate">{currentUser.name}</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            ) : (
              <button
                onClick={() => { sound.beep(); onOpenLogin(); }}
                className="flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-4 py-2 xl:py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 text-slate-800 dark:text-white hover:text-brand-600 dark:hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer font-black text-[11px] xl:text-xs shadow-xs group whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-brand-600 dark:text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
                <span>Giriş Yap</span>
              </button>
            )}

            {/* Ücretsiz Dene CTA Butonu */}
            <button
              onClick={() => { sound.beep(); onOpenDemo(); }}
              className="hidden sm:flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-4 py-2 xl:py-2.5 rounded-xl bg-gradient-to-r from-brand-600 via-emerald-600 to-teal-600 hover:from-brand-700 hover:to-teal-700 text-white font-black text-[11px] xl:text-xs shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/30 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>14 Gün Ücretsiz Dene</span>
            </button>

            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={() => { sound.beep(); setIsMobileMenuOpen(!isMobileMenuOpen); }}
              aria-label={isMobileMenuOpen ? 'Navigasyon Menüsünü Kapat' : 'Navigasyon Menüsünü Aç'}
              aria-expanded={isMobileMenuOpen}
              className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0 cursor-pointer"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Backdrop & Navigation Drawer */}
        {isMobileMenuOpen && (
          <>
            <div
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 top-[72px] bg-slate-950/50 backdrop-blur-xs z-40 lg:hidden"
              aria-hidden="true"
            />
            <div className="relative z-50 lg:hidden mt-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3">
            <div className="flex flex-col space-y-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <button 
                onClick={() => scrollToSection('ozellikler')}
                className="text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Özellikler
              </button>
              <button 
                onClick={() => scrollToSection('cozumler')}
                className="text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Çözümler
              </button>
              <button 
                onClick={() => scrollToSection('donanim')}
                className="text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Donanım & Entegrasyon
              </button>
              <button 
                onClick={() => scrollToSection('fiyatlar')}
                className="text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Fiyatlar
              </button>
              <button 
                onClick={() => scrollToSection('sss')}
                className="text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                S.S.S.
              </button>
              <button 
                onClick={() => scrollToSection('iletisim')}
                className="text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                İletişim
              </button>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
              <button
                onClick={() => { setIsMobileMenuOpen(false); onOpenDemo(); }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 text-white font-black text-xs text-center shadow-md shadow-emerald-600/20"
              >
                14 Gün Ücretsiz Dene
              </button>
              {onOpenMasterAdmin && (
                <button
                  onClick={() => { setIsMobileMenuOpen(false); onOpenMasterAdmin(); }}
                  className="w-full py-2.5 rounded-xl bg-amber-500/10 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 font-bold text-xs text-center flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                  <span>🔐 SaaS Master Admin Paneli</span>
                </button>
              )}
            </div>
          </div>
          </>
        )}

      </div>
    </header>
  );
};
