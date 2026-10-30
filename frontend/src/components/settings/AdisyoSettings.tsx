import React, { useState, useEffect } from 'react';
import { 
  Settings, Save, CheckCircle2, Percent, DollarSign, 
  Receipt, Plus, Trash2, Edit3, ShieldAlert, Sparkles, Building2, 
  Coins, HelpCircle, Utensils, Tag, CreditCard, Check, X, AlertCircle, 
  Scale, RefreshCw, Wifi, WifiOff, Activity, Laptop, Download, Monitor, Star, CheckSquare, Printer,
  Smartphone, Upload, Zap
} from 'lucide-react';
import { sound } from '../../services/sound';
import { api } from '../../services/api';
import { localHardware } from '../../services/localHardware';
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
  { id: 1, name: '%10 Sadakat İndirimi', type: 'percent', value: 10, is_active: true, requires_auth: false },
  { id: 2, name: '%15 Personel İndirimi', type: 'percent', value: 15, is_active: true, requires_auth: false },
  { id: 3, name: '%20 VIP Müşteri İndirimi', type: 'percent', value: 20, is_active: true, requires_auth: true },
  { id: 4, name: '%50 Yönetici / İkram İndirimi', type: 'percent', value: 50, is_active: true, requires_auth: true },
  { id: 5, name: '₺50 Sabit İndirim', type: 'fixed', value: 50, is_active: true, requires_auth: false }
];

interface AdisyoSettingsProps {
  onSettingsUpdated?: (restaurantName: string) => void;
}

