import React, { useState } from 'react';
import { 
  Sparkles, ArrowRight, Play, CheckCircle2, ShieldCheck, 
  WifiOff, Smartphone, Monitor, ChefHat, Layers, Receipt, 
  TrendingUp, Clock, QrCode, Star, Utensils, Check, CreditCard, ChevronRight
} from 'lucide-react';
import { sound } from '../../services/sound';

interface LandingHeroProps {
  onOpenDemo: () => void;
  onOpenLogin: () => void;
  onQuickDemoLogin?: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  onOpenDemo,
  onOpenLogin,
  onQuickDemoLogin
}) => {
  const [activeShowcaseTab, setActiveShowcaseTab] = useState<'pos' | 'kds' | 'qr' | 'reports'>('pos');

  return (
    <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
      
      {/* Background Decorative Gradients & Radial Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-emerald-500/10 via-teal-500/5 to-transparent blur-3xl -z-10 pointer-events-none" />
      <div className="absolute top-20 right-10 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute top-40 left-10 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Hero Text Section */}
        <div className="text-center max-w-4xl mx-auto space-y-6">
          
          {/* Top Pill / Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200/80 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-300 shadow-2xs">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs font-black tracking-wide">
              GİB Onaylı E-Adisyon & Bulut Restoran Sistemi
            </span>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              v2.4
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.12]">
            Restoranınızı <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 via-emerald-500 to-teal-500">Tek Noktadan</span>, Akıllıca ve Kesintisiz Yönetin
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg lg:text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto font-medium leading-relaxed">
            Masa siparişinden akıllı mutfak ekranına (KDS), resmi e-Adisyondan dijital QR menüye, paket servis entegrasyonlarından offline-first kesintisiz satışa kadar restoranınızın tüm operasyonları tek platformda.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
            <button
              onClick={() => { sound.beep(); onOpenDemo(); }}
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-brand-600 via-emerald-600 to-teal-600 hover:from-brand-700 hover:to-teal-700 text-white font-black text-sm shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/35 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer group"
            >
              <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              <span>14 Gün Ücretsiz Deneyin</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={() => {
                sound.beep();
                if (onQuickDemoLogin) {
                  onQuickDemoLogin();
                } else {
                  onOpenLogin();
                }
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-white font-black text-sm shadow-xs hover:border-emerald-500/50 transition cursor-pointer"
            >
              <Play className="w-4 h-4 text-brand-600 dark:text-emerald-400 fill-brand-600 dark:fill-emerald-400" />
              <span>Canlı Demoyu İncele (Giriş)</span>
            </button>
          </div>

          {/* Micro Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-y-2 gap-x-6 pt-3 text-xs font-bold text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Kredi kartı gerekmez</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Aynı gün kurulum</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Sözleşme / Taahhüt yok</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>7/24 Kesintisiz Destek</span>
            </div>
          </div>

        </div>

        {/* Interactive Live Product Showcase Preview (The Crown Jewel) */}
        <div className="mt-12 sm:mt-16 max-w-5xl mx-auto">
          
          {/* Showcase Tabs */}
          <div className="flex items-center justify-center gap-2 p-1.5 rounded-2xl bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 max-w-2xl mx-auto mb-6 shadow-xs">
            {[
              { id: 'pos', label: 'Masa & Kasa POS', icon: Utensils },
              { id: 'kds', label: 'Akıllı Mutfak (KDS)', icon: ChefHat },
              { id: 'qr', label: 'Temassız QR Menü', icon: QrCode },
              { id: 'reports', label: 'Patron Raporları', icon: TrendingUp }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeShowcaseTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { sound.beep(); setActiveShowcaseTab(tab.id as any); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-black transition cursor-pointer select-none ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-emerald-400 shadow-md shadow-slate-200/50 dark:shadow-none'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Interactive Screen Frame */}
          <div className="relative rounded-3xl p-3 sm:p-4 bg-gradient-to-b from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-850 dark:to-slate-900 shadow-2xl border border-slate-300 dark:border-slate-700">
            
            {/* Mock Tablet Camera Dot */}
            <div className="w-2.5 h-2.5 bg-slate-400 dark:bg-slate-600 rounded-full mx-auto mb-2 opacity-80" />

            {/* Inner App Container */}
            <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-inner min-h-[420px] flex flex-col">
              
              {/* Tab 1: MASA & KASA POS GÖRÜNÜMÜ */}
              {activeShowcaseTab === 'pos' && (
                <div className="p-4 sm:p-6 flex-1 flex flex-col space-y-4">
                  {/* Top Bar */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black">
                        B4
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                          <span>Masa: Bahçe 04</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                            Adisyon Açık
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">Garson: Ahmet K. • 4 Kişi • 32 dk</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-slate-500 font-bold">Toplam Tutar</div>
                      <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">₺1.240,00</div>
                    </div>
                  </div>

                  {/* Floor Plan Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/40">
                      <div className="flex justify-between items-start">
                        <span className="font-black text-xs text-slate-900 dark:text-white">Bahçe 01</span>
                        <span className="text-[10px] font-bold text-emerald-600">Dolu</span>
                      </div>
                      <div className="text-sm font-black text-slate-900 dark:text-white mt-2">₺840,00</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">3 Ürün • 18 dk</div>
                    </div>

                    <div className="p-3 rounded-xl border-2 border-emerald-500 bg-white dark:bg-slate-900 shadow-md ring-2 ring-emerald-500/20">
                      <div className="flex justify-between items-start">
                        <span className="font-black text-xs text-emerald-700 dark:text-emerald-300">Bahçe 04 ★</span>
                        <span className="text-[10px] font-bold text-amber-600">Seçili</span>
                      </div>
                      <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-2">₺1.240,00</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">5 Ürün • 32 dk</div>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 opacity-80">
                      <div className="flex justify-between items-start">
                        <span className="font-black text-xs text-slate-900 dark:text-white">Salon 03</span>
                        <span className="text-[10px] font-bold text-slate-400">Boş</span>
                      </div>
                      <div className="text-sm font-black text-slate-400 mt-2">₺0,00</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Hazır</div>
                    </div>

                    <div className="p-3 rounded-xl border border-blue-500/40 bg-blue-500/10 dark:bg-blue-950/40">
                      <div className="flex justify-between items-start">
                        <span className="font-black text-xs text-slate-900 dark:text-white">Teras 02</span>
                        <span className="text-[10px] font-bold text-blue-600">Hesap İstendi</span>
                      </div>
                      <div className="text-sm font-black text-slate-900 dark:text-white mt-2">₺620,00</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Kredi Kartı Bekliyor</div>
                    </div>
                  </div>

                  {/* Order Line Items */}
                  <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200/80 dark:border-slate-800 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                      <span>2x Dana Antrikot (Orta Pişmiş)</span>
                      <span>₺960,00</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                      <span>1x Gavurdağı Salata</span>
                      <span>₺160,00</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span>2x Yayık Ayranı</span>
                      <span>₺120,00</span>
                    </div>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                        💳 Parçalı Ödeme Aktif
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold">
                        🧾 E-Adisyon Hazır
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => { sound.cashDrawer(); alert('Demoda Kasa Tahsilatı simüle edildi!'); }}
                        className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-black text-xs shadow-sm cursor-pointer"
                      >
                        Nakit / POS Tahsil Et
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: MUTFAK EKRANI (KDS) */}
              {activeShowcaseTab === 'kds' && (
                <div className="p-4 sm:p-6 flex-1 flex flex-col space-y-4 bg-slate-900 text-white">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <ChefHat className="w-5 h-5 text-amber-400" />
                      <span className="font-black text-sm">Akıllı Mutfak Ekranı (KDS) • Sıcak İstasyonu</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400">
                      3 Aktif Sipariş
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-800 border border-amber-500/40 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-black text-amber-400">Masa: Bahçe 04</span>
                        <span className="font-mono text-amber-400 font-bold">⏱️ 04:12</span>
                      </div>
                      <div className="text-xs space-y-1">
                        <div className="font-bold">• 2x Dana Antrikot (Orta)</div>
                        <div className="font-bold">• 1x Izgara Köfte</div>
                        <div className="text-[11px] text-amber-300 font-medium">Not: Köfte iyi pişmiş olsun</div>
                      </div>
                      <button className="w-full mt-2 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-black text-xs">
                        Hazırlandı Olarak İşaretle
                      </button>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-black text-emerald-400">Masa: Salon 01</span>
                        <span className="font-mono text-emerald-400 font-bold">⏱️ 01:45</span>
                      </div>
                      <div className="text-xs space-y-1">
                        <div className="font-bold">• 1x Tavuk Pirzola</div>
                        <div className="font-bold">• 1x Çoban Salata</div>
                      </div>
                      <button className="w-full mt-2 py-1.5 rounded-lg bg-slate-700 text-white font-black text-xs">
                        Hazırlanıyor
                      </button>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2 opacity-75">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-black text-slate-300">🛵 GetirYemek #482</span>
                        <span className="font-mono text-slate-300 font-bold">⏱️ 08:30</span>
                      </div>
                      <div className="text-xs space-y-1">
                        <div className="font-bold">• 2x Lahmacun</div>
                        <div className="font-bold">• 1x Ayran</div>
                      </div>
                      <button className="w-full mt-2 py-1.5 rounded-lg bg-emerald-600 text-white font-black text-xs">
                        Kuryeye Teslim Et
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: TEMASSIZ QR MENÜ */}
              {activeShowcaseTab === 'qr' && (
                <div className="p-4 sm:p-6 flex-1 flex flex-col sm:flex-row items-center justify-center gap-8 bg-slate-50 dark:bg-slate-900/60">
                  <div className="w-64 bg-white dark:bg-slate-950 rounded-3xl border-4 border-slate-800 p-3 shadow-xl space-y-3">
                    <div className="text-center pb-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="text-xs font-black text-slate-900 dark:text-white">BONCORE RESTORAN</div>
                      <div className="text-[10px] text-emerald-600 font-bold">Masa: Bahçe 04 • Dijital QR Menü</div>
                    </div>
                    <div className="space-y-2">
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-white">Dana Antrikot</div>
                          <div className="text-[10px] text-emerald-600 font-bold">₺480,00</div>
                        </div>
                        <button className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[10px] font-bold">
                          + Ekle
                        </button>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-white">Fıstıklı Katmer</div>
                          <div className="text-[10px] text-emerald-600 font-bold">₺220,00</div>
                        </div>
                        <button className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[10px] font-bold">
                          + Ekle
                        </button>
                      </div>
                    </div>
                    <button className="w-full py-2 rounded-xl bg-emerald-600 text-white font-black text-xs shadow-sm">
                      Siparişimi Mutfağa Gönder
                    </button>
                  </div>

                  <div className="max-w-md space-y-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Uygulama İndirmek Gerekmez</span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">
                      Misafirleriniz Masadan Kolayca Sipariş Versin
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                      Telefon kamerasını masadaki QR koda tutan misafirleriniz fotoğraflı, çok dilli menüyü inceler; garson beklemeden sipariş verir veya garson çağırabilir.
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 4: PATRON RAPORLARI */}
              {activeShowcaseTab === 'reports' && (
                <div className="p-4 sm:p-6 flex-1 flex flex-col space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-sm font-black text-slate-900 dark:text-white">Bugünkü Canlı Ciro Özeti</div>
                      <p className="text-xs text-slate-500">Tüm Şubeler • Anlık Güncellenir</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                      + %18 Geçen Haftaya Göre
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 font-bold">Toplam Ciro</div>
                      <div className="text-lg font-black text-slate-900 dark:text-white mt-1">₺48.250</div>
                      <div className="text-[10px] text-emerald-600 font-bold mt-0.5">84 Adisyon</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 font-bold">Kredi Kartı</div>
                      <div className="text-lg font-black text-blue-600 mt-1">₺34.800</div>
                      <div className="text-[10px] text-slate-500 font-bold mt-0.5">%72 Pay</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 font-bold">Nakit</div>
                      <div className="text-lg font-black text-emerald-600 mt-1">₺13.450</div>
                      <div className="text-[10px] text-slate-500 font-bold mt-0.5">%28 Pay</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 font-bold">Ortalama Masa</div>
                      <div className="text-lg font-black text-purple-600 mt-1">₺574,00</div>
                      <div className="text-[10px] text-emerald-600 font-bold mt-0.5">Yüksek Verim</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      🥇 En Çok Satan: <b>Dana Antrikot (38 Porsiyon)</b> • ₺18.240 Hasılat
                    </div>
                    <span className="text-xs text-brand-600 dark:text-emerald-400 font-black cursor-pointer">
                      Detaylı Raporu Aç →
                    </span>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
