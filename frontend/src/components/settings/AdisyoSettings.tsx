import React, { useState, useEffect } from 'react';
import { 
  Settings, Save, CheckCircle2, Percent, DollarSign, 
  Receipt, Plus, Trash2, Edit3, ShieldAlert, Sparkles, Building2, 
  Coins, HelpCircle, Utensils, Tag, CreditCard, Check, X, AlertCircle 
} from 'lucide-react';
import { sound } from '../../services/sound';
import { api } from '../../services/api';
import { PaymentMethodConfig } from '../../types';

export const defaultPaymentMethods: PaymentMethodConfig[] = [
  { id: 'cash', name: 'Nakit Türk Lirası (TRY)', icon: '💵', desc: 'Kasada anlık nakit tahsilat', is_active: true },
  { id: 'credit_card', name: 'Kredi Kartı / Banka Kartı', icon: '💳', desc: 'Fiziki POS ve temassız çekim', is_active: true },
  { id: 'sodexo', name: 'Sodexo Yemek Çeki', icon: '🍱', desc: 'Yemek kartı entegrasyonu', is_active: true },
  { id: 'multinet', name: 'Multinet', icon: '💳', desc: 'Multinet kart ve karekod', is_active: true },
  { id: 'ticket', name: 'Ticket Edenred', icon: '🎫', desc: 'Edenred yemek kartı', is_active: true },
  { id: 'open_account', name: 'Açık Hesap / Veresiye', icon: '📋', desc: 'Cari müşteri borçlandırma', is_active: true }
];

interface DiscountDefinition {
  id: number;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  is_active: boolean;
  requires_auth: boolean;
}

const defaultDiscounts: DiscountDefinition[] = [
  { id: 1, name: '%10 Misafir Sadakat İndirimi', type: 'percent', value: 10, is_active: true, requires_auth: false },
  { id: 2, name: '%15 Personel İndirimi', type: 'percent', value: 15, is_active: true, requires_auth: false },
  { id: 3, name: '%20 VIP Müşteri İndirimi', type: 'percent', value: 20, is_active: true, requires_auth: true },
  { id: 4, name: '%50 Yönetici / İkram İndirimi', type: 'percent', value: 50, is_active: true, requires_auth: true },
  { id: 5, name: '₺50 Sabit İndirim', type: 'fixed', value: 50, is_active: true, requires_auth: false }
];

