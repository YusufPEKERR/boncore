import React, { useState } from 'react';
import { X, Sparkles, CheckCircle2, Phone, Building2, User, MapPin, ArrowRight } from 'lucide-react';
import { sound } from '../../services/sound';

interface DemoRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchDemo?: () => void;
}

export const DemoRequestModal: React.FC<DemoRequestModalProps> = ({
  isOpen,
  onClose,
  onLaunchDemo
}) => {
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [businessType, setBusinessType] = useState<string>('restoran');
  const [city, setCity] = useState<string>('İstanbul');
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !companyName.trim()) {
      sound.warning();
      setFormError('Lütfen ad soyad, telefon ve işletme adını doldurunuz.');
      return;
    }
    setFormError('');

    sound.cashDrawer();
    setLoading(true);

    try {
      await fetch('/api/master/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          company_name: companyName.trim(),
          business_type: businessType,
          city: city.trim(),
          notes: 'Web sitesi 14 gün ücretsiz deneme talebi'
        })
      });
    } catch (err) {
      console.warn('Backend lead post warning:', err);
    }

    // Also persist in local storage
    try {
      const existingLeads = JSON.parse(localStorage.getItem('boncore_demo_leads') || '[]');
      existingLeads.unshift({
        fullName,
        phone,
        companyName,
        businessType,
        city,
        createdAt: new Date().toISOString()
      });
      localStorage.setItem('boncore_demo_leads', JSON.stringify(existingLeads));
    } catch {}

    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        
        {/* Close Button */}
        <button
          type="button"
          aria-label="Kapat"
          onClick={() => { sound.beep(); onClose(); }}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                Talebiniz Alındı! 🎉
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium mt-2 leading-relaxed">
                Sayın <b>{fullName}</b>, <b>{companyName}</b> için 14 günlük ücretsiz deneme hesabınız hazırlanıyor. Müşteri temsilcimiz <b>{phone}</b> numarasından sizinle kısa süre içinde iletişime geçecektir.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-left space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">İşletme Türü:</span>
                <span className="font-bold uppercase text-slate-900 dark:text-white">{businessType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Şehir:</span>
                <span className="font-bold text-slate-900 dark:text-white">{city}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Deneme Süresi:</span>
                <span className="font-bold text-emerald-600">14 Gün Ücretsiz (Sınırsız)</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
              {onLaunchDemo && (
                <button
                  onClick={() => { sound.beep(); onClose(); onLaunchDemo(); }}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <span>Canlı Demoya Giriş Yap</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => { sound.beep(); onClose(); }}
                className="py-3 px-5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Kapat
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-black tracking-wider uppercase mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>14 Gün Ücretsiz Deneme</span>
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                Restoranınızı BonCore ile Büyütün
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Kredi kartı gerekmez. Bilgilerinizi girin, sisteminizi hemen oluşturalım.
              </p>
            </div>

            <div className="space-y-3">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-bold">
                  {formError}
                </div>
              )}
              <div>
                <label htmlFor="demo-fullname" className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Adınız ve Soyadınız *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="demo-fullname"
                    name="fullName"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setFormError(''); }}
                    placeholder="Örn: Ahmet Yılmaz"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="demo-phone" className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Telefon Numaranız *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="demo-phone"
                    name="phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setFormError(''); }}
                    placeholder="0532 000 00 00"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="demo-company" className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  İşletmenizin Adı *
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="demo-company"
                    name="companyName"
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => { setCompanyName(e.target.value); setFormError(''); }}
                    placeholder="Örn: Moda Lezzet Restoranı"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="demo-business-type" className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    İşletme Türü
                  </label>
                  <select
                    id="demo-business-type"
                    name="businessType"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="restoran">Restoran & Lokanta</option>
                    <option value="kafe">Kafe & Coffee Shop</option>
                    <option value="fastfood">Fast Food & Büfe</option>
                    <option value="paket">Paket Servis / Paketçi</option>
                    <option value="bar">Bar & Gece Kulübü</option>
                    <option value="otel">Otel & Beach Club</option>
                    <option value="pastane">Pastane & Fırın</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="demo-city" className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Şehir
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="demo-city"
                      name="city"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="İstanbul"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-brand-600 via-emerald-600 to-teal-600 hover:from-brand-700 hover:to-teal-700 text-white font-black text-xs shadow-lg shadow-emerald-600/25 transition cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Oluşturuluyor...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>14 Gün Ücretsiz Başla</span>
                </>
              )}
            </button>
          </form>
        )}

      </div>
    </div>
  );
};
