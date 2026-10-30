import React from 'react';
import { 
  Utensils, ChefHat, Receipt, WifiOff, QrCode, 
  Bike, Boxes, BarChart3, ShieldCheck, CheckCircle2, 
  Sparkles, Layers, ArrowUpRight 
} from 'lucide-react';
import { sound } from '../../services/sound';

export const LandingFeatures: React.FC = () => {
  const features = [
    {
      id: 'table_pos',
      icon: Utensils,
      color: 'emerald',
      badge: 'Hızlı & Dokunmatik',
      title: 'Hızlı Masa & Adisyon Yönetimi',
      description: 'Görsel kroki üzerinden masa taşıma, birleştirme, adisyon bölme ve parçalı ödeme (Nakit, Kredi Kartı, Sodexo, Multinet) işlemlerini saniyeler içinde tamamlayın.',
      highlights: ['Görsel masa krokisi & kat planı', 'Parçalı & kişi başı tahsilat', 'Garson & yetki yönetimi', 'Açık hesap (veresiye) defteri']
    },
    {
      id: 'kds',
      icon: ChefHat,
      color: 'amber',
      badge: 'Sıfır Kağıt İsrafı',
      title: 'Akıllı Mutfak Ekranı (KDS)',
      description: 'Siparişleri Sıcak Mutfak, Bar ve Izgara istasyonlarına anında yönlendirin. Hazırlık sürelerini renkli sayaçlarla takip edin, kayıp siparişlerin önüne geçin.',
      highlights: ['İstasyon bazlı sipariş ayrımı', 'Sesli ve görsel hazırlık uyarıları', 'Geciken sipariş alarmları', 'Fiş kağıdı masrafına son']
    },
    {
      id: 'fiscal',
      icon: Receipt,
      color: 'blue',
      badge: 'GİB %100 Uyumlu',
      title: 'Resmi E-Adisyon & Mali Entegrasyon',
      description: 'Gelir İdaresi Başkanlığı mevzuatına tam uyumlu; ETTN ve QR kodlu resmi mali e-Adisyon belgelerini doğrudan üretin, ek cihaz masrafı olmadan arşivleyin.',
      highlights: ['GİB onaylı resmi format', 'Mali mühür ve ETTN barkodu', 'XML ve PDF indirme', 'Yeni nesil ÖKC POS entegrasyonu']
    },
    {
      id: 'offline',
      icon: WifiOff,
      color: 'teal',
      badge: 'Kesintisiz Çalışma',
      title: 'Offline-First (İnternetsiz Satış)',
      description: 'Restoranınızda internet kesilse bile satış durmaz! Masa siparişleri ve tahsilatlar yerel hafızaya kaydedilir; internet geldiğinde buluta otomatik eşitlenir.',
      highlights: ['İnternet kesintisinde 0 duraklama', 'Arka planda otomatik senkronizasyon', 'Çevrimdışı fiş yazdırma', 'Tam veri güvenliği']
    },
    {
      id: 'qr_menu',
      icon: QrCode,
      color: 'purple',
      badge: 'Temassız Teknoloji',
      title: 'Dijital QR Menü & Masadan Sipariş',
      description: 'Misafirleriniz masa üzerindeki QR kodu okutarak fotoğraflı, zengin içerikli ve çok dilli menünüzü incelesin; dilerse garson çağırmadan doğrudan sipariş versin.',
      highlights: ['Uygulama indirme zorunluluğu yok', 'Anında fiyat ve görsel güncelleme', 'Masadan garson çağırma', 'Dinamik kampanya panoları']
    },
    {
      id: 'delivery',
      icon: Bike,
      color: 'red',
      badge: 'Tek Ekranda Paket',
      title: 'Paket Servis & Yemek Platformları',
      description: 'Yemeksepeti, GetirYemek, Trendyol Yemek ve telefon siparişlerini tek bir ekranda toplayın. Otomatik onaylayın, kuryelerinize rota tanımlayın.',
      highlights: ['Pazaryeri sipariş birleştirme', 'Entegre kurye takip ekranı', 'Müşteri adres & telefon rehberi', 'Caller ID arayanı tanıma']
    },
    {
      id: 'inventory',
      icon: Boxes,
      color: 'indigo',
      badge: 'Kuruşu Kuruşuna',
      title: 'Reçeteli Stok & Maliyet Kontrolü',
      description: 'Menüdeki her ürün için gramajlı hammadde reçeteleri tanımlayın. Satış yapıldıkça un, et, içecek otomatik düşsün; kritik stok uyarılarıyla malzeme eksilmesin.',
      highlights: ['Gramaj ve porsiyon bazlı reçeteler', 'Anlık porsiyon maliyet analizi', 'Tedarikçi sipariş & irsaliye takibi', 'Kritik stok erken uyarıları']
    },
    {
      id: 'reports',
      icon: BarChart3,
      color: 'pink',
      badge: 'Patron Cebinde',
      title: 'Canlı Mobil Raporlama & Ciro',
      description: 'Dünyanın neresinde olursanız olun akıllı telefonunuzdan işletmenizin anlık cirosunu, açık masalarını, en çok satan ürünlerini ve personel performansını takip edin.',
      highlights: ['Günlük, haftalık, aylık Z raporları', 'Kârlılık ve ciro grafikleri', 'Garson satış karnesi', 'Özet bildirimler']
    }
  ];

  return (
    <section id="ozellikler" className="py-20 bg-slate-50/70 dark:bg-slate-900/50 relative border-t border-slate-200/60 dark:border-slate-800/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-black tracking-wider uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Kapsamlı Restoran Yönetim Modülleri</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Restoranınız İçin Gereken <span className="text-brand-600 dark:text-emerald-400">Tüm Güçlü Araçlar</span>
          </h2>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-medium">
            Geleneksel, hantal ve pahalı masaüstü sistemlere veda edin. BonCore Bulut POS ile tüm operasyonunuzu modernleştirin, kârlılığınızı ve müşteri memnuniyetinizi artırın.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.id}
                className="group relative bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  {/* Top Badge & Icon */}
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 text-brand-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900 group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {feat.badge}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2 group-hover:text-brand-600 dark:group-hover:text-emerald-400 transition-colors">
                    {feat.title}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium mb-5">
                    {feat.description}
                  </p>
                </div>

                {/* Highlights List */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                  {feat.highlights.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
