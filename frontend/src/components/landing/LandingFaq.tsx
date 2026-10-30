import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { sound } from '../../services/sound';

export const LandingFaq: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: 'İnternetim kesilirse restoranda satış yapmaya devam edebilir miyim?',
      a: 'Kesinlikle evet! BonCore, özel "Offline-First" mimarisiyle geliştirilmiştir. İnternetiniz kopsa dahi masa açabilir, sipariş girebilir, mutfağa fiş gönderebilir ve tahsilat alabilirsiniz. İnternet bağlantınız geri geldiğinde tüm veriler arka planda otomatik olarak buluta senkronize edilir.'
    },
    {
      q: 'Mevcut donanımlarımı (tablet, bilgisayar, yazıcı) kullanabilir miyim?',
      a: 'Evet! BonCore donanım bağımsızdır. Elinizde bulunan herhangi bir iPad, Android tablet, dokunmatik Windows bilgisayar veya standart 80mm/58mm termal fiş yazıcılarıyla anında çalışır. Pahalı özel donanımlar satın almanıza gerek yoktur.'
    },
    {
      q: 'Resmi GİB E-Adisyon ve E-Fatura geçiş süreci ne kadar sürer?',
      a: 'E-Adisyon kurulumunuz aynı gün içerisinde uzman teknik ekibimiz tarafından tamamlanır. Mali mühür veya e-İmzanızla sistem entegre edilir, Gelir İdaresi Başkanlığı mevzuatına tam uyumlu QR kodlu ve ETTN numaralı fişleriniz hemen üretilmeye başlar.'
    },
    {
      q: 'Eski menümü ve ürünlerimi BonCore’a nasıl aktarabilirim?',
      a: 'Mevcut menünüzü Excel formatında tek tıkla içeri aktarabilirsiniz. Ayrıca kurulum aşamasında destek ekibimiz menünüzü, kategorilerinizi ve varyantlarınızı sizin için ücretsiz olarak sisteme yükler.'
    },
    {
      q: '14 günlük ücretsiz denemede kredi kartı bilgisi gerekiyor mu?',
      a: 'Hayır, deneme süresini başlatmak için herhangi bir kredi kartı bilgisi talep edilmez. Sistemi 14 gün boyunca tüm özellikleriyle sınırsız test edebilirsiniz. Memnun kalırsanız dilediğiniz paketi seçerek devam edebilirsiniz.'
    },
    {
      q: 'Gece saatlerinde veya hafta sonu teknik destek alabilir miyim?',
      a: 'Evet! Restoran sektörünün gece ve hafta sonları en yoğun saatlerini yaşadığının farkındayız. 7/24 kesintisiz telefon ve WhatsApp destek hattımızla acil durumlarda anında yanınızdayız.'
    }
  ];

  const handleToggle = (idx: number) => {
    sound.beep();
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="sss" className="py-20 bg-white dark:bg-slate-950 relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center space-y-4 mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-black tracking-wider uppercase">
            <HelpCircle className="w-3.5 h-3.5 text-brand-600 dark:text-emerald-400" />
            <span>Merak Edilenler</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Sıkça Sorulan <span className="text-brand-600 dark:text-emerald-400">Sorular</span>
          </h2>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-medium">
            BonCore Bulut POS hakkında aklınıza takılan tüm soruların yanıtları.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-3.5">
          {faqs.map((f, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 overflow-hidden transition-all duration-200"
              >
                <button
                  type="button"
                  onClick={() => handleToggle(idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-850/50 transition select-none"
                >
                  <span className="text-sm font-black text-slate-900 dark:text-white">
                    {f.q}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-500 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-brand-600 dark:text-emerald-400' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium border-t border-slate-100 dark:border-slate-800/60">
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
