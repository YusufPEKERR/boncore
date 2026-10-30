import React from 'react';
import { Sparkles, Phone, ArrowRight, ShieldCheck, Headphones } from 'lucide-react';
import { sound } from '../../services/sound';

interface LandingCtaProps {
  onOpenDemo: () => void;
  onOpenLogin: () => void;
}

export const LandingCta: React.FC<LandingCtaProps> = ({ onOpenDemo, onOpenLogin }) => {
  return (
    <section id="iletisim" className="py-20 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="relative rounded-3xl bg-gradient-to-r from-slate-900 via-brand-950 to-slate-900 text-white p-8 sm:p-14 border border-emerald-500/30 shadow-2xl overflow-hidden">
          
          {/* Subtle Ambient Glows */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl mx-auto text-center space-y-6">
            
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black tracking-wider uppercase border border-emerald-500/40">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Hemen Başlayın, Bugün Farkı Görün</span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              Restoranınızı Geleceğin Bulut Teknolojisiyle <span className="text-emerald-400">Yönetin</span>
            </h2>

            <p className="text-sm sm:text-base text-slate-300 font-medium max-w-2xl mx-auto leading-relaxed">
              14 gün boyunca hiçbir ücret ödemeden ve kredi kartı tanımlamadan BonCore'u tüm özellikleriyle deneyin.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
              <button
                onClick={() => { sound.beep(); onOpenDemo(); }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/30 hover:scale-105 transition cursor-pointer"
              >
                <span>14 Gün Ücretsiz Başla</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <a
                href="tel:+902164443779"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-4 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-white font-bold text-sm transition"
              >
                <Phone className="w-4 h-4 text-emerald-400" />
                <span>+90 216 444 37 79</span>
              </a>
            </div>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 font-bold">
              <span>🛡️ GİB E-Adisyon Onaylı</span>
              <span>⚡ Anında Kurulum</span>
              <span>📞 7/24 Teknik Destek</span>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
