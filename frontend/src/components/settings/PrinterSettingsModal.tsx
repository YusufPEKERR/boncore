import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Check, Search, Trash2, AlertCircle } from 'lucide-react';
import { PrinterConfig } from '../../types';
import { sound } from '../../services/sound';

interface PrinterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: PrinterConfig | null;
  detectedPrinters: Array<{
    qualifiedKey: string;
    displayName: string;
    localIp: string;
    terminalName: string;
    isVirtual?: boolean;
  }>;
  availableCategories: string[];
  onSave: (config: PrinterConfig) => void;
  onDelete?: (configId: string) => void;
}

// Görseldeki yeşil açma/kapama (iOS / Material style) toggle bileşeni
const GreenToggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  sublabel?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, sublabel, disabled = false }) => {
  return (
    <div
      onClick={() => {
        if (!disabled) {
          sound.beep();
          onChange(!checked);
        }
      }}
      className={`flex items-center justify-between py-2.5 cursor-pointer select-none group ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      }`}
    >
      <div className="flex-1 pr-3">
        {label && (
          <div className={`text-xs font-bold transition-colors ${
            checked
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-slate-800 dark:text-slate-200'
          }`}>
            {label}
          </div>
        )}
        {sublabel && <div className="text-[10px] text-slate-400 mt-0.5">{sublabel}</div>}
      </div>

      <div
        className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
          checked ? 'bg-emerald-600' : 'bg-slate-400 dark:bg-slate-600'
        }`}
      >
        <div
          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
    </div>
  );
};

const normCat = (s: string) => String(s || '').trim().toLocaleUpperCase('tr-TR');

export const PrinterSettingsModal: React.FC<PrinterSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  detectedPrinters,
  availableCategories,
  onSave,
  onDelete
}) => {
  // Form State
  const [name, setName] = useState('');
  const [targetPrinter, setTargetPrinter] = useState('');
  const [printerTypes, setPrinterTypes] = useState({
    adisyon: false,
    kitchen: false,
    abiyer: false,
    courier: false
  });
  const [mainChannel, setMainChannel] = useState(true);
  const [kitchenGroups, setKitchenGroups] = useState<string[]>([]);
  const [printOnOrderSave, setPrintOnOrderSave] = useState(false);
  const [printOnIntegration, setPrintOnIntegration] = useState(false);
  const [copies, setCopies] = useState({
    table_order: 1,
    takeaway_order: 1,
    delivery_order: 1,
    post_payment: 1
  });
  const [assignToThisDevice, setAssignToThisDevice] = useState(true);
  const [searchCategory, setSearchCategory] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Arka plandaki 3 saniyelik terminal taraması (detectedPrinters referans değişimi)
  // açık olan modaldaki kullanıcı seçimlerini sıfırlamasın diye yalnızca açılışta dolduruyoruz.
  const initializedKeyRef = useRef<string>('');

  useEffect(() => {
    if (!isOpen) {
      initializedKeyRef.current = '';
      setErrorMsg(null);
      setSearchCategory('');
      return;
    }

    const currentModalKey = config ? `${config.id}::${config.target_printer}` : '__new__';
    if (initializedKeyRef.current === currentModalKey) {
      return;
    }
    initializedKeyRef.current = currentModalKey;

    if (config) {
      setName(config.name || '');

      // Hedef yazıcıyı algılanan yazıcılarla eşleştir
      let resolvedTarget = config.target_printer || '';
      if (resolvedTarget && !detectedPrinters.some(p => p.qualifiedKey === resolvedTarget)) {
        const plainTarget = resolvedTarget.includes('::') ? resolvedTarget.split('::')[1] : resolvedTarget;
        const matched = detectedPrinters.find(
          p => p.displayName.toLowerCase() === plainTarget.toLowerCase()
        );
        if (matched) {
          resolvedTarget = matched.qualifiedKey;
        }
      }
      setTargetPrinter(resolvedTarget);

      const rawGroups = Array.isArray(config.kitchen_groups) ? config.kitchen_groups : [];
      const availNormMap = new Map<string, string>();
      availableCategories.forEach(c => availNormMap.set(normCat(c), c));

      const validGroups = availableCategories.length > 0
        ? rawGroups
            .map(g => availNormMap.get(normCat(g)))
            .filter((g): g is string => Boolean(g))
        : rawGroups;

      const uniqueValidGroups = Array.from(new Set(validGroups));
      setKitchenGroups(uniqueValidGroups);

      setPrinterTypes({
        adisyon: Boolean(config.printer_types?.adisyon),
        kitchen: uniqueValidGroups.length > 0 ? true : Boolean(config.printer_types?.kitchen),
        abiyer: Boolean(config.printer_types?.abiyer),
        courier: Boolean(config.printer_types?.courier)
      });
      setMainChannel(config.revenue_center?.main_channel ?? true);
      setPrintOnOrderSave(Boolean(config.settings?.print_on_order_save));
      setPrintOnIntegration(Boolean(config.settings?.print_on_integration_approved));
      setCopies({
        table_order: Math.max(1, Number(config.settings?.copies?.table_order) || 1),
        takeaway_order: Math.max(1, Number(config.settings?.copies?.takeaway_order) || 1),
        delivery_order: Math.max(1, Number(config.settings?.copies?.delivery_order) || 1),
        post_payment: Math.max(1, Number(config.settings?.copies?.post_payment) || 1)
      });
      setAssignToThisDevice(config.settings?.assign_to_this_device ?? true);
    } else {
      // Yeni yazıcı varsayılanları (Fiziksel yazıcı varsa ilkini seç, kategoriler boş başlasın)
      const firstPhysical = detectedPrinters.find(p => !p.isVirtual) || detectedPrinters[0];
      const firstDetected = firstPhysical ? firstPhysical.qualifiedKey : '';
      const defaultName = firstPhysical ? firstPhysical.displayName : 'Yeni Yazıcı';
      setName(defaultName);
      setTargetPrinter(firstDetected);
      setPrinterTypes({
        adisyon: false,
        kitchen: false,
        abiyer: false,
        courier: false
      });
      setMainChannel(true);
      setKitchenGroups([]);
      setPrintOnOrderSave(false);
      setPrintOnIntegration(false);
      setCopies({
        table_order: 1,
        takeaway_order: 1,
        delivery_order: 1,
        post_payment: 1
      });
      setAssignToThisDevice(true);
    }
  }, [isOpen, config, detectedPrinters, availableCategories]);

  // Kategorileri filtrele
  const filteredCategories = useMemo(() => {
    if (!searchCategory.trim()) return availableCategories;
    const q = normCat(searchCategory);
    return availableCategories.filter(c => normCat(c).includes(q));
  }, [availableCategories, searchCategory]);

  const isCategorySelected = (cat: string): boolean => {
    const targetNorm = normCat(cat);
    return kitchenGroups.some(g => normCat(g) === targetNorm);
  };

  const handleToggleCategory = (cat: string) => {
    setKitchenGroups(prev => {
      const targetNorm = normCat(cat);
      const exists = prev.some(g => normCat(g) === targetNorm);
      const next = exists
        ? prev.filter(g => normCat(g) !== targetNorm)
        : [...prev, cat];

      // Kategori seçildiğinde Mutfak türünü otomatik aktif et, hiç kategori kalmadıysa kapat
      setPrinterTypes(pt => ({
        ...pt,
        kitchen: next.length > 0,
        abiyer: next.length > 0 ? false : pt.abiyer
      }));

      return next;
    });
  };

  const handleSelectAllCategories = () => {
    sound.beep();
    setKitchenGroups([...availableCategories]);
    if (availableCategories.length > 0) {
      setPrinterTypes(prev => ({ ...prev, kitchen: true, abiyer: false }));
    }
  };

  const handleClearAllCategories = () => {
    sound.beep();
    setKitchenGroups([]);
    setPrinterTypes(prev => ({ ...prev, kitchen: false }));
  };

  const handleSave = () => {
    if (!targetPrinter.trim()) {
      sound.warning();
      setErrorMsg('Lütfen "Bulunan Yazıcılar" listesinden bir yazıcı seçin.');
      return;
    }

    sound.cashDrawer();
    const fallbackName = targetPrinter.includes('::')
      ? targetPrinter.split('::')[1]
      : targetPrinter;
    const cleanName = name.trim() || fallbackName || 'Yazıcı';

    // Sadece geçerli kategorileri kaydet
    const availNormMap = new Map<string, string>();
    availableCategories.forEach(c => availNormMap.set(normCat(c), c));
    const finalKitchenGroups = availableCategories.length > 0
      ? Array.from(
          new Set(
            kitchenGroups
              .map(g => availNormMap.get(normCat(g)) || g.trim())
              .filter(Boolean)
          )
        )
      : kitchenGroups;

    const hasCategories = finalKitchenGroups.length > 0;

    const newConfig: PrinterConfig = {
      id: targetPrinter,
      name: cleanName,
      target_printer: targetPrinter,
      printer_types: {
        adisyon: printerTypes.adisyon,
        kitchen: hasCategories ? true : false,
        abiyer: printerTypes.abiyer,
        courier: printerTypes.courier
      },
      revenue_center: {
        main_channel: mainChannel
      },
      kitchen_groups: finalKitchenGroups,
      settings: {
        print_on_order_save: printOnOrderSave,
        print_on_integration_approved: printOnIntegration,
        copies: {
          table_order: Math.max(1, Number(copies.table_order) || 1),
          takeaway_order: Math.max(1, Number(copies.takeaway_order) || 1),
          delivery_order: Math.max(1, Number(copies.delivery_order) || 1),
          post_payment: Math.max(1, Number(copies.post_payment) || 1)
        },
        assign_to_this_device: assignToThisDevice
      }
    };

    onSave(newConfig);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          sound.beep();
          onClose();
        }
      }}
    >
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">Yazıcı Ayarları</h3>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">
              Yazıcı Bilgileri ve Otomatik Kategori Çıktı Yönlendirmesi
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              sound.beep();
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal 3-Column Body */}
        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-3 gap-5 bg-slate-50/50 dark:bg-slate-950/40">
          
          {/* KOLON 1: YAZICI BİLGİLERİ */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="text-[11px] font-black tracking-wider text-slate-400 dark:text-slate-500 uppercase pb-2">
                YAZICI BİLGİLERİ
              </div>

              {/* Yazıcı Adı */}
              <div className="space-y-1 mb-4">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Yazıcı Adı*
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: Kasa / Mutfak 1"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              {/* Bulunan Yazıcılar */}
              <div className="space-y-1 mb-5">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Bulunan Yazıcılar
                </label>
                <select
                  value={targetPrinter}
                  onChange={(e) => {
                    const nextTarget = e.target.value;
                    setTargetPrinter(nextTarget);
                    setErrorMsg(null);
                    const foundDp = detectedPrinters.find(dp => dp.qualifiedKey === nextTarget);
                    if (foundDp && (!name.trim() || name === 'Yeni Yazıcı')) {
                      setName(foundDp.displayName);
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="">-- Yazıcı Seçin --</option>
                  {detectedPrinters.map((dp) => (
                    <option key={dp.qualifiedKey} value={dp.qualifiedKey}>
                      {dp.displayName} ({dp.terminalName || dp.localIp})
                    </option>
                  ))}
                  {targetPrinter && !detectedPrinters.some(p => p.qualifiedKey === targetPrinter) && (
                    <option value={targetPrinter}>
                      {targetPrinter.includes('::') ? targetPrinter.split('::')[1] : targetPrinter} ({targetPrinter})
                    </option>
                  )}
                </select>
              </div>

              {/* YAZICI TÜRÜ */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <div className="text-[11px] font-black tracking-wider text-slate-400 dark:text-slate-500 uppercase pb-1">
                  YAZICI TÜRÜ
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  <GreenToggle
                    label="Adisyon"
                    sublabel="Yazdır ve Hızlı Öde butonlarında bu yazıcıdan adisyon fişi çıkar"
                    checked={printerTypes.adisyon}
                    onChange={(v) => setPrinterTypes(prev => ({ ...prev, adisyon: v, abiyer: v ? false : prev.abiyer }))}
                  />

                  <GreenToggle
                    label="Mutfak"
                    sublabel="Seçilen mutfak grubu kategorilerinden sipariş girildiğinde otomatik çıkar"
                    checked={printerTypes.kitchen}
                    onChange={(v) => {
                      setPrinterTypes(prev => ({ ...prev, kitchen: v, abiyer: v ? false : prev.abiyer }));
                      if (!v) {
                        setKitchenGroups([]);
                      }
                    }}
                  />

                  <GreenToggle
                    label="Abiyer"
                    sublabel="Diğer türle aynı anda seçilemez"
                    checked={printerTypes.abiyer}
                    onChange={(v) => {
                      if (v) {
                        setPrinterTypes({ adisyon: false, kitchen: false, abiyer: true, courier: false });
                        setKitchenGroups([]);
                      } else {
                        setPrinterTypes(prev => ({ ...prev, abiyer: false }));
                      }
                    }}
                  />

                  <GreenToggle
                    label="Kurye"
                    checked={printerTypes.courier}
                    onChange={(v) => setPrinterTypes(prev => ({ ...prev, courier: v, abiyer: v ? false : prev.abiyer }))}
                  />
                </div>
              </div>
            </div>

            {/* GELİR MERKEZİ */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <div className="text-[11px] font-black tracking-wider text-slate-400 dark:text-slate-500 uppercase pb-1">
                GELİR MERKEZİ
              </div>
              <GreenToggle
                label="Ana Kanal"
                checked={mainChannel}
                onChange={setMainChannel}
              />
            </div>
          </div>

          {/* KOLON 2: MUTFAK GRUBU (KATEGORİLER) */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col">
            <div className="flex items-center justify-between pb-2">
              <div className="text-[11px] font-black tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                MUTFAK GRUBU
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={handleSelectAllCategories}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold hover:bg-emerald-100 transition cursor-pointer"
                >
                  Tümünü Seç
                </button>
                <button
                  type="button"
                  onClick={handleClearAllCategories}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-200 transition cursor-pointer"
                >
                  Temizle
                </button>
              </div>
            </div>

            {/* Arama Barı */}
            <div className="relative my-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchCategory}
                onChange={(e) => setSearchCategory(e.target.value)}
                placeholder="Kategori ara..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">
              Siparişe eklenen ürünün kategorisi ile aşağıda işaretlediğiniz kategori <strong>aynıysa</strong> bu yazıcıdan otomatik fiş çıkar, seçili değilse çıkmaz.
            </p>

            {/* Kategori Switch Listesi */}
            <div className="flex-1 overflow-y-auto max-h-[380px] divide-y divide-slate-100 dark:divide-slate-800/80 pr-1 select-none">
              {filteredCategories.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Kategori bulunamadı.
                </div>
              ) : (
                filteredCategories.map((cat) => {
                  const isChecked = isCategorySelected(cat);
                  return (
                    <GreenToggle
                      key={cat}
                      label={cat.toLocaleUpperCase('tr-TR')}
                      checked={isChecked}
                      onChange={() => handleToggleCategory(cat)}
                    />
                  );
                })
              )}
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-semibold">
                {kitchenGroups.length === 0 ? 'Hiçbir kategori seçilmedi (Mutfak fişi çıkmaz)' : 'Seçili kategoriler aktif'}
              </span>
              <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                {kitchenGroups.length} / {availableCategories.length} Seçili
              </span>
            </div>
          </div>

          {/* KOLON 3: AYARLAR & NÜSHA SAYISI */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="text-[11px] font-black tracking-wider text-slate-400 dark:text-slate-500 uppercase pb-1">
                AYARLAR
              </div>

              {/* ADİSYON ÇIKTISI */}
              <div>
                <div className="text-[11px] font-black tracking-wider text-slate-400 dark:text-slate-500 uppercase pb-1">
                  ADİSYON ÇIKTISI
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  <GreenToggle
                    label="Sipariş kaydedildiğinde bu kasa yazıcısından da fiş çıksın"
                    checked={printOnOrderSave}
                    onChange={setPrintOnOrderSave}
                  />
                  <GreenToggle
                    label="Entegrasyon siparişi onaylandığında bu kasa yazıcısından da fiş çıksın"
                    checked={printOnIntegration}
                    onChange={setPrintOnIntegration}
                  />
                </div>
              </div>

              {/* SİPARİŞ TİPİNE GÖRE NÜSHA SAYISI */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <div className="text-[11px] font-black tracking-wider text-slate-400 dark:text-slate-500 uppercase pb-2">
                  SİPARİŞ TİPİNE GÖRE NÜSHA SAYISI
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                    <span>Masa Siparişi</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={copies.table_order}
                      onChange={(e) => setCopies({ ...copies, table_order: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-center font-black text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                    <span>Gel Al Sipariş</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={copies.takeaway_order}
                      onChange={(e) => setCopies({ ...copies, takeaway_order: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-center font-black text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                    <span>Paket Sipariş</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={copies.delivery_order}
                      onChange={(e) => setCopies({ ...copies, delivery_order: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-center font-black text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                    <span>Ödeme Sonrası</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={copies.post_payment}
                      onChange={(e) => setCopies({ ...copies, post_payment: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-center font-black text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* BU CİHAZA ATA */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <div className="text-[11px] font-black tracking-wider text-slate-400 dark:text-slate-500 uppercase pb-1">
                BU CİHAZA ATA
              </div>
              <GreenToggle
                label="Bu Cihaza Ata"
                checked={assignToThisDevice}
                onChange={setAssignToThisDevice}
              />
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            {config && onDelete && (
              <button
                type="button"
                onClick={() => {
                  sound.warning();
                  if (confirm(`"${name}" yazıcı ayarlarını sıfırlamak/silmek istediğinize emin misiniz?`)) {
                    onDelete(config.id || config.target_printer);
                  }
                }}
                className="px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ayarları Sıfırla</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                sound.beep();
                onClose();
              }}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Vazgeç
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-8 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Güncelle</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
