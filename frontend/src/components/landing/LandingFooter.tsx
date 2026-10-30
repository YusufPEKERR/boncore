import React from 'react';
import { Utensils, Phone, Mail, MapPin, ShieldCheck, Heart } from 'lucide-react';
import { sound } from '../../services/sound';

interface LandingFooterProps {
  onOpenLogin: () => void;
  onOpenDemo: () => void;
}

export const LandingFooter: React.FC<LandingFooterProps> = ({ onOpenLogin, onOpenDemo }) => {
  const scrollTo = (id: string) => {
    sound.beep();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-900 pt-16 pb-12 select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-900">
          
          {/* Col 1: Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-700 via-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md">
                <Utensils className="w-5 h-5" />
              </div>
              <span className="text-xl font-black tracking-tight text-white">
                Bon<span className="text-emerald-400">Core</span> POS
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed font-medium max-w-sm">
              Türkiye'nin yeni nesil bulut restoran ve adisyon yönetim sistemi. Masa siparişinden mutfak ekranına, resmi GİB e-Adisyondan temassız QR menüye kadar işletmenizi tek ekranda yönetin.
            </p>

            <div className="space-y-2 pt-2 text-xs font-bold text-slate-300">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Moda Cad. No:84 D:4 Kadıköy / İSTANBUL</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <a href="tel:+902164443779" className="hover:text-white transition">+90 216 444 37 79</a>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                <a href="mailto:destek@boncore.com" className="hover:text-white transition">destek@boncore.com</a>
              </div>
            </div>
          </div>

          {/* Col 2: Ürün & Özellikler */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">
              Ürün & Özellikler
            </h4>
            <ul className="space-y-2 text-xs font-medium">
              <li>
                <button onClick={() => scrollTo('ozellikler')} className="hover:text-white transition cursor-pointer">
                  Hızlı Masa & Kasa POS
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('ozellikler')} className="hover:text-white transition cursor-pointer">
                  Akıllı Mutfak Ekranı (KDS)
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('ozellikler')} className="hover:text-white transition cursor-pointer">
                  GİB Resmi E-Adisyon
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('ozellikler')} className="hover:text-white transition cursor-pointer">
                  Offline-First (İnternetsiz Satış)
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('ozellikler')} className="hover:text-white transition cursor-pointer">
                  Dijital QR Menü & Sipariş
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('ozellikler')} className="hover:text-white transition cursor-pointer">
                  Reçete & Stok Maliyet
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Çözümler */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">
              Çözümler
            </h4>
            <ul className="space-y-2 text-xs font-medium">
              <li>
                <button onClick={() => scrollTo('cozumler')} className="hover:text-white transition cursor-pointer">
                  Restoran & Meyhane
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('cozumler')} className="hover:text-white transition cursor-pointer">
                  Kafe & Kahve Dükkanı
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('cozumler')} className="hover:text-white transition cursor-pointer">
                  Fast Food & Paket Servis
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('cozumler')} className="hover:text-white transition cursor-pointer">
                  Bar, Pub & Gece Kulübü
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('cozumler')} className="hover:text-white transition cursor-pointer">
                  Otel & Beach Club
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('cozumler')} className="hover:text-white transition cursor-pointer">
                  Pastane & Fırın
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: Hızlı Erişim & Giriş */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">
              Hızlı Erişim
            </h4>
            <ul className="space-y-2 text-xs font-medium">
              <li>
                <button 
                  onClick={() => { sound.beep(); onOpenLogin(); }}
                  className="text-emerald-400 font-bold hover:text-emerald-300 transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>→ Yönetim Girişi</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => { sound.beep(); onOpenDemo(); }}
                  className="hover:text-white transition cursor-pointer"
                >
                  14 Gün Ücretsiz Deneyin
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('fiyatlar')} className="hover:text-white transition cursor-pointer">
                  Fiyatlandırma Paketleri
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('donanim')} className="hover:text-white transition cursor-pointer">
                  Uyumlu Donanımlar
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo('sss')} className="hover:text-white transition cursor-pointer">
                  Sıkça Sorulan Sorular
                </button>
              </li>
              <li>
                <a href="/kvkk" onClick={(e) => { e.preventDefault(); alert('KVKK Metni: BonCore kişisel verilerin korunmasına tam uyumludur.'); }} className="hover:text-white transition">
                  KVKK & Aydınlatma Metni
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Copyright & Security Badges */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span>© {new Date().getFullYear()} BonCore Bulut Restoran Teknolojileri A.Ş. Tüm hakları saklıdır.</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-bold text-slate-500">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>256-Bit SSL Şifreleme</span>
            </span>
            <span>•</span>
            <span>GİB E-Adisyon Entegratörü</span>
            <span>•</span>
            <span>Offline-First Sync</span>
          </div>
        </div>

      </div>
    </footer>
  );
};
