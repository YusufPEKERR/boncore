import React, { useState } from 'react';
import { LandingNavbar } from './LandingNavbar';
import { LandingHero } from './LandingHero';
import { LandingFeatures } from './LandingFeatures';
import { LandingSolutions } from './LandingSolutions';
import { LandingHardware } from './LandingHardware';
import { LandingPricing } from './LandingPricing';
import { LandingTestimonials } from './LandingTestimonials';
import { LandingFaq } from './LandingFaq';
import { LandingCta } from './LandingCta';
import { LandingFooter } from './LandingFooter';
import { DemoRequestModal } from './DemoRequestModal';
import { StaffUser } from '../../types';
import { sound } from '../../services/sound';

interface LandingPageProps {
  onOpenLogin: () => void;
  onGoToApp: () => void;
  currentUser: StaffUser | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onQuickDemoLogin?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenLogin,
  onGoToApp,
  currentUser,
  theme,
  onToggleTheme,
  onQuickDemoLogin
}) => {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState<boolean>(false);

  const handleOpenDemo = () => {
    sound.beep();
    setIsDemoModalOpen(true);
  };

  const handleCloseDemo = () => {
    setIsDemoModalOpen(false);
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto overflow-x-hidden scroll-smooth bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-500 selection:text-white relative">
      
      {/* Sticky Modern Navbar with "Giriş Yap" button */}
      <LandingNavbar
        onOpenLogin={onOpenLogin}
        onOpenDemo={handleOpenDemo}
        currentUser={currentUser}
        onGoToApp={onGoToApp}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      {/* Main Content Sections */}
      <main>
        {/* 1. Hero Section with Live Product Showcase */}
        <LandingHero
          onOpenDemo={handleOpenDemo}
          onOpenLogin={onOpenLogin}
          onQuickDemoLogin={onQuickDemoLogin}
        />

        {/* 2. Modüller & Özellikler (Adisyo Modül Kartları) */}
        <LandingFeatures />

        {/* 3. Sektörel Çözümler (Restoran, Kafe, Fast Food, Bar, Otel) */}
        <LandingSolutions onOpenDemo={handleOpenDemo} />

        {/* 4. Donanım & Çevre Birimleri & Platform Entegrasyonları */}
        <LandingHardware />

        {/* 5. Şeffaf Fiyatlandırma Paketleri */}
        <LandingPricing onOpenDemo={handleOpenDemo} />

        {/* 6. Müşteri Referansları & Sosyal Kanıt */}
        <LandingTestimonials />

        {/* 7. Sıkça Sorulan Sorular (Accordion FAQ) */}
        <LandingFaq />

        {/* 8. Call to Action Lead Banner */}
        <LandingCta
          onOpenDemo={handleOpenDemo}
          onOpenLogin={onOpenLogin}
        />
      </main>

      {/* Footer */}
      <LandingFooter
        onOpenLogin={onOpenLogin}
        onOpenDemo={handleOpenDemo}
      />

      {/* Interactive 14-Day Free Demo / Lead Capture Modal */}
      <DemoRequestModal
        isOpen={isDemoModalOpen}
        onClose={handleCloseDemo}
        onLaunchDemo={onQuickDemoLogin || onOpenLogin}
      />

    </div>
  );
};
