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
  onOpenMasterAdmin?: () => void;
  initialKvkkOpen?: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenLogin,
  onGoToApp,
  currentUser,
  theme,
  onToggleTheme,
  onQuickDemoLogin,
  onOpenMasterAdmin,
  initialKvkkOpen = false
}) => {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState<boolean>(false);
  const [isKvkkOpen, setIsKvkkOpen] = useState<boolean>(initialKvkkOpen);

  const handleOpenDemo = () => {
    sound.beep();
    setIsDemoModalOpen(true);
  };

  const handleCloseDemo = () => {
    setIsDemoModalOpen(false);
  };

  return (
    <div className="min-h-screen h-full w-full overflow-y-auto overflow-x-hidden scroll-smooth bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-500 selection:text-white relative">
      
      {/* Sticky Modern Navbar with "Giriş Yap" button */}
      <LandingNavbar
        onOpenLogin={onOpenLogin}
        onOpenDemo={handleOpenDemo}
        onOpenMasterAdmin={onOpenMasterAdmin}
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
        onOpenMasterAdmin={onOpenMasterAdmin}
        onOpenKvkk={() => setIsKvkkOpen(true)}
      />

      {/* Interactive 14-Day Free Demo / Lead Capture Modal */}
      <DemoRequestModal
        isOpen={isDemoModalOpen}
        onClose={handleCloseDemo}
        onLaunchDemo={onQuickDemoLogin || onOpenLogin}
      />

      {/* KVKK & Aydınlatma Metni Modal */}
      {isKvkkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kvkk-modal-title"
        >
          <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 id="kvkk-modal-title" className="text-lg font-black text-slate-900 dark:text-white">
                KVKK & Kişisel Verilerin Korunması Aydınlatma Metni
              </h2>
              <button
                type="button"
                aria-label="KVKK Penceresini Kapat"
                onClick={() => {
                  sound.beep();
                  setIsKvkkOpen(false);
                  if (window.location.pathname === '/kvkk') {
                    window.history.replaceState(null, '', '/');
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Kapat
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                <b>BonCore Bulut Restoran Teknolojileri A.Ş.</b> olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında kişisel verilerinizin güvenliğine ve gizliliğine önem veriyoruz.
              </p>
              <p>
                <b>1. İşlenen Kişisel Veriler ve Amaçları:</b> Demo talebi, abonelik başvurusu ve restoran operasyon yönetimi süreçlerinde tarafınızca paylaşılan ad-soyad, telefon numarası, işletme unvanı ve şehir bilgileri; yalnızca hizmet sunumu, hesap kurulumu, destek taleplerinin yanıtlanması ve yasal yükümlülüklerin (GİB E-Adisyon dahil) yerine getirilmesi amacıyla işlenmektedir.
              </p>
              <p>
                <b>2. Veri Güvenliği ve Saklama:</b> Restoran verileri çoklu kiracılı (multi-tenant) izole mimaride saklanır, personel PIN/parola verileri PBKDF2 algoritmasıyla kriptografik olarak korunur ve yetkisiz üçüncü kişilerle paylaşılmaz.
              </p>
              <p>
                <b>3. KVKK Kapsamındaki Haklarınız:</b> KVKK&apos;nın 11. maddesi uyarınca verilerinize erişme, düzeltilmesini veya silinmesini talep etme haklarınızı <b>destek@boncore.com</b> adresi üzerinden kullanabilirsiniz.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
