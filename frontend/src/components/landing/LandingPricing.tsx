import React, { useState } from 'react';
import { Check, Sparkles, Zap, ShieldCheck, ArrowRight } from 'lucide-react';
import { sound } from '../../services/sound';

interface LandingPricingProps {
  onOpenDemo: () => void;
}

export const LandingPricing: React.FC<LandingPricingProps> = ({ onOpenDemo }) => {
  const [isYearly, setIsYearly] = useState<boolean>(true);

  const plans = [
    {
      id: 'starter',
      name: 'Başlangıç',
      badge: 'Küçük İşletmeler & Büfeler',
      desc: 'Hızlı kasa satışı, take-away ve paket servis odaklı butik işletmeler için.',
      monthlyPrice: 790,
      yearlyPrice: 630,
      popular: false,
      features: [
        'Hızlı Kasa & Dokunmatik Satış Ekranı',
        '2 Terminallik Erişim (Kasa + Telefon)',
        'Sınırsız Ürün & Kategori Tanımlama',
        '80mm / 58mm Termal Fiş Yazdırma',
        'Temel Gün Sonu & Z Raporları',
        'Offline-First (İnternetsiz Satış)',
        'E-Posta & WhatsApp Destek'
      ]
    },
    {
      id: 'pro',
      name: 'Profesyonel',
      badge: '⭐ EN ÇOK TERCİH EDİLEN',
      desc: 'Masa düzeni, mutfak ekranı ve stok kontrolü isteyen tam teşekküllü restoranlar.',
      monthlyPrice: 1490,
      yearlyPrice: 1190,
      popular: true,
      features: [
        'Başlangıç Paketindeki Her Şey',
        'Sınırsız Masa & Kat Planı (Bahçe, Salon, Teras)',
        'Sınırsız Garson & Terminal Bağlantısı',
        'Akıllı Mutfak Ekranı (KDS) İstasyonları',
        'GİB Onaylı Resmi E-Adisyon & E-Fatura',
        'Temassız Dijital QR Menü & Masadan Sipariş',
        'Gramajlı Reçete, Stok & Hammadde Düşümü',
        'Yemek Platformları (Getir, Yemeksepeti) Entegre',
        '7/24 Kesintisiz Telefon & Canlı Destek'
      ]
    },
    {
      id: 'enterprise',
      name: 'Kurumsal & Zincir',
      badge: 'Çok Şubeli İşletmeler',
      desc: 'Çoklu şube ağı, franchise restoranlar ve merkezi depo yönetimi gerektiren yapılar.',
      monthlyPrice: 2990,
      yearlyPrice: 2390,
      popular: false,
      features: [
        'Profesyonel Paketindeki Her Şey',
        'Sınırsız Şube & Merkezi Menü Yönetimi',
        'Merkezi Depo & Şubeler Arası Transfer',
        'Franchise Ciro & Royalty Raporlama',
        'Otel PMS / Folio Entegrasyonu',
        'Özel API & ERP (Mikro, Logo) Entegrasyonu',
        'Özel Müşteri Temsilcisi & Öncelikli SLA',
        'Yerinde Kurulum ve Personel Eğitimi'
      ]
    }
  ];

  return (
    <section id="fiyatlar" className="py-20 bg-white dark:bg-slate-950 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-black tracking-wider uppercase">
            <Zap className="w-3.5 h-3.5" />
            <span>Şeffaf & Adil Fiyatlandırma</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Gizli Ücret Yok, <span className="text-brand-600 dark:text-emerald-400">Sürpriz Maliyet Yok</span>
          </h2>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-medium">
            Tüm paketlerimizde 14 gün ücretsiz deneme dahildir. Kredi kartı bilgisi gerekmez, dilediğiniz an taahhütsüz iptal edebilirsiniz.
          </p>

          {/* Billing Interval Toggle (Aylık / Yıllık) */}
          <div className="flex items-center justify-center gap-3 pt-4">
            <span className={`text-xs font-bold ${!isYearly ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
              Aylık Ödeme
            </span>

            <button
              onClick={() => { sound.beep(); setIsYearly(!isYearly); }}
              className="relative w-14 h-7 rounded-full bg-slate-200 dark:bg-slate-800 p-0.5 transition cursor-pointer"
            >
              <div
                className={`w-6 h-6 rounded-full bg-emerald-600 shadow-md transition-transform ${
                  isYearly ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>

            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${isYearly ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                Yıllık Ödeme
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white animate-pulse">
                %20 İndirimli (2 Ay Bedava)
              </span>
            </div>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {plans.map((p) => {
            const price = isYearly ? p.yearlyPrice : p.monthlyPrice;
            return (
              <div
                key={p.id}
                className={`relative rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 ${
                  p.popular
                    ? 'bg-slate-900 text-white shadow-2xl ring-4 ring-emerald-500/30 scale-100 lg:-translate-y-2'
                    : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl'
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-brand-600 to-emerald-500 text-white text-[11px] font-black shadow-md tracking-wider">
                    {p.badge}
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-black">{p.name}</h3>
                      <p className={`text-xs mt-1 ${p.popular ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                        {p.desc}
                      </p>
                    </div>
                  </div>

                  {/* Price Row */}
                  <div className="my-6 pb-6 border-b border-slate-200/20">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl sm:text-5xl font-black">₺{price}</span>
                      <span className={`text-xs font-bold ${p.popular ? 'text-slate-400' : 'text-slate-500'}`}>
                        / ay (+ KDV)
                      </span>
                    </div>
                    {isYearly && (
                      <p className="text-[11px] text-emerald-400 font-bold mt-1">
                        Yıllık peşin faturalandırılır (₺{price * 12}/yıl)
                      </p>
                    )}
                  </div>

                  {/* Features List */}
                  <div className="space-y-3 mb-8">
                    {p.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs font-bold">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          p.popular ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                        <span className={p.popular ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                          {feat}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card CTA */}
                <button
                  onClick={() => { sound.beep(); onOpenDemo(); }}
                  className={`w-full py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
                    p.popular
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                      : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100'
                  }`}
                >
                  <span>14 Gün Ücretsiz Başla</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
