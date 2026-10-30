import React, { useState } from 'react';
import { 
  UtensilsCrossed, Coffee, Sandwich, Wine, Hotel, 
  Cake, CheckCircle2, ArrowRight, Sparkles 
} from 'lucide-react';
import { sound } from '../../services/sound';

interface LandingSolutionsProps {
  onOpenDemo: () => void;
}

export const LandingSolutions: React.FC<LandingSolutionsProps> = ({ onOpenDemo }) => {
  const [activeSolution, setActiveSolution] = useState<string>('restaurant');

  const solutions = [
    {
      id: 'restaurant',
      icon: UtensilsCrossed,
      title: 'Restoran & Meyhane',
      headline: 'Adisyon Karmaşasına ve Geciken Siparişlere Son',
      desc: 'Masa düzeninden parçalı hesap tahsilatına, kuver & ikram yönetiminden garson yetkilerine kadar tam teşekküllü restoran yönetimi.',
      points: [
        'Kişiye veya masaya özel parçalı tahsilat (Nakit, Kredi Kartı, Yemek Kartı)',
        'Otomatik kuver, servis bedeli ve yüzde bazlı ikram kuralları',
        'Garsonların masayı akıllı telefondan veya tabletten açıp sipariş girmesi',
        'Mutfak ve bara anında kablosuz sipariş iletimi'
      ]
    },
    {
      id: 'cafe',
      icon: Coffee,
      title: 'Kafe & Kahve Dükkanı',
      headline: 'Hızlı Kasa, Sadık Müşteriler ve Dijital QR Menü',
      desc: 'Yoğun tezgah sıralarını hızlı dokunmatik POS ile eritin. Müşteri sadakat puanları ve içecek varyantlarıyla kahve dükkanınızı büyütün.',
      points: [
        'Süt tipi (Badem, Yulaf, Laktozsuz) ve şurup varyantları ile hızlı sipariş',
        'Numaralı müşteri fişi ve çağrı ekranı (CFD) entegrasyonu',
        'Müşteri sadakat programı (10. Kahve Bedava)',
        'Masalarda temassız dijital QR menü'
      ]
    },
    {
      id: 'fastfood',
      icon: Sandwich,
      title: 'Fast Food & Paket Servis',
      headline: 'Saniyeler İçinde Sipariş Alın, Kuryeleri Tek Ekranda Yönetin',
      desc: 'Paket servis platformları (Getir, Yemeksepeti, Trendyol) ve tezgah siparişlerini tek bir merkezde birleştirin.',
      points: [
        'Yemeksepeti, GetirYemek ve Trendyol Yemek anlık sipariş entegrasyonu',
        'Entegre kurye takip haritası ve teslimat süreleri',
        'Numaratörlü çağrı ekranı (Müşteri sipariş hazır panosu)',
        'Caller ID cihazı ile telefon çaldığında müşteri adresinin otomatik gelmesi'
      ]
    },
    {
      id: 'bar',
      icon: Wine,
      title: 'Bar, Pub & Gece Kulübü',
      headline: 'Karanlık ve Hareketli Ortamlarda Yıldırım Hızında Satış',
      desc: 'Açık hesap defteri, loca ve stand yönetimi, yüksek tempolu içecek siparişi için optimize edilmiş arayüz.',
      points: [
        'Açık hesap ve veresiye limit takibi ile misafir güvenliği',
        'Şişe açma ve shot bazlı reçeteli stok düşümü',
        'Loca, Bar, Stand bölge ayrımı',
        'Koyu modda göz yormayan, tek dokunuşla çalışan geniş butonlar'
      ]
    },
    {
      id: 'hotel',
      icon: Hotel,
      title: 'Otel & Beach Club',
      headline: 'Şezlongdan Odalara, Çoklu Para Birimli Kapsamlı Yönetim',
      desc: 'Oda hesabına aktarım (Folio), döviz kurları (EUR, USD, GBP) ile otomatik fiyatlandırma ve şezlong bölgesi yönetimi.',
      points: [
        'Otel PMS sistemleri ile uyumlu Folio (Oda Hesabına Yazma) entegrasyonu',
        'Döviz kurları ile anlık kurdan tahsilat imkanı',
        'Geniş açık alanlar için şezlong ve kaban bölge planı',
        'Tablet üzerinden açık alanda kablosuz sipariş alma'
      ]
    },
    {
      id: 'bakery',
      icon: Cake,
      title: 'Pastane & Fırın',
      headline: 'Terazi Entegrasyonu ve Gramajlı Ürün Satışı',
      desc: 'Hassas tartım terazileri ve barkod okuyucularla tam entegre; kilo veya adet bazlı satışları saniyeler içinde tamamlayın.',
      points: [
        'Seri port / USB hassas tartım terazi entegrasyonu ile anlık gramaj hesaplama',
        'Barkodlu paketli ürünler ve taze unlu mamul partileri',
        'Günün saatine göre değişen taze ürün indirimleri',
        'Hızlı fiş kesimi ve temassız POS çekimi'
      ]
    }
  ];

  const current = solutions.find(s => s.id === activeSolution) || solutions[0];
  const CurrentIcon = current.icon;

  return (
    <section id="cozumler" className="py-20 bg-white dark:bg-slate-950 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 text-xs font-black tracking-wider uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sektörel Çözümler</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            İşletmenizin Türü Ne Olursa Olsun, <span className="text-brand-600 dark:text-emerald-400">BonCore Yanınızda</span>
          </h2>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-medium">
            Her yeme-içme işletmesinin dinamiği farklıdır. BonCore, işletmenizin özel gereksinimlerine göre tek tıkla uyarlanır.
          </p>
        </div>

        {/* Category Pills Navigation */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-10">
          {solutions.map((sol) => {
            const Icon = sol.icon;
            const isSelected = activeSolution === sol.id;
            return (
              <button
                key={sol.id}
                onClick={() => { sound.beep(); setActiveSolution(sol.id); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition cursor-pointer select-none ${
                  isSelected
                    ? 'bg-brand-600 dark:bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 scale-105'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{sol.title}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Solution Showcase Card */}
        <div className="bg-gradient-to-br from-slate-50 to-emerald-50/40 dark:from-slate-900 dark:to-slate-900/60 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            <div className="lg:col-span-7 space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-brand-600 dark:bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                <CurrentIcon className="w-7 h-7" />
              </div>

              <div>
                <span className="text-xs font-black uppercase tracking-wider text-brand-600 dark:text-emerald-400">
                  {current.title} İçin Özel Tasarlandı
                </span>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
                  {current.headline}
                </h3>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                {current.desc}
              </p>

              <div className="space-y-3 pt-2">
                {current.points.map((pt, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-snug">
                      {pt}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-4">
                <button
                  onClick={() => { sound.beep(); onOpenDemo(); }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-xs hover:scale-105 transition cursor-pointer shadow-md"
                >
                  <span>{current.title} İçin Ücretsiz Dene</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Visual Box */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-950 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-black text-slate-900 dark:text-white">İşletme Optimizasyon Skoru</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  %98 Mükemmel
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    <span>Sipariş Alma Hızı</span>
                    <span className="text-emerald-600">3x Daha Hızlı</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full w-[95%]" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    <span>Mutfak Hata Oranı</span>
                    <span className="text-emerald-600">Sıfıra Yakın (%0.2)</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full w-[99%]" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    <span>Masa Devir Hızı</span>
                    <span className="text-emerald-600">+ %35 Artış</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full w-[88%]" />
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 text-center">
                ✨ BonCore ile ilk 30 günde ortalama %22 kâr marjı artışı sağlanır.
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
};