export const AdisyoSettings: React.FC<AdisyoSettingsProps> = ({ onSettingsUpdated }) => {
  const [activeSubTab, setActiveSubTab] = useState<string>(() => {
    const saved = localStorage.getItem('boncore_settings_subtab');
    const valid = ['parameters', 'discounts', 'payments', 'currency', 'address', 'scale', 'mobile_apk'];
    return saved && valid.includes(saved) ? saved : 'parameters';
  });

  const [appInfo, setAppInfo] = useState<{
    version_name: string;
    version_code: number;
    release_date: string;
    is_apk_available: boolean;
    file_size_mb: number;
    changelog: string[];
  } | null>(null);
  const [apkUploading, setApkUploading] = useState<boolean>(false);
  const [apkMessage, setApkMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [newApkVersion, setNewApkVersion] = useState<string>('1.0.1');
  const [newApkCode, setNewApkCode] = useState<number>(2);
  const [newApkChangelog, setNewApkChangelog] = useState<string>('');

  useEffect(() => {
    localStorage.setItem('boncore_settings_subtab', activeSubTab);
  }, [activeSubTab]);

  const [savedMessage, setSavedMessage] = useState<boolean>(false);

  // --- CAS CL-3000 Ethernet Terazi Durumu ---
  const [scaleConfig, setScaleConfig] = useState<{
    enabled: boolean;
    model: string;
    connection_type: string;
    ip_address: string;
    port: number;
    timeout: number;
    
  }>({
    enabled: true,
    model: 'CAS CL-3000',
    connection_type: 'ethernet',
    ip_address: '192.168.1.150',
    port: 2004,
    timeout: 2.5,
    
  });
  const [agentInfo, setAgentInfo] = useState<{ isOnline: boolean; version?: string; localIp?: string }>({ isOnline: false });
  // Çoklu Kasa & Terminal Yönetimi
  const [terminalsList, setTerminalsList] = useState<Array<{
    id: string;
    name: string;
    local_ip: string;
    version: string;
    is_online: boolean;
    last_seen_seconds_ago: number;
    scale_connected: boolean;
    scale_ip: string;
    scale_port: number;
    last_weight: number;
    printers: string[];
    is_default: boolean;
  }>>([]);
  const [newTerminalName, setNewTerminalName] = useState<string>('Kasa 2 - Paket Servis');
  const [editingTerminalId, setEditingTerminalId] = useState<string | null>(null);
  const [editingTerminalName, setEditingTerminalName] = useState<string>('');
  const [editingScaleIp, setEditingScaleIp] = useState<string>('');
  const [editingScalePort, setEditingScalePort] = useState<number>(2004);
  const [scaleTesting, setScaleTesting] = useState<boolean>(false);
  const [scaleTestResult, setScaleTestResult] = useState<{ success: boolean; message?: string; error?: string; latency_ms?: number } | null>(null);
  const [scaleWeightReading, setScaleWeightReading] = useState<boolean>(false);
  const [scaleLiveWeight, setScaleLiveWeight] = useState<{ weight: number; is_stable?: boolean; raw?: string; simulated?: boolean; message?: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedPrinters, setSelectedPrinters] = useState<string[]>(() => localHardware.getSelectedPrinters());
  const [printerTestStatus, setPrinterTestStatus] = useState<{ loading: boolean; message?: string; success?: boolean } | null>(null);
  const [customPrinterInput, setCustomPrinterInput] = useState<string>('');
  const [printerSearchQuery, setPrinterSearchQuery] = useState<string>('');
  const [showVirtualPrinters, setShowVirtualPrinters] = useState<boolean>(true);

  const isVirtualPrinter = (pName: string) => {
    const low = (pName || '').toLowerCase();
    return ['microsoft print to pdf', 'microsoft xps', 'onenote', 'fax', 'anydesk printer', 'send to onenote'].some(k => low.includes(k));
  };

  const handleTogglePrinter = (qualifiedKey: string, plainName?: string) => {
    sound.beep();
    setSelectedPrinters(prev => {
      const hasQualified = prev.includes(qualifiedKey);
      const hasPlain = plainName ? prev.includes(plainName) : false;
      let updated: string[];
      if (hasQualified || hasPlain) {
        updated = prev.filter(p => p !== qualifiedKey && p !== plainName);
      } else {
        updated = [...prev, qualifiedKey];
      }
      localHardware.setSelectedPrinters(updated);
      return updated;
    });
  };

  const handleSingleTestPrint = async (qualifiedKey: string, displayName: string, localIp: string) => {
    sound.beep();
    setPrinterTestStatus({ loading: true, message: `${displayName} (${localIp}) yazıcısına test fişi gönderiliyor...`, success: true });
    try {
      const res = await localHardware.printReceipt({
        printers: [qualifiedKey],
        rawText:
          '================================\n' +
          '        BONCORE POS TEST        \n' +
          '================================\n' +
          'Tarih: ' + new Date().toLocaleDateString('tr-TR') + ' ' + new Date().toLocaleTimeString('tr-TR') + '\n' +
          'Kasa IP: ' + localIp + '\n' +
          'Yazici:  ' + displayName + '\n' +
          '--------------------------------\n' +
          'Yazici Testi Basarili!\n' +
          '================================\n\n\n\n'
      });
      if (res.success) {
        setPrinterTestStatus({ loading: false, success: true, message: res.message || `${displayName} (${localIp}) yazıcısından test fişi başarıyla çıktı!` });
      } else {
        setPrinterTestStatus({ loading: false, success: false, message: res.error || 'Yazdırma isteği tamamlanamadı.' });
      }
    } catch (e: any) {
      setPrinterTestStatus({ loading: false, success: false, message: e.message || 'Hata oluştu' });
    }
  };

  const handleTestPrint = async () => {
    if (selectedPrinters.length === 0) {
      alert('Lütfen en az bir yazıcı seçin.');
      return;
    }
    sound.beep();
    setPrinterTestStatus({ loading: true });
    try {
      const res = await localHardware.printReceipt({
        printers: selectedPrinters,
        rawText: '================================\n        BONCORE POS TEST        \n================================\nTarih: ' + new Date().toLocaleDateString('tr-TR') + ' ' + new Date().toLocaleTimeString('tr-TR') + '\nYazici Testi Basarili!\n\nSecili Yazicilar:\n' + selectedPrinters.map(p => ' - ' + p.replace('::', ' @ ')).join('\n') + '\n================================\n\n\n\n'
      });
      if (res.success) {
        setPrinterTestStatus({ loading: false, success: true, message: res.message || 'Seçili yazıcılara test fişi başarıyla gönderildi!' });
      } else {
        setPrinterTestStatus({ loading: false, success: false, message: res.error || 'Yazdırma isteği tamamlanamadı.' });
      }
    } catch (e: any) {
      setPrinterTestStatus({ loading: false, success: false, message: e.message || 'Hata oluştu' });
    }
  };

  // Terazi ve çoklu kasaları periyodik olarak güncelle
  const fetchTerminalsData = async () => {
    try {
      const res = await localHardware.getTerminals();
      if (res?.terminals) setTerminalsList(res.terminals);
    } catch (e) {
      console.warn('Terminals fetch error:', e);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'scale') {
      localHardware.checkAgentStatus().then(setAgentInfo);
      fetchTerminalsData();
      const interval = setInterval(() => {
        localHardware.checkAgentStatus().then(setAgentInfo);
        fetchTerminalsData();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [activeSubTab]);

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
  const [restaurantName, setRestaurantName] = useState<string>('BONCORE RESTORAN');
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
      is_kuver_enabled: false,
      kuver_price: 0,
      kuver_title: kuverTitle,
      auto_kuver_on_table_open: false,
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
      try {
        await api.updateScaleConfig(scaleConfig);
      } catch (e) {
        console.error('Scale save err:', e);
      }
      if (onSettingsUpdated && restaurantName) {
        onSettingsUpdated(restaurantName);
      }
    } catch (err) {
      console.warn('Settings database update failed:', err);
    }

    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 3000);
  };

  const handleAddDiscount = async (e: React.FormEvent) => {
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
    try {
      await api.updateSettings({ discounts: updated });
    } catch (err) {
      console.warn('Could not auto-save new discount:', err);
    }
  };

  const handleDeleteDiscount = async (id: number) => {
    sound.beep();
    const updated = discounts.filter(d => d.id !== id);
    setDiscounts(updated);
    localStorage.setItem('boncore_discounts', JSON.stringify(updated));
    try {
      await api.updateSettings({ discounts: updated });
    } catch (err) {
      console.warn('Could not auto-save deleted discount:', err);
    }
  };

  const tabs = [
    { id: 'parameters', label: 'Garsoniye & KDV' },
    { id: 'discounts', label: 'İndirim & İkram Tanımları' },
    { id: 'payments', label: 'Ödeme Tipleri' },
    { id: 'currency', label: 'Döviz Ayarları' },
    { id: 'address', label: 'Adres & Şirket Bilgileri' },
    { id: 'scale', label: '⚖️ CAS Terazi (Ethernet)' },
    { id: 'mobile_apk', label: '📱 Mobil Terminal & APK' }
  ];

  useEffect(() => {
    if (activeSubTab === 'mobile_apk') {
      fetch('/api/app/version')
        .then(res => res.json())
        .then(data => setAppInfo(data))
        .catch(err => console.warn('App version error:', err));
    }
  }, [activeSubTab]);

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
              <p className="text-xs text-slate-500 dark:text-slate-400">Garsoniye, KDV oranları, indirimler ve şirket ayarlarınızı buradan yapılandırın.</p>
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
              onClick={() => {
                sound.beep();
                setActiveSubTab(tab.id);
                if (tab.id === 'scale') {
                  localHardware.checkAgentStatus().then(setAgentInfo);
                }
              }}
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
              <div className="hidden p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
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
          {/* 6. CAS CL-3000 Terazi Ayarları & Canlı Test Paneli */}
          {activeSubTab === 'scale' && (
            <div className="space-y-6 text-xs font-semibold">
              {/* BonCore Yerel Donanım Ajanı Durumu & İndirme Kartı */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border-2 border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-md shrink-0 ${
                    agentInfo.isOnline
                      ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                      : 'bg-slate-700 text-slate-300'
                  }`}>
                    <Laptop className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-900 dark:text-white">BonCore Yerel Donanım Ajanı</span>
                      {agentInfo.isOnline ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-500/30">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                          🟢 AKTİF VE BAĞLI (v{agentInfo.version})
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-500/30">
                          ⚪ AJAN KAPALI (Uzak PC)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {agentInfo.isOnline
                        ? `Kasa Bilgisayarı IP: ${agentInfo.localIp} • Dükkanınızdaki CAS terazisi ve termal yazıcılar bağlı ve hazır.`
                        : "Tek tıkla kur ve unut: İndirilen paketteki 'Kurulum.bat' dosyasını çalıştırın. Masaüstünüze kurulur, Windows açılışına eklenir ve saatin yanında (Tray) sessizce çalışır."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <button
                    type="button"
                    onClick={async () => {
                      sound.beep();
                      const status = await localHardware.checkAgentStatus();
                      setAgentInfo(status);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer transition"
                  >
                    Yenile
                  </button>

                  <a
                    href="/api/scale/download-agent"
                    download="boncore-hardware-agent.zip"
                    className="px-4 py-2 rounded-xl bg-[#338d35] hover:bg-[#28702a] active:scale-95 text-white font-black text-xs shadow-md shadow-red-600/30 transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    <span>Kurulum Paketini İndir (.ZIP)</span>
                  </a>
                </div>
              </div>

              {/* ÇOKLU KASA VE TERAZİ İSTASYONLARI YÖNETİMİ */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black shadow-md shadow-purple-600/30 shrink-0">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span>Tanımlı Kasalar ve Teraziler (Çoklu Kasa Yönetimi)</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                          {terminalsList.length} Kasa Kayıtlı
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Müşteriniz her kasaya özel isim verebilir (örn. "Kasa 1 - Giriş", "Kasa 2 - Manav"). POS ekranında hangi kasanın terazisinden tartım alınacağını seçebilirsiniz.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Kasa Kartları Listesi */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {terminalsList.map((term) => (
                    <div
                      key={term.id}
                      className={`p-4 rounded-xl border-2 transition relative flex flex-col justify-between gap-3 ${
                        term.is_online
                          ? 'border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {editingTerminalId === term.id ? (
                              <div className="flex flex-col gap-2 w-full bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-purple-500/50 shadow-sm">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-slate-400 w-16">Kasa Adı:</span>
                                  <input
                                    type="text"
                                    value={editingTerminalName}
                                    onChange={(e) => setEditingTerminalName(e.target.value)}
                                    className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-purple-500 rounded-lg text-xs font-bold text-slate-900 dark:text-white flex-1"
                                    autoFocus
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-slate-400 w-16">Terazi IP:</span>
                                  <input
                                    type="text"
                                    value={editingScaleIp}
                                    onChange={(e) => setEditingScaleIp(e.target.value)}
                                    placeholder="192.168.0.15"
                                    className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-emerald-500 rounded-lg text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 w-28"
                                  />
                                  <span className="text-[10px] font-bold text-slate-400">Port:</span>
                                  <input
                                    type="number"
                                    value={editingScalePort}
                                    onChange={(e) => setEditingScalePort(parseInt(e.target.value) || 2004)}
                                    className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-emerald-500 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white w-16"
                                  />
                                </div>
                                <div className="flex items-center justify-end gap-1.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (editingTerminalName.trim()) {
                                        await localHardware.updateTerminal(term.id, {
                                          name: editingTerminalName.trim(),
                                          scale_ip: editingScaleIp.trim() || term.scale_ip,
                                          scale_port: editingScalePort || term.scale_port
                                        });
                                        setEditingTerminalId(null);
                                        fetchTerminalsData();
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-md bg-purple-600 text-white hover:bg-purple-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                    title="Kalıcı Kaydet"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Kaydet</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTerminalId(null)}
                                    className="px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold cursor-pointer"
                                    title="İptal"
                                  >
                                    İptal
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                  {term.name}
                                </span>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-black bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  {term.local_ip}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTerminalId(term.id);
                                    setEditingTerminalName(term.name);
                                    setEditingScaleIp(term.scale_ip || '192.168.1.150');
                                    setEditingScalePort(term.scale_port || 2004);
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer"
                                  title="Kasa Adı, Terazi IP ve Portu Düzenle"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            {term.is_default && editingTerminalId !== term.id && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-500/30">
                                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                Varsayılan
                              </span>
                            )}
                          </div>

                          {term.is_online ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                              ÇEVRİMİÇİ
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                              ÇEVRİMDAŞI
                            </span>
                          )}
                        </div>

                        {/* Kasa Detayları */}
                        <div className="mt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Kasa Bilgisayarı IP:</span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{term.local_ip}</span>
                            <span className="text-slate-400 text-[10px]">• v{term.version}</span>
                            <span className="text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                              • {(term.printers || []).length} Yazıcı
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Bağlı Terazi:</span>
                            {term.scale_connected ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                🟢 CAS CL-3000 ({term.scale_ip}:{term.scale_port})
                              </span>
                            ) : (
                              <span className="text-rose-500 dark:text-rose-400 font-bold">
                                🔴 Terazi Bağlantısı Yok ({term.scale_ip}:{term.scale_port})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Aksiyon Butonları */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                        <button
                          type="button"
                          onClick={async () => {
                            sound.beep();
                            setScaleWeightReading(true);
                            const res = await localHardware.getWeight(term.scale_ip, term.scale_port, term.id);
                            setScaleLiveWeight(res);
                            setScaleWeightReading(false);
                          }}
                          disabled={!term.is_online}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold flex items-center gap-1 transition cursor-pointer"
                        >
                          <Scale className="w-3.5 h-3.5" />
                          <span>Bu Kasadan Tartım Al</span>
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTerminalId(term.id);
                              setEditingTerminalName(term.name);
                              setEditingScaleIp(term.scale_ip || '192.168.1.150');
                              setEditingScalePort(term.scale_port || 2004);
                            }}
                            className="px-2 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold cursor-pointer"
                            title="Kasa Adı, Terazi IP ve Portu Düzenle"
                          >
                            Ayarla
                          </button>

                          {!term.is_default && (
                            <button
                              type="button"
                              onClick={async () => {
                                sound.beep();
                                await localHardware.updateTerminal(term.id, { is_default: true });
                                fetchTerminalsData();
                              }}
                              className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                              title="Bu kasayı varsayılan yap"
                            >
                              Varsayılan Yap
                            </button>
                          )}

                          {terminalsList.length > 1 && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (window.confirm(`${term.name} (${term.local_ip}) kasasını silmek istediğinize emin misiniz?`)) {
                                  await localHardware.deleteTerminal(term.id);
                                  fetchTerminalsData();
                                }
                              }}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              title="Kasayı Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Yeni Kasa Kurulum Paketi İndirme Alanı */}
                <div className="p-4 rounded-xl bg-purple-500/5 dark:bg-purple-950/20 border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-xs font-black text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-purple-600" />
                      Yeni Bir Kasa / Bilgisayar Ekle
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Yeni kasanız için bir isim belirleyip indirin. İndirilen paketi diğer bilgisayarda çalıştırdığınızda otomatik bu isimle kaydolur ve kapanıp açılsa bile ayarları sıfırlanmaz.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                      type="text"
                      value={newTerminalName}
                      onChange={(e) => setNewTerminalName(e.target.value)}
                      placeholder="Örn: Kasa 2 - Paket"
                      className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white w-full sm:w-48"
                    />
                    <a
                      href={`/api/scale/download-agent?terminal_name=${encodeURIComponent(newTerminalName)}`}
                      download={`boncore-hardware-agent-${newTerminalName}.zip`}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-black text-xs shadow-md shadow-purple-600/30 transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Bu Kasa İçin İndir (.ZIP)</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* TERMAL YAZICI VE OTOMATİK ÇIKTI YÖNETİMİ (IP ADRESİNE VE İSME GÖRE GRUPLANMIŞ) */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black shadow-md shadow-blue-600/30 shrink-0">
                      <Printer className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                        <span>Fiziksel Termal Yazıcılar (IP Adresine & İsme Göre Gruplanmış)</span>
                        {selectedPrinters.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            {selectedPrinters.length} Yazıcı Seçili
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Ağdaki her kasa bilgisayarının (<code className="font-mono font-bold">IP Adresi</code>) yazıcıları kendi grubu altında ve <strong>isme göre alfabetik</strong> sıralanır. Böylece farklı kasalardaki mutfak/kasa yazıcıları birbirine karışmaz.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleTestPrint}
                      disabled={printerTestStatus?.loading || selectedPrinters.length === 0}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-blue-600/30 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer whitespace-nowrap"
                    >
                      <Printer className="w-4 h-4" />
                      <span>{printerTestStatus?.loading ? 'Yazdırılıyor...' : 'Seçili Yazıcılara Test Fişi Yazdır'}</span>
                    </button>
                  </div>
                </div>

                {/* Arama / Filtre ve Sanal Yazıcı Gizleme Barı */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={printerSearchQuery}
                      onChange={(e) => setPrinterSearchQuery(e.target.value)}
                      placeholder="Yazıcı adı, Kasa adı veya IP adresine göre filtrele (Örn: 192.168.0.120 veya MUTFAK)..."
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer px-2 py-1 select-none">
                    <input
                      type="checkbox"
                      checked={showVirtualPrinters}
                      onChange={(e) => setShowVirtualPrinters(e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-blue-600"
                    />
                    <span>PDF / OneNote / Fax Sanal Yazıcılarını Göster</span>
                  </label>
                </div>

                {/* Test Durum Bildirimi */}
                {printerTestStatus && (
                  <div className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                    printerTestStatus.success 
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/40 text-emerald-800 dark:text-emerald-300' 
                      : 'bg-rose-50 dark:bg-rose-950/30 border-rose-500/40 text-rose-800 dark:text-rose-300'
                  }`}>
                    {printerTestStatus.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
                    <span>{printerTestStatus.message}</span>
                  </div>
                )}

                {/* IP Adresi ve Kasa İsmine Göre Gruplanmış Yazıcılar */}
                <div className="space-y-4">
                  {(() => {
                    // Terminalleri IP ve İsme göre sırala (Çevrimiçi olanlar üstte)
                    const groupedTerminals = [...terminalsList]
                      .filter(t => (t.printers && t.printers.length > 0))
                      .sort((a, b) => {
                        if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
                        return (a.local_ip || '').localeCompare(b.local_ip || '', 'tr');
                      });

                    if (groupedTerminals.length === 0) {
                      return (
                        <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400">
                          <Printer className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="text-xs font-bold">Ajan henüz bilgisayarınızdaki yazıcıları bildirmedi veya ajan kapalı.</p>
                          <p className="text-[11px] mt-1">Bilgisayarda BonCore Ajanını başlatın veya aşağıdaki kutudan yazıcı adınızı manuel ekleyin.</p>
                        </div>
                      );
                    }

                    const q = printerSearchQuery.trim().toLowerCase();

                    return groupedTerminals.map((term) => {
                      const ipAddr = term.local_ip || term.id;
                      // Bu kasadaki yazıcıları isme göre alfabetik sırala (Fiziksel termal yazıcılar üstte, sanal yazıcılar altta)
                      const allPrinters = [...(term.printers || [])].sort((a, b) => {
                        const va = isVirtualPrinter(a);
                        const vb = isVirtualPrinter(b);
                        if (va !== vb) return va ? 1 : -1;
                        return a.localeCompare(b, 'tr');
                      });

                      const filteredPrinters = allPrinters.filter(prName => {
                        if (!showVirtualPrinters && isVirtualPrinter(prName)) return false;
                        if (!q) return true;
                        return (
                          prName.toLowerCase().includes(q) ||
                          (term.name || '').toLowerCase().includes(q) ||
                          ipAddr.toLowerCase().includes(q)
                        );
                      });

                      if (filteredPrinters.length === 0) return null;

                      const thermalCount = filteredPrinters.filter(p => !isVirtualPrinter(p)).length;

                      return (
                        <div
                          key={term.id}
                          className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/40 dark:bg-slate-900/40"
                        >
                          {/* Grup Başlığı: Kasa Adı + IP Adresi */}
                          <div className="px-4 py-2.5 bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-mono text-xs font-black shadow-xs">
                                IP: {ipAddr}
                              </span>
                              <span className="text-xs font-black text-slate-900 dark:text-white">
                                {term.name}
                              </span>
                              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                ({thermalCount} Termal / POS • Toplam {filteredPrinters.length} Yazıcı)
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {term.is_online ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  AKTİF KASA ({ipAddr})
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                                  ÇEVRİMDAŞI ({ipAddr})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Bu IP'deki Yazıcı Kartları (İsme Göre Sıralı) */}
                          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {filteredPrinters.map((prName) => {
                              const qualifiedKey = `${ipAddr}::${prName}`;
                              const isSelected = selectedPrinters.includes(qualifiedKey) || selectedPrinters.includes(prName);
                              const isVirtual = isVirtualPrinter(prName);

                              return (
                                <div
                                  key={qualifiedKey}
                                  onClick={() => handleTogglePrinter(qualifiedKey, prName)}
                                  className={`p-3 px-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                                    isSelected
                                      ? 'border-blue-600 bg-blue-50/90 dark:bg-blue-950/40 shadow-sm ring-1 ring-blue-500'
                                      : isVirtual
                                      ? 'border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-800/40 opacity-80 hover:opacity-100'
                                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 hover:border-blue-400 dark:hover:border-blue-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition shrink-0 ${
                                      isSelected 
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs' 
                                        : 'border-slate-400 bg-slate-50 dark:bg-slate-700'
                                    }`}>
                                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                    </div>

                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                      isSelected
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : isVirtual
                                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                    }`}>
                                      <Printer className="w-4 h-4" />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-black text-slate-900 dark:text-white truncate" title={prName}>
                                          {prName}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-semibold">
                                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                                          {ipAddr}
                                        </span>
                                        <span className="text-slate-300 dark:text-slate-600">•</span>
                                        <span className="text-slate-500 dark:text-slate-400 truncate">
                                          {term.name}
                                        </span>
                                        <span className="text-slate-300 dark:text-slate-600">•</span>
                                        <span className={isVirtual ? 'text-slate-400' : 'text-emerald-600 dark:text-emerald-400 font-bold'}>
                                          {isVirtual ? 'Sanal Yazıcı' : 'Termal / POS'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSingleTestPrint(qualifiedKey, prName, ipAddr);
                                      }}
                                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white dark:bg-slate-700 dark:hover:bg-blue-600 text-slate-700 dark:text-slate-200 text-[10px] font-black transition cursor-pointer"
                                      title={`${ipAddr} üzerindeki ${prName} yazıcısına test fişi gönder`}
                                    >
                                      Test
                                    </button>
                                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full shrink-0 border ${
                                      isSelected
                                        ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 font-black'
                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 border-slate-200 dark:border-slate-600 font-bold'
                                    }`}>
                                      {isSelected ? '✓ SEÇİLİ' : 'SEÇ'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Manuel Yazıcı Ekleme */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Listede görünmeyen veya özel bir ağ yazıcısı eklemek için (Örn: <code className="font-mono">192.168.0.120::MUTFAK-POS</code>):
                  </span>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                      type="text"
                      value={customPrinterInput}
                      onChange={(e) => setCustomPrinterInput(e.target.value)}
                      placeholder="Örn: 192.168.0.120::POS-80"
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white w-full sm:w-56"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = customPrinterInput.trim();
                        if (trimmed && !selectedPrinters.includes(trimmed)) {
                          handleTogglePrinter(trimmed);
                          setCustomPrinterInput('');
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition whitespace-nowrap cursor-pointer"
                    >
                      Ekle & Seç
                    </button>
                  </div>
                </div>
              </div>

              {/* Bilgilendirme Kartı */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border border-emerald-500/30 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-md shadow-emerald-600/30 shrink-0">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                    CAS CL-3000 / CL-5000 Ethernet Barkodlu / Tezgah Terazisi
                  </h4>
                  <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    Terazinizi yerel ağa (Ethernet switch/modem) bağlayarak doğrudan IP üzerinden haberleştirebilirsiniz. 
                    POS sipariş ekranında gramajlı ürün seçildiğinde <strong>"⚖️ Teraziden Ağırlığı Al"</strong> butonu bu IP ve port üzerinden teraziden kararlı ağırlığı anlık olarak okur.
                  </p>
                </div>
              </div>

              {/* Terazi Parametreleri */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                  <h5 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    <span>Ağ & Donanım Yapılandırması</span>
                  </h5>

                  <div>
                    <label className="text-slate-500 block mb-1">Terazi Modeli:</label>
                    <input
                      type="text"
                      value={scaleConfig.model}
                      onChange={(e) => setScaleConfig({ ...scaleConfig, model: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-900 dark:text-white"
                      placeholder="CAS CL-3000"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 block mb-1">Terazi IP Adresi:</label>
                      <input
                        type="text"
                        value={scaleConfig.ip_address}
                        onChange={(e) => setScaleConfig({ ...scaleConfig, ip_address: e.target.value })}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono font-bold text-emerald-600 dark:text-emerald-400"
                        placeholder="192.168.1.150"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1">Port (Varsayılan: 2004):</label>
                      <input
                        type="number"
                        value={scaleConfig.port}
                        onChange={(e) => setScaleConfig({ ...scaleConfig, port: parseInt(e.target.value) || 2004 })}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono font-bold text-slate-900 dark:text-white"
                        placeholder="2004"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 block mb-1">Zaman Aşımı (Saniye):</label>
                      <input
                        type="number"
                        step="0.5"
                        value={scaleConfig.timeout}
                        onChange={(e) => setScaleConfig({ ...scaleConfig, timeout: parseFloat(e.target.value) || 2.5 })}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1">Entegrasyon Durumu:</label>
                      <button
                        type="button"
                        onClick={() => setScaleConfig({ ...scaleConfig, enabled: !scaleConfig.enabled })}
                        className={`w-full py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition ${
                          scaleConfig.enabled
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {scaleConfig.enabled ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <X className="w-4 h-4" />}
                        <span>{scaleConfig.enabled ? 'Aktif (Açık)' : 'Devre Dışı'}</span>
                      </button>
                    </div>
                  </div>

                </div>

                {/* Canlı Test & Dijital Gösterge Ekranı */}
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 flex flex-col justify-between">
                  <div>
                    <h5 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-3">
                      <Wifi className="w-4 h-4 text-emerald-600" />
                      <span>Terazi Bağlantı & Tartım Testi</span>
                    </h5>

                    {/* Dijital Kantar Göstergesi */}
                    <div className="p-4 rounded-2xl bg-slate-950 border-2 border-emerald-500/60 shadow-inner text-center font-mono space-y-1 relative overflow-hidden">
                      <div className="flex items-center justify-between text-[10px] text-emerald-400/80 font-bold uppercase tracking-wider">
                        <span>CAS CL-3000 EKRAN</span>
                        <span>{scaleLiveWeight?.is_stable !== false ? '• DENGELİ (ST)' : '• DENGESİZ (US)'}</span>
                      </div>
                      <div className="text-4xl sm:text-5xl font-black text-emerald-400 tracking-wider py-1 drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]">
                        {scaleLiveWeight ? scaleLiveWeight.weight.toFixed(3) : '0.000'} <span className="text-xl text-emerald-500/90 font-bold">Kg</span>
                      </div>
                      <div className="text-[11px] text-emerald-400/70 font-semibold truncate">
                        {scaleLiveWeight?.raw || 'Teraziden tartım okumak için butona basın.'}
                      </div>
                    </div>

                    {/* Test Sonuç Mesajı */}
                    {scaleTestResult && (
                      <div className={`mt-3 p-3 rounded-xl border text-xs font-bold flex items-start gap-2 ${
                        scaleTestResult.success
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                      }`}>
                        {scaleTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
                        <div>
                          <div>{scaleTestResult.message || scaleTestResult.error}</div>
                          {scaleTestResult.latency_ms !== undefined && (
                            <div className="text-[10px] opacity-75 mt-0.5">Ping Gecikmesi: {scaleTestResult.latency_ms} ms</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Aksiyon Butonları */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      disabled={scaleTesting}
                      onClick={async () => {
                        try {
                          sound.beep();
                          setScaleTesting(true);
                          setScaleTestResult(null);
                          const res = await localHardware.testConnection(scaleConfig.ip_address, scaleConfig.port);
                          setScaleTestResult(res);
                        } catch (err: any) {
                          setScaleTestResult({ success: false, error: err.message || 'Ağ bağlantısı kurulamadı' });
                        } finally {
                          setScaleTesting(false);
                        }
                      }}
                      className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-extrabold flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
                    >
                      {scaleTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4 text-emerald-600" />}
                      <span>{scaleTesting ? 'Bağlanıyor...' : 'Ağı Test Et'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={scaleWeightReading}
                      onClick={async () => {
                        try {
                          sound.beep();
                          setScaleWeightReading(true);
                          const res = await localHardware.getWeight(scaleConfig.ip_address, scaleConfig.port);
                          if (res.success && res.weight !== undefined) {
                            setScaleLiveWeight(res);
                            sound.beep();
                          } else {
                            sound.warning();
                            setScaleTestResult({ success: false, error: res.error || 'Ağırlık okunamadı.' });
                          }
                        } catch (err: any) {
                          sound.warning();
                          setScaleTestResult({ success: false, error: err.message || 'Hata oluştu' });
                        } finally {
                          setScaleWeightReading(false);
                        }
                      }}
                      className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
                    >
                      {scaleWeightReading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
                      <span>{scaleWeightReading ? 'Okunuyor...' : 'Ağırlığı Oku'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: Mobil Terminal & Android APK */}
          {activeSubTab === 'mobile_apk' && (
            <div className="space-y-6 text-xs">
              {/* Bildirim Mesajı */}
              {apkMessage && (
                <div className={`p-4 rounded-2xl border flex items-center justify-between animate-fadeIn ${
                  apkMessage.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}>
                  <div className="flex items-center gap-2.5 font-bold">
                    {apkMessage.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-rose-600" />}
                    <span>{apkMessage.text}</span>
                  </div>
                  <button onClick={() => setApkMessage(null)} className="p-1 hover:opacity-70">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* 1. ÜST KART: APK İndirme & Sürüm Bilgisi */}
              <div className="p-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl shadow-lg border border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 flex-shrink-0">
                    <Smartphone className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black tracking-wide">BonCore POS Android El Terminali</h3>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black uppercase">
                        v{appInfo?.version_name || '1.0.0'}
                      </span>
                    </div>
                    <p className="text-slate-300 text-xs">
                      Garson el terminalleri ve tabletler için optimize edilmiş, WakeLock ve titreşim destekli APK.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400 font-semibold">
                      <span>Yayın Tarihi: <strong className="text-white">{appInfo?.release_date || '2026-10-29'}</strong></span>
                      <span>•</span>
                      <span>Durum: <strong className={appInfo?.is_apk_available ? 'text-emerald-400' : 'text-amber-400'}>{appInfo?.is_apk_available ? 'İndirmeye Hazır' : 'Paket Bekleniyor'}</strong></span>
                      {appInfo?.file_size_mb ? (
                        <>
                          <span>•</span>
                          <span>Boyut: <strong className="text-white">{appInfo.file_size_mb} MB</strong></span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                  <a
                    href="/api/app/download"
                    download={`BonCore-POS-v${appInfo?.version_name || '1.0.0'}.apk`}
                    onClick={() => sound.beep()}
                    className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/30 transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>APK Paketini İndir</span>
                  </a>
                  <button
                    onClick={() => {
                      sound.beep();
                      const url = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
                      navigator.clipboard.writeText(url);
                      setApkMessage({ text: `Terminal bağlantı adresi kopyalandı: ${url}`, success: true });
                      setTimeout(() => setApkMessage(null), 4000);
                    }}
                    className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    <span>IP / Web Linkini Kopyala</span>
                  </button>
                </div>
              </div>

              {/* 2. ORTA KARTLAR: Hızlı Bağlantı & Mobil Avantajları */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Mobil Özellikler Kartı */}
                <div className="p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3.5">
                  <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2.5">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">Android Terminal Teknolojileri</h4>
                  </div>
                  <ul className="space-y-2.5 font-medium text-slate-700 dark:text-slate-300">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900 dark:text-white">Otomatik OTA Güncelleme:</strong> Uygulama her açıldığında sunucuyla haberleşir, yeni versiyon varsa garsonu uyararak tek dokunuşla günceller.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900 dark:text-white">Kesintisiz Ekran (WakeLock):</strong> Sipariş alma ve masa adisyonu esnasında telefonun ekranı asla kararmaz veya kapanmaz.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900 dark:text-white">Haptik Titreşim (Touch Feedback):</strong> Dokunmatik ekranda her ürün eklendiğinde ve tuşa basıldığında fiziksel titreşim verir.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <strong className="text-slate-900 dark:text-white">Ağ Kesintisi & IP Ayarı:</strong> Wi-Fi koptuğunda çevrimdışı uyarı ekranı devreye girer, garson terminalden kolayca sunucu IP adresini değiştirebilir.
                      </div>
                    </li>
                  </ul>
                </div>

                {/* Sürüm Günlüğü & Notlar */}
                <div className="p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3.5">
                  <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2.5">
                    <Activity className="w-4 h-4 text-indigo-500" />
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">Sürüm Değişiklik Günlüğü (Changelog)</h4>
                  </div>
                  <div className="space-y-2">
                    {(appInfo?.changelog || [
                      'BonCore POS Android El Terminali ve Tablet sürümü yayınlandı.',
                      'Otomatik web güncelleme entegrasyonu (Canlı menü & sipariş akışı).',
                      'Ekran açık tutma (WakeLock) ve dokunmatik titreşim (Haptik) desteği.',
                      'Kendi kendini güncelleyebilen OTA (Over-The-Air) APK mekanizması.'
                    ]).map((logItem, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
                        <span className="text-emerald-600 font-black">•</span>
                        <span>{logItem}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-[11px] text-slate-500">
                      💡 <strong>PWA Kurulumu:</strong> Android telefonunuzda Chrome ile sisteme bağlandıktan sonra sağ üstteki üç noktaya basıp <span className="font-bold text-slate-800 dark:text-slate-200">"Uygulamayı Yükle"</span> veya <span className="font-bold text-slate-800 dark:text-slate-200">"Ana Ekrana Ekle"</span> diyerek de APK yüklemeden tam ekran kullanabilirsiniz.
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. ALT KART: Yönetici Yeni APK Dağıtımı (OTA Upload) */}
              <div className="p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2.5">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">Yeni APK Yükleme & OTA Güncelleme Yayınlama</h4>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const fileInput = form.elements.namedItem('apk_file') as HTMLInputElement;
                    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                      alert('Lütfen yüklenecek .apk dosyasını seçiniz.');
                      return;
                    }
                    sound.beep();
                    setApkUploading(true);
                    try {
                      const formData = new FormData();
                      formData.append('file', fileInput.files[0]);
                      formData.append('version_name', newApkVersion);
                      formData.append('version_code', String(newApkCode));
                      formData.append('changelog', newApkChangelog);

                      const res = await fetch('/api/app/upload', {
                        method: 'POST',
                        body: formData
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setApkMessage({ text: data.message || 'Yeni APK başarıyla yayınlandı!', success: true });
                        const vRes = await fetch('/api/app/version');
                        const vData = await vRes.json();
                        setAppInfo(vData);
                        form.reset();
                      } else {
                        setApkMessage({ text: data.detail || 'APK yüklenirken hata oluştu.', success: false });
                      }
                    } catch (err: any) {
                      setApkMessage({ text: err.message || 'Bağlantı hatası.', success: false });
                    } finally {
                      setApkUploading(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-semibold">
                    <div>
                      <label className="text-slate-500 block mb-1">APK Dosyası (.apk):</label>
                      <input
                        type="file"
                        name="apk_file"
                        accept=".apk"
                        required
                        className="w-full text-xs p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1">Sürüm Adı (Örn: 1.0.1):</label>
                      <input
                        type="text"
                        value={newApkVersion}
                        onChange={(e) => setNewApkVersion(e.target.value)}
                        required
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1">Sürüm Kodu (Integer - Örn: 2):</label>
                      <input
                        type="number"
                        value={newApkCode}
                        onChange={(e) => setNewApkCode(Number(e.target.value))}
                        required
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1">Sürüm Notları (Her satıra bir yenilik):</label>
                    <textarea
                      value={newApkChangelog}
                      onChange={(e) => setNewApkChangelog(e.target.value)}
                      rows={2}
                      placeholder="Yeni arayüz iyileştirmeleri&#10;Performans ve kararlılık geliştirmeleri..."
                      className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={apkUploading}
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {apkUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span>{apkUploading ? 'Yükleniyor ve Dağıtılıyor...' : 'Yeni Sürümü Sisteme Yükle & OTA Dağıt'}</span>
                    </button>
                  </div>
                </form>
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
