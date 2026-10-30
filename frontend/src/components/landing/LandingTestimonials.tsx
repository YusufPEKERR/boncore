import React from 'react';
import { Star, Quote, CheckCircle2 } from 'lucide-react';

export const LandingTestimonials: React.FC = () => {
  const reviews = [
    {
      name: 'Murat Yılmaz',
      role: 'İşletme Sahibi',
      restaurant: 'Meyhane Moda / Kadıköy',
      comment: 'Cuma akşamları internetimiz yoğunluktan koptuğunda eski program kilitlenirdi. BonCore’a geçtikten sonra internet kesilse bile tıkır tıkır masa adisyonu kesiyoruz. Parçalı ödeme özelliği kasadaki kuyruğu bitirdi.',
      highlight: 'İnternetsiz kesintisiz satış'
    },
    {
      name: 'Selin Aksoy',
      role: 'Kurucu Ortak',
      restaurant: 'Roast & Brew Coffee / Beşiktaş',
      comment: 'Kafe konseptimizde QR menü ve hızlı kasa bizim için hayati önemdeydi. Misafirlerimiz masadan sipariş verdikleri an mutfak ekranına düşüyor. Kağıt adisyon masrafımız sıfıra indi.',
      highlight: 'QR Menü ile %40 daha hızlı servis'
    },
    {
      name: 'Cemil Demir',
      role: 'Genel Müdür',
      restaurant: 'Etiler Steak & Lounge / İstanbul',
      comment: 'GİB E-Adisyon mevzuatı geldiğinde ne yapacağımızı şaşırmıştık. BonCore aynı gün içinde kurulumu tamamladı. Mali mühürlü fişler termal yazıcımızdan anında çıkıyor, muhasebe tarafı tamamen otomatikleşti.',
      highlight: 'GİB E-Adisyon 1 günde aktif'
    }
  ];

  return (
    <section className="py-20 bg-slate-50/70 dark:bg-slate-900/50 relative border-t border-slate-200/60 dark:border-slate-800/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-xs font-black tracking-wider uppercase">
            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            <span>Müşteri Deneyimleri</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            500+ Restoran ve Kafe <span className="text-brand-600 dark:text-emerald-400">BonCore’a Güveniyor</span>
          </h2>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-medium">
            İşletmelerini dijitalleştiren ve kârlılıklarını artıran yöneticilerin gerçek deneyimleri.
          </p>
        </div>

        {/* Testimonials Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reviews.map((r, idx) => (
            <div
              key={idx}
              className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all flex flex-col justify-between"
            >
              <div>
                {/* 5 Stars */}
                <div className="flex items-center gap-1 text-amber-400 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400" />
                  ))}
                </div>

                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium mb-6 italic">
                  "{r.comment}"
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-black text-slate-900 dark:text-white">{r.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">{r.restaurant}</div>
                </div>

                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  {r.highlight}
                </span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
