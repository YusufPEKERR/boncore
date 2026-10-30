import React from 'react';
import { 
  Printer, Smartphone, Monitor, Scale, ShieldCheck, 
  CreditCard, CheckCircle2, Cpu, Sparkles 
} from 'lucide-react';

export const LandingHardware: React.FC = () => {
  const hardwareItems = [
    {
      icon: Printer,
      title: 'Termal Fiş & Adisyon Yazıcıları',
      desc: '80mm ve 58mm tüm ESC/POS uyumlu termal yazıcılar. USB, Ethernet (LAN) veya Wi-Fi üzerinden tek tıkla kurulum.',
      brands: 'Epson, Bixolon, Xprinter, Rongta, HPRT'
    },
    {
      icon: Monitor,
      title: 'Dokunmatik POS & Tabletler',
      desc: 'İster mevcut iPad veya Android tabletinizi kullanın, ister dokunmatik All-in-One Windows POS terminali.',
      brands: 'iPad, Samsung Galaxy Tab, Windows POS, Dokunmatik Monitörler'
    },
    {
      icon: CreditCard,
      title: 'Yeni Nesil ÖKC POS Entegrasyonu',
      desc: 'Gelir İdaresi Başkanlığı onaylı fiziki EFT-POS ve Yazar Kasa cihazlarıyla çift yönlü anlık entegrasyon.',
      brands: 'Ingenico, Beko, Hugin, Vera, Profilo'
    },
    {
      icon: Scale,
      title: 'Barkod Okuyucu & Hassas Terazi',
      desc: 'Gramajlı kg ürün satışı için USB/RS-232 hassas terazi desteği ve hızlı optik barkod okuyucular.',
      brands: 'Datalogic, Zebra, CAS, Dibal, Tera'
    }
  ];

  const integrationBadges = [
    { name: 'Gelir İdaresi Başkanlığı (GİB)', tag: 'Resmi E-Adisyon', color: 'bg-red-50 text-red-700 dark:bg-red-950/70 dark:text-red-300 border-red-200 dark:border-red-800' },
    { name: 'Yemeksepeti', tag: 'Otomatik Sipariş', color: 'bg-pink-50 text-pink-700 dark:bg-pink-950/70 dark:text-pink-300 border-pink-200 dark:border-pink-800' },
    { name: 'GetirYemek', tag: 'Kurye Entegre', color: 'bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
    { name: 'Trendyol Yemek', tag: 'Anlık Menü', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
    { name: 'Sodexo & Multinet & Edenred', tag: 'Yemek Kartı', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
    { name: 'Caller ID Arayan Tanıma', tag: 'Paket Telefon', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' }
  ];

  return (
    <section id="donanim" className="py-20 bg-slate-50/70 dark:bg-slate-900/50 relative border-t border-slate-200/60 dark:border-slate-800/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-black tracking-wider uppercase">
            <Cpu className="w-3.5 h-3.5" />
            <span>Donanım Özgürlüğü & Platform Entegrasyonları</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Mevcut Donanımlarınızı Değiştirmenize <span className="text-brand-600 dark:text-emerald-400">Gerek Yok!</span>
          </h2>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-medium">
            BonCore, sizi tek bir donanım markasına mecbur bırakmaz. Elinizdeki tablet, telefon, bilgisayar ve yazıcılarla hemen çalışmaya başlar.
          </p>
        </div>

        {/* Hardware 4 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {hardwareItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-lg transition-all space-y-4 flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-brand-600 dark:text-emerald-400" />
                  </div>

                  <h3 className="text-base font-black text-slate-900 dark:text-white mb-2">
                    {item.title}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                    {item.desc}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  Uyumlu: <span className="text-slate-800 dark:text-slate-200">{item.brands}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Integration Badges Cloud */}
        <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="text-center max-w-2xl mx-auto mb-6">
            <h4 className="text-lg font-black text-slate-900 dark:text-white">
              Sektörün Lider Platformları ile Tam Entegre
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
              Siparişler, ödemeler ve resmi belgeler tek bir ekranda toplanır, manuel iş yükü sıfırlanır.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {integrationBadges.map((badge, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl border text-xs font-black shadow-2xs ${badge.color}`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{badge.name}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/60 dark:bg-black/30">
                  {badge.tag}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
};