export const AdisyoSettings: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<string>(() => {
    const saved = localStorage.getItem('boncore_settings_subtab');
    const valid = ['parameters', 'discounts', 'payments', 'currency', 'address'];
    return saved && valid.includes(saved) ? saved : 'parameters';
  });

  useEffect(() => {
    localStorage.setItem('boncore_settings_subtab', activeSubTab);
  }, [activeSubTab]);

  const [savedMessage, setSavedMessage] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // --- 1. Kuver Parametreleri ---
  const [isKuverEnabled, setIsKuverEnabled] = useState<boolean>(true);
  const [kuverPrice, setKuverPrice] = useState<number>(35.00);
  const [kuverTitle, setKuverTitle] = useState<string>('Kuver / Kişi Başı Hizmet');
  const [autoKuverOnTableOpen, setAutoKuverOnTableOpen] = useState<boolean>(true);

  // --- 2. Garsoniye & Servis Ücreti ---
  const [isServiceChargeEnabled, setIsServiceChargeEnabled] = useState<boolean>(false);
  const [serviceChargeRate, setServiceChargeRate] = useState<number>(10.00);
  const [serviceChargeType, setServiceChargeType] = useState<'percent' | 'fixed'>('percent');
  const [serviceChargeTitle, setServiceChargeTitle] = useState<string>('Garsoniye / Servis Bedeli');

  // --- 3. KDV & Vergi Oranları ---
  const [defaultVatRate, setDefaultVatRate] = useState<number>(10);
  const [foodVatRate, setFoodVatRate] = useState<number>(10);
  const [alcoholVatRate, setAlcoholVatRate] = useState<number>(20);
  const [beverageVatRate, setBeverageVatRate] = useState<number>(10);
  const [pricesIncludeVat, setPricesIncludeVat] = useState<boolean>(true);

  // --- 4. İndirimler Listesi ---
  const [discounts, setDiscounts] = useState<DiscountDefinition[]>(defaultDiscounts);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState<boolean>(false);
  const [newDiscName, setNewDiscName] = useState<string>('');
  const [newDiscType, setNewDiscType] = useState<'percent' | 'fixed'>('percent');
  const [newDiscValue, setNewDiscValue] = useState<number>(10);
  const [newDiscAuth, setNewDiscAuth] = useState<boolean>(false);

  // --- 4.5 Ödeme Tipleri ---
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>(defaultPaymentMethods);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [newPayName, setNewPayName] = useState<string>('');
  const [newPayDesc, setNewPayDesc] = useState<string>('');
  const [newPayIcon, setNewPayIcon] = useState<string>('💳');
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  // --- 5. Döviz Kurları ---
  const [usdRate, setUsdRate] = useState<number>(36.50);
  const [eurRate, setEurRate] = useState<number>(38.20);
  const [gbpRate, setGbpRate] = useState<number>(45.80);

  // --- 6. Adres & Firma Bilgileri ---
  const [restaurantName, setRestaurantName] = useState<string>('FATİH ÇİFTLİĞİ RESTORAN');
  const [taxOffice, setTaxOffice] = useState<string>('Kadıköy Vergi Dairesi');
  const [taxNumber, setTaxNumber] = useState<string>('3779901422');
  const [city, setCity] = useState<string>('İstanbul');
  const [district, setDistrict] = useState<string>('Kadıköy');
  const [street, setStreet] = useState<string>('Moda Cad. No:84 D:4');
  const [phone, setPhone] = useState<string>('+90 216 444 37 79');

  // Load settings from backend database on mount
  useEffect(() => {
    loadSettingsFromDb();
  }, []);

  const loadSettingsFromDb = async () => {
    setLoading(true);
    try {
      const data = await api.getSettings();
      if (data) {
        if (data.is_kuver_enabled !== undefined) setIsKuverEnabled(Boolean(data.is_kuver_enabled));
        if (data.kuver_price !== undefined) setKuverPrice(Number(data.kuver_price));
        if (data.kuver_title !== undefined) setKuverTitle(String(data.kuver_title));
        if (data.auto_kuver_on_table_open !== undefined) setAutoKuverOnTableOpen(Boolean(data.auto_kuver_on_table_open));
        
        if (data.is_service_charge_enabled !== undefined) setIsServiceChargeEnabled(Boolean(data.is_service_charge_enabled));
        if (data.service_charge_rate !== undefined) setServiceChargeRate(Number(data.service_charge_rate));
        if (data.service_charge_type !== undefined) setServiceChargeType(data.service_charge_type);
        if (data.service_charge_title !== undefined) setServiceChargeTitle(String(data.service_charge_title));

        if (data.default_vat_rate !== undefined) setDefaultVatRate(Number(data.default_vat_rate));
        if (data.food_vat_rate !== undefined) setFoodVatRate(Number(data.food_vat_rate));
        if (data.alcohol_vat_rate !== undefined) setAlcoholVatRate(Number(data.alcohol_vat_rate));
        if (data.beverage_vat_rate !== undefined) setBeverageVatRate(Number(data.beverage_vat_rate));
        if (data.prices_include_vat !== undefined) setPricesIncludeVat(Boolean(data.prices_include_vat));

        if (data.discounts && Array.isArray(data.discounts)) setDiscounts(data.discounts);
        
        if (data.payment_methods && Array.isArray(data.payment_methods) && data.payment_methods.length > 0) {
          setPaymentMethods(data.payment_methods);
          localStorage.setItem('boncore_payment_methods', JSON.stringify(data.payment_methods));
        } else {
          const cachedPayments = localStorage.getItem('boncore_payment_methods');
          if (cachedPayments) {
            try {
              setPaymentMethods(JSON.parse(cachedPayments));
            } catch (e) {
              console.warn('Failed to parse cached payment methods', e);
            }
          }
        }
        
        if (data.usd_rate !== undefined) setUsdRate(Number(data.usd_rate));
        if (data.eur_rate !== undefined) setEurRate(Number(data.eur_rate));
        if (data.gbp_rate !== undefined) setGbpRate(Number(data.gbp_rate));

        if (data.restaurant_name !== undefined) setRestaurantName(String(data.restaurant_name));
        if (data.tax_office !== undefined) setTaxOffice(String(data.tax_office));
        if (data.tax_number !== undefined) setTaxNumber(String(data.tax_number));
        if (data.city !== undefined) setCity(String(data.city));
        if (data.district !== undefined) setDistrict(String(data.district));
        if (data.street !== undefined) setStreet(String(data.street));
        if (data.phone !== undefined) setPhone(String(data.phone));
      }
    } catch (err) {
      console.warn('Backend settings fetch error, loading from local cache:', err);
      // Fallback to localStorage
      const cachedKuver = localStorage.getItem('boncore_kuver_enabled');
      if (cachedKuver !== null) setIsKuverEnabled(cachedKuver === 'true');
      const cachedKuverPrice = localStorage.getItem('boncore_kuver_price');
      if (cachedKuverPrice) setKuverPrice(Number(cachedKuverPrice));
      const cachedServiceRate = localStorage.getItem('boncore_service_rate');
      if (cachedServiceRate) setServiceChargeRate(Number(cachedServiceRate));
      const cachedDiscounts = localStorage.getItem('boncore_discounts');
      if (cachedDiscounts) setDiscounts(JSON.parse(cachedDiscounts));
      const cachedPayments = localStorage.getItem('boncore_payment_methods');
      if (cachedPayments) {
        try {
          setPaymentMethods(JSON.parse(cachedPayments));
        } catch (e) {
          console.warn('Failed to parse cached payment methods', e);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePaymentMethod = async (id: string) => {
    sound.beep();
    const target = paymentMethods.find(m => m.id === id);
    const newStatus = !target?.is_active;
    const updated = paymentMethods.map(m => m.id === id ? { ...m, is_active: newStatus } : m);
    setPaymentMethods(updated);
    localStorage.setItem('boncore_payment_methods', JSON.stringify(updated));

    setPaymentNotice(`"${target?.name}" ${newStatus ? 'aktif edildi' : 'kapatıldı (pasif)'}.`);
    setTimeout(() => setPaymentNotice(null), 3000);

    // Instantly persist to backend database
    try {
      await api.updateSettings({ payment_methods: updated });
    } catch (err) {
      console.warn('Could not auto-save payment method toggle:', err);
    }
  };

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayName.trim()) return;
    sound.beep();
    const newMethod: PaymentMethodConfig = {
      id: `custom_${Date.now()}`,
      name: newPayName.trim(),
      icon: newPayIcon || '💳',
      desc: newPayDesc.trim() || 'Özel tanımlı ödeme yöntemi',
      is_active: true
    };
    const updated = [...paymentMethods, newMethod];
    setPaymentMethods(updated);
    localStorage.setItem('boncore_payment_methods', JSON.stringify(updated));
    setNewPayName('');
    setNewPayDesc('');
    setIsPaymentModalOpen(false);

    setPaymentNotice(`"${newMethod.name}" başarıyla eklendi ve aktif edildi.`);
    setTimeout(() => setPaymentNotice(null), 3000);

    try {
      await api.updateSettings({ payment_methods: updated });
    } catch (err) {
      console.warn('Could not auto-save new payment method:', err);
    }
  };

  const handleDeleteCustomPaymentMethod = async (id: string) => {
    sound.beep();
    const target = paymentMethods.find(m => m.id === id);
    const updated = paymentMethods.filter(m => m.id !== id);
    setPaymentMethods(updated);
    localStorage.setItem('boncore_payment_methods', JSON.stringify(updated));

    setPaymentNotice(`"${target?.name}" silindi.`);
    setTimeout(() => setPaymentNotice(null), 3000);

    try {
      await api.updateSettings({ payment_methods: updated });
    } catch (err) {
      console.warn('Could not auto-save deleted payment method:', err);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    sound.beep();

    const payload = {
      is_kuver_enabled: isKuverEnabled,
      kuver_price: kuverPrice,
      kuver_title: kuverTitle,
      auto_kuver_on_table_open: autoKuverOnTableOpen,
      is_service_charge_enabled: isServiceChargeEnabled,
      service_charge_rate: serviceChargeRate,
      service_charge_type: serviceChargeType,
      service_charge_title: serviceChargeTitle,
      default_vat_rate: defaultVatRate,
      food_vat_rate: foodVatRate,
      alcohol_vat_rate: alcoholVatRate,
      beverage_vat_rate: beverageVatRate,
      prices_include_vat: pricesIncludeVat,
      discounts: discounts,
      payment_methods: paymentMethods,
      usd_rate: usdRate,
      eur_rate: eurRate,
      gbp_rate: gbpRate,
      restaurant_name: restaurantName,
      tax_office: taxOffice,
      tax_number: taxNumber,
      city: city,
      district: district,
      street: street,
      phone: phone
    };

    // Save to LocalStorage immediately for instant sync
    localStorage.setItem('boncore_kuver_enabled', isKuverEnabled.toString());
    localStorage.setItem('boncore_kuver_price', kuverPrice.toString());
    localStorage.setItem('boncore_service_enabled', isServiceChargeEnabled.toString());
    localStorage.setItem('boncore_service_rate', serviceChargeRate.toString());
    localStorage.setItem('boncore_discounts', JSON.stringify(discounts));
    localStorage.setItem('boncore_payment_methods', JSON.stringify(paymentMethods));

    // Save to SQLite Database
    try {
      await api.updateSettings(payload);
    } catch (err) {
      console.warn('Settings database update failed:', err);
    }

    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 3000);
  };

  const handleAddDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiscName.trim()) return;
    sound.beep();
    const newDisc: DiscountDefinition = {
      id: Date.now(),
      name: newDiscName,
      type: newDiscType,
      value: Number(newDiscValue),
      is_active: true,
      requires_auth: newDiscAuth
    };
    const updated = [...discounts, newDisc];
    setDiscounts(updated);
    localStorage.setItem('boncore_discounts', JSON.stringify(updated));
    setNewDiscName('');
    setIsDiscountModalOpen(false);
  };

  const handleDeleteDiscount = (id: number) => {
    sound.beep();
    const updated = discounts.filter(d => d.id !== id);
    setDiscounts(updated);
    localStorage.setItem('boncore_discounts', JSON.stringify(updated));
  };

  const tabs = [
    { id: 'parameters', label: 'Kuver, Garsoniye & KDV' },
    { id: 'discounts', label: 'İndirim & İkram Tanımları' },
    { id: 'payments', label: 'Ödeme Tipleri' },
    { id: 'currency', label: 'Döviz Ayarları' },
    { id: 'address', label: 'Adres & Şirket Bilgileri' }
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 select-none animate-fadeIn font-sans transition-colors duration-200">
      <div className="max-w-5xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Restaurant Tanımlamaları</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Kuver, garsoniye, KDV oranları, indirimler ve şirket ayarlarınızı buradan yapılandırın.</p>
            </div>
          </div>

          <button
            onClick={() => handleSave()}
            className="px-5 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-extrabold text-xs shadow-md transition flex items-center gap-2 active:scale-95 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Güncelle</span>
          </button>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { sound.beep(); setActiveSubTab(tab.id); }}
              className={`py-3.5 text-xs font-bold whitespace-nowrap transition border-b-2 cursor-pointer ${
                activeSubTab === tab.id
                  ? 'border-red-600 text-red-600 font-black'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="p-6 md:p-8">
          {savedMessage && (
            <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Tanımlamalar başarıyla veritabanına kaydedildi ve tüm POS terminallerine uygulandı.</span>
            </div>
          )}

          {/* TAB 1: Kuver, Garsoniye & KDV Parametreleri */}
          {activeSubTab === 'parameters' && (
            <div className="space-y-8 text-xs">
              {/* 1. Kuver Ayarları Kartı */}
              <div className="p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Kuver / Kişi Başı Ücret Ayarları</h3>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isKuverEnabled} 
                      onChange={(e) => {
                        sound.beep();
                        setIsKuverEnabled(e.target.checked);
                      }} 
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-semibold">
                  <div>
                    <label className="text-slate-500 block mb-1">Kişi Başı Sabit Kuver Tutarı (₺):</label>
                    <input
                      type="number"
                      step="0.5"
                      value={kuverPrice}
                      onChange={(e) => setKuverPrice(Number(e.target.value))}
                      disabled={!isKuverEnabled}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white font-bold disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1">Adisyonda Gözükecek Kuver Başlığı:</label>
                    <input
                      type="text"
                      value={kuverTitle}
                      onChange={(e) => setKuverTitle(e.target.value)}
                      disabled={!isKuverEnabled}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white disabled:opacity-50"
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                      <input
                        type="checkbox"
                        checked={autoKuverOnTableOpen}
                        onChange={(e) => setAutoKuverOnTableOpen(e.target.checked)}
                        disabled={!isKuverEnabled}
                        className="w-4 h-4 rounded text-red-600 accent-red-600"
                      />
                      <span className="text-[11px] text-slate-700 dark:text-slate-300 font-bold">
                        Masa açıldığında kişi sayısına göre otomatik ekle
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 2. Garsoniye & Servis Ücreti Kartı */}
              <div className="p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
                  <div className="flex items-center gap-2">
                    <Percent className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Garsoniye / Servis Bedeli</h3>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isServiceChargeEnabled} 
                      onChange={(e) => {
                        sound.beep();
                        setIsServiceChargeEnabled(e.target.checked);
                      }} 
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-semibold">
                  <div>
                    <label className="text-slate-500 block mb-1">Garsoniye Oranı (%):</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="30"
                      value={serviceChargeRate}
                      onChange={(e) => setServiceChargeRate(Number(e.target.value))}
                      disabled={!isServiceChargeEnabled}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white font-bold disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1">Garsoniye Türü:</label>
                    <select
                      value={serviceChargeType}
                      onChange={(e) => setServiceChargeType(e.target.value as any)}
                      disabled={!isServiceChargeEnabled}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white disabled:opacity-50"
                    >
                      <option value="percent">Yüzdesel (%) - Toplam Sipariş Tutarı Üzerinden</option>
                      <option value="fixed">Sabit Tutar (₺) - Adisyon Başı</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1">Adisyon Başlığı:</label>
                    <input
                      type="text"
                      value={serviceChargeTitle}
                      onChange={(e) => setServiceChargeTitle(e.target.value)}
                      disabled={!isServiceChargeEnabled}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              {/* 3. KDV & Vergi Oranları Kartı */}
              <div className="p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
                  <Receipt className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">KDV (Katma Değer Vergisi) Oranları</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 font-semibold">
                  <div>
                    <label className="text-slate-500 block mb-1">Yeme-İçme / Gıda KDV (%):</label>
                    <select
                      value={foodVatRate}
                      onChange={(e) => setFoodVatRate(Number(e.target.value))}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-mono font-bold"
                    >
                      <option value="1">%1 (Temel Gıda)</option>
                      <option value="10">%10 (Restoran Servis & Lokanta)</option>
                      <option value="20">%20 (Genel Oran)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1">Alkollü İçecek KDV (%):</label>
                    <select
                      value={alcoholVatRate}
                      onChange={(e) => setAlcoholVatRate(Number(e.target.value))}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-mono font-bold"
                    >
                      <option value="20">%20 (Standart Alkol KDV)</option>
                      <option value="10">%10</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1">Meşrubat & İçecek KDV (%):</label>
                    <select
                      value={beverageVatRate}
                      onChange={(e) => setBeverageVatRate(Number(e.target.value))}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-mono font-bold"
                    >
                      <option value="10">%10 (Alkolsüz İçecekler)</option>
                      <option value="20">%20</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1">Fiyatlandırma Türü:</label>
                    <select
                      value={pricesIncludeVat ? 'inclusive' : 'exclusive'}
                      onChange={(e) => setPricesIncludeVat(e.target.value === 'inclusive')}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold"
                    >
                      <option value="inclusive">Fiyatlara KDV Dahildir</option>
                      <option value="exclusive">Fiyatlara KDV Hariçtir (+KDV)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: İndirim & İkram Tanımları */}
          {activeSubTab === 'discounts' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Tanımlı İndirim Butonları</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">POS terminalinde ve ödeme ekranında tek tıkla uygulanacak indirim şablonları.</p>
                </div>

                <button
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Yeni İndirim Tanımla</span>
                </button>
              </div>

              {/* Discounts Table */}
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="grid grid-cols-12 p-3.5 bg-slate-100 dark:bg-slate-800 text-xs font-black text-slate-700 dark:text-slate-300 uppercase">
                  <div className="col-span-5">İndirim Adı</div>
                  <div className="col-span-3 text-center">İndirim Miktarı</div>
                  <div className="col-span-2 text-center">Yetki Durumu</div>
                  <div className="col-span-2 text-right">İşlem</div>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs font-semibold">
                  {discounts.map((disc) => (
                    <div key={disc.id} className="grid grid-cols-12 p-3.5 items-center hover:bg-white dark:hover:bg-slate-800/60 transition">
                      <div className="col-span-5 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Tag className="w-4 h-4 text-red-600" />
                        <span>{disc.name}</span>
                      </div>

                      <div className="col-span-3 text-center font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                        {disc.type === 'percent' ? `%${disc.value}` : `₺${disc.value.toFixed(2)}`}
                      </div>

                      <div className="col-span-2 text-center">
                        {disc.requires_auth ? (
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 text-[10px] font-bold">
                            Müdür PIN Gerekli
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px] font-bold">
                            Serbest
                          </span>
                        )}
                      </div>

                      <div className="col-span-2 flex justify-end">
                        <button
                          onClick={() => handleDeleteDiscount(disc.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Ödeme Tipleri */}
          {activeSubTab === 'payments' && (
            <div className="space-y-5">
              {/* Notification Banner */}
              {paymentNotice && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-xs font-bold animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{paymentNotice}</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Veritabanına kaydedildi ✓</span>
                </div>
              )}

              {/* Sub Header & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Aktif Ödeme Yöntemleri & Tanımları</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Kasada ve adisyon tahsilat modalında sunulacak ödeme araçlarını yönetin. Kapalı yöntemler kasada otomatik gizlenir.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-black">
                      {paymentMethods.filter(p => p.is_active).length} Aktif
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">/</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {paymentMethods.filter(p => !p.is_active).length} Kapalı
                    </span>
                  </div>

                  <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Yeni Ödeme Tipi</span>
                  </button>
                </div>
              </div>

              {/* Payment Methods Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {paymentMethods.map((pay) => {
                  const isActive = pay.is_active;
                  const isCustom = pay.id.startsWith('custom_');

                  return (
                    <div
                      key={pay.id}
                      onClick={() => handleTogglePaymentMethod(pay.id)}
                      className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between select-none ${
                        isActive
                          ? 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 shadow-sm hover:border-emerald-500/60 dark:hover:border-emerald-500/50 hover:shadow-md'
                          : 'bg-slate-100/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/80 opacity-70 hover:opacity-90'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className={`text-2xl p-2 rounded-xl transition ${
                            isActive 
                              ? 'bg-slate-100 dark:bg-slate-700/60 shadow-sm' 
                              : 'bg-slate-200/60 dark:bg-slate-800/50 grayscale'
                          }`}>
                            {pay.icon}
                          </span>
                          <div>
                            <div className={`font-black text-xs transition ${
                              isActive ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 line-through decoration-slate-400'
                            }`}>
                              {pay.name}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">
                              {pay.desc}
                            </div>
                          </div>
                        </div>

                        {/* Custom Method Delete Button */}
                        {isCustom && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCustomPaymentMethod(pay.id);
                            }}
                            className="p-1 text-slate-400 hover:text-red-500 rounded-lg transition"
                            title="Bu ödeme tipini sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Footer: Status Badge & iOS Toggle Switch */}
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                        <div>
                          {isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              AKTİF
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              KAPALI (PASİF)
                            </span>
                          )}
                        </div>

                        {/* iOS-Style Toggle Switch */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400">
                            {isActive ? 'Açık' : 'Kapalı'}
                          </span>
                          <button
                            type="button"
                            aria-label={`${pay.name} durumunu değiştir`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTogglePaymentMethod(pay.id);
                            }}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              isActive ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                isActive ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Notice info */}
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <div className="font-extrabold text-[11px]">Ödeme Tipleri Canlı Eşitleme Bilgisi:</div>
                  <div className="text-[11px] text-amber-800 dark:text-amber-400 font-medium">
                    Burada yaptığınız her açma/kapama değişikliği anında veritabanına ve kasadaki <strong>Tahsilat & Ödeme</strong> ekranına yansıtılır. Kapattığınız yöntemler kasiyer ve garsonların önünde seçenek olarak sunulmaz.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Döviz Ayarları */}
          {activeSubTab === 'currency' && (
            <div className="space-y-6 text-xs">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Döviz Kurları ve Yabancı Para Tahsilatı</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-semibold">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between font-bold">
                    <span>USD ($) Dolar Kuru:</span>
                    <span className="text-blue-600">Alış / Satış</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={usdRate}
                    onChange={(e) => setUsdRate(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-base font-black text-slate-900 dark:text-white"
                  />
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between font-bold">
                    <span>EUR (€) Euro Kuru:</span>
                    <span className="text-emerald-600">Alış / Satış</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={eurRate}
                    onChange={(e) => setEurRate(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-base font-black text-slate-900 dark:text-white"
                  />
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between font-bold">
                    <span>GBP (£) Sterlin Kuru:</span>
                    <span className="text-purple-600">Alış / Satış</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={gbpRate}
                    onChange={(e) => setGbpRate(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-base font-black text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Adres & Şirket Bilgileri */}
          {activeSubTab === 'address' && (
            <div className="space-y-6 text-xs font-semibold">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-slate-500 block mb-1">Restoran / Firma Adı:</label>
                  <input
                    type="text"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Vergi Dairesi:</label>
                  <input
                    type="text"
                    value={taxOffice}
                    onChange={(e) => setTaxOffice(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Vergi Kimlik No / TCKN:</label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-slate-500 block mb-1">İl:</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">İlçe:</label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">İletişim Telefonu:</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Açık Adres (Fişte Basılacak Metin):</label>
                <textarea
                  rows={3}
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Yeni İndirim Tanımla */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <h3 className="text-base font-black">Yeni İndirim Şablonu Ekle</h3>
            <form onSubmit={handleAddDiscount} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1">İndirim Adı:</label>
                <input
                  type="text"
                  value={newDiscName}
                  onChange={(e) => setNewDiscName(e.target.value)}
                  placeholder="Örn: %25 Akşam Menüsü İndirimi"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 block mb-1">Tür:</label>
                  <select
                    value={newDiscType}
                    onChange={(e) => setNewDiscType(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="percent">Yüzdesel (%)</option>
                    <option value="fixed">Sabit Tutar (₺)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Miktar:</label>
                  <input
                    type="number"
                    value={newDiscValue}
                    onChange={(e) => setNewDiscValue(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="authCheck"
                  checked={newDiscAuth}
                  onChange={(e) => setNewDiscAuth(e.target.checked)}
                  className="w-4 h-4 rounded text-red-600 accent-red-600 cursor-pointer"
                />
                <label htmlFor="authCheck" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  Uygularken Müdür PIN onayı gereksin
                </label>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black shadow cursor-pointer"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Yeni Ödeme Tipi Ekle */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">Yeni Ödeme Yöntemi Ekle</h3>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddPaymentMethod} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1">Ödeme Yöntemi Adı:</label>
                <input
                  type="text"
                  value={newPayName}
                  onChange={(e) => setNewPayName(e.target.value)}
                  placeholder="Örn: Metropol Yemek Kartı"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Kısa Açıklama:</label>
                <input
                  type="text"
                  value={newPayDesc}
                  onChange={(e) => setNewPayDesc(e.target.value)}
                  placeholder="Örn: Metropol kart ve QR ile ödeme"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Simge / İkon Seçiniz:</label>
                <div className="grid grid-cols-6 gap-2">
                  {['💳', '💵', '🍱', '🎫', '📋', '📱', '🏦', '🪙', '⭐', '🏷️', '⚡', '🧾'].map((iconEmoji) => (
                    <button
                      key={iconEmoji}
                      type="button"
                      onClick={() => setNewPayIcon(iconEmoji)}
                      className={`h-10 text-xl rounded-xl border flex items-center justify-center transition cursor-pointer ${
                        newPayIcon === iconEmoji
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 scale-105 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {iconEmoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-md cursor-pointer"
                >
                  Ekle & Aktif Et
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
