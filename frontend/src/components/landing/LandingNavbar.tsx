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
  currentUser: StaffUser | null;
  onGoToApp: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({
  onOpenLogin,
  onOpenDemo,
  currentUser,
  onGoToApp,
  theme,
  onToggleTheme,
}) => {
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          
          {/* Brand Logo */}
          <div 
            onClick={() => { sound.beep(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="flex items-center gap-2.5 cursor-pointer group select-none"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-700 via-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-200">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                  Bon<span className="text-brand-600 dark:text-emerald-400">Core</span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                  POS
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 leading-none -mt-0.5">
                Bulut Restoran Yönetimi
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-bold text-slate-600 dark:text-slate-300">
            <button 
              onClick={() => scrollToSection('ozellikler')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              Özellikler
            </button>
            <button 
              onClick={() => scrollToSection('cozumler')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              Çözümler
            </button>
            <button 
              onClick={() => scrollToSection('donanim')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              Donanım & Entegrasyon
            </button>
            <button 
              onClick={() => scrollToSection('fiyatlar')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              Fiyatlar
            </button>
            <button 
              onClick={() => scrollToSection('sss')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              S.S.S.
            </button>
            <button 
              onClick={() => scrollToSection('iletisim')}
              className="hover:text-brand-600 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              İletişim
            </button>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            
            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Açık Mod' : 'Karanlık Mod'}
              className="p-2 sm:p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-emerald-400 hover:border-emerald-500/40 transition cursor-pointer shadow-xs"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Giriş Yap / Sisteme Git Butonu (Kullanıcının Özel İsteği) */}
            {currentUser ? (
              <button
                onClick={() => { sound.beep(); onGoToApp(); }}
                className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition cursor-pointer font-bold text-xs shadow-xs"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="hidden sm:inline">Panele Dön:</span>
                <span className="font-black">{currentUser.name}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => { sound.beep(); onOpenLogin(); }}
                className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 text-slate-800 dark:text-white hover:text-brand-600 dark:hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer font-black text-xs shadow-xs group"
              >
                <LogIn className="w-4 h-4 text-brand-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>Giriş Yap</span>
              </button>
            )}

            {/* Ücretsiz Dene CTA Butonu */}
            <button
              onClick={() => { sound.beep(); onOpenDemo(); }}
              className="hidden sm:flex items-center gap-2 px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-brand-600 via-emerald-600 to-teal-600 hover:from-brand-700 hover:to-teal-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/30 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>14 Gün Ücretsiz Dene</span>
            </button>

            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={() => { sound.beep(); setIsMobileMenuOpen(!isMobileMenuOpen); }}
              className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden mt-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
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
            </div>
          </div>
        )}

      </div>
    </header>
  );
};
