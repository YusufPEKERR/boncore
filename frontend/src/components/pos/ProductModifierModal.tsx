import React, { useState } from 'react';
import { X, Check, Flame, PauseCircle, PlayCircle, Plus } from 'lucide-react';
import { Product, ProductVariant, SelectedModifier, OrderItem } from '../../types';
import { sound } from '../../services/sound';

interface ProductModifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onAddToCart: (item: OrderItem) => void;
}

export const ProductModifierModal: React.FC<ProductModifierModalProps> = ({
  isOpen,
  onClose,
  product,
  onAddToCart
}) => {
  if (!isOpen || !product) return null;

  const defaultVariant = product.variants?.find(v => v.is_default) || product.variants?.[0] || null;
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(defaultVariant);
  const [selectedModifiers, setSelectedModifiers] = useState<SelectedModifier[]>([]);
  const [negativeModifiers, setNegativeModifiers] = useState<string[]>([]);
  const [kitchenNote, setKitchenNote] = useState<string>('');
  const [courseStage, setCourseStage] = useState<number>(1);
  const [isHold, setIsHold] = useState<boolean>(false);
  const [quantity, setQuantity] = useState<number>(1);

  // Common negative tags
  const negativeOptions = ["Soğansız", "Buzsuz", "Domatessiz", "Tuzsuz", "Glutensiz", "Acısız", "Yeşilliksiz"];

  const handleToggleNegative = (tag: string) => {
    sound.beep();
    if (negativeModifiers.includes(tag)) {
      setNegativeModifiers(negativeModifiers.filter(t => t !== tag));
    } else {
      setNegativeModifiers([...negativeModifiers, tag]);
    }
  };

  const handleToggleModifierOption = (groupName: string, optionName: string, price: number, maxSelection: number) => {
    sound.beep();
    const exists = selectedModifiers.find(m => m.group === groupName && m.name === optionName);
    if (exists) {
      setSelectedModifiers(selectedModifiers.filter(m => !(m.group === groupName && m.name === optionName)));
    } else {
      if (maxSelection === 1) {
        // Single selection in group
        const filtered = selectedModifiers.filter(m => m.group !== groupName);
        setSelectedModifiers([...filtered, { group: groupName, name: optionName, price }]);
      } else {
        setSelectedModifiers([...selectedModifiers, { group: groupName, name: optionName, price }]);
      }
    }
  };

  // Calculate Unit Price
  const variantDelta = selectedVariant ? selectedVariant.price_delta : 0;
  const modifiersTotal = selectedModifiers.reduce((sum, m) => sum + m.price, 0);
  const calculatedUnitPrice = product.base_price + variantDelta + modifiersTotal;
  const grandTotal = calculatedUnitPrice * quantity;

  const handleConfirm = () => {
    sound.beep();
    const orderItem: OrderItem = {
      product_id: product.id,
      product_name: product.name,
      variant_name: selectedVariant ? selectedVariant.name : undefined,
      unit_price: calculatedUnitPrice,
      quantity: quantity,
      total_price: grandTotal,
      selected_modifiers: selectedModifiers,
      negative_modifiers: negativeModifiers,
      kitchen_note: kitchenNote,
      course_stage: courseStage,
      is_hold: isHold,
      status: isHold ? 'hold' : 'pending',
      station: product.station
    };

    onAddToCart(orderItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none font-sans animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{product.name}</h3>
              {product.is_spicy && <span className="text-xs bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 px-2 py-0.5 rounded-md font-bold">Acı</span>}
              {product.is_vegan && <span className="text-xs bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 px-2 py-0.5 rounded-md font-bold">Vegan</span>}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{product.description || 'Seçenek ve modifikatörleri belirleyiniz.'}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modifier Options */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
          {/* 1. Variants / Portions */}
          {product.variants && product.variants.length > 0 && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 block">
                Porsiyon / Boyut Seçimi
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id || v.name}
                    onClick={() => { sound.beep(); setSelectedVariant(v); }}
                    className={`p-3 rounded-2xl border text-left transition ${
                      selectedVariant?.name === v.name
                        ? 'bg-blue-600 border-blue-400 text-white shadow-md font-bold'
                        : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold">{v.name}</div>
                    <div className="text-[11px] opacity-80 font-mono">
                      {v.price_delta > 0 ? `+₺${v.price_delta}` : 'Standart'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Modifier Groups (Pişme, Soslar, Ekstralar) */}
          {product.modifier_groups?.map((group) => (
            <div key={group.id || group.name}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {group.name}
                </label>
                {group.is_required && (
                  <span className="text-[10px] bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 px-1.5 py-0.5 rounded font-bold">
                    Zorunlu
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.options.map((opt) => {
                  const isSelected = !!selectedModifiers.find(m => m.group === group.name && m.name === opt.name);
                  return (
                    <button
                      key={opt.id || opt.name}
                      onClick={() => handleToggleModifierOption(group.name, opt.name, opt.price, group.max_selection)}
                      className={`p-2.5 rounded-2xl border text-left transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-amber-50 dark:bg-amber-600/30 border-amber-400 text-amber-900 dark:text-amber-200 font-bold'
                          : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-xs font-semibold">{opt.name}</span>
                      <span className="text-[11px] font-mono opacity-90 font-bold">
                        {opt.price > 0 ? `+₺${opt.price}` : 'Ücretsiz'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* 3. Negative Modifiers ("Soğansız", "Buzsuz") */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 block">
              Çıkarılabilir Malzemeler (Eksi Malzeme)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {negativeOptions.map((tag) => {
                const isSelected = negativeModifiers.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => handleToggleNegative(tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      isSelected
                        ? 'bg-red-50 border-red-300 text-red-600 dark:bg-red-500/20 dark:border-red-500 dark:text-red-300'
                        : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {isSelected ? `✕ ${tag}` : `+ ${tag}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Course Stage & Hold/Fire (Servis Sıralaması) */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60">
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1.5">Servis Sırası (Kurs):</label>
              <div className="flex gap-1">
                {[1, 2, 3].map((c) => (
                  <button
                    key={c}
                    onClick={() => { sound.beep(); setCourseStage(c); }}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition ${
                      courseStage === c
                        ? 'bg-blue-600 border-blue-400 text-white'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {c}. Kurs
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1.5">Mutfak Durumu:</label>
              <button
                onClick={() => { sound.beep(); setIsHold(!isHold); }}
                className={`w-full py-1.5 px-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
                  isHold
                    ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-500/20 dark:border-amber-500 dark:text-amber-300'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-500 dark:text-emerald-300'
                }`}
              >
                {isHold ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
                <span>{isHold ? 'Beklet (Hold)' : 'Direkt Pişir (Fire)'}</span>
              </button>
            </div>
          </div>

          {/* 5. Custom Kitchen Note */}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">Özel Mutfak Notu:</label>
            <input
              type="text"
              value={kitchenNote}
              onChange={(e) => setKitchenNote(e.target.value)}
              placeholder="Örn: Sos ayrı kapta gelsin, iyi kızarsın..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Bottom Bar: Quantity + Add To Cart */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => { sound.beep(); setQuantity(Math.max(1, quantity - 1)); }}
              className="w-9 h-9 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-bold text-lg flex items-center justify-center shadow-sm"
            >
              -
            </button>
            <span className="w-8 text-center font-black text-sm text-slate-900 dark:text-white font-mono">{quantity}</span>
            <button
              onClick={() => { sound.beep(); setQuantity(quantity + 1); }}
              className="w-9 h-9 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-bold text-lg flex items-center justify-center shadow-sm"
            >
              +
            </button>
          </div>

          <button
            onClick={handleConfirm}
            className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <span>SEPETE EKLE</span>
            <span className="font-mono text-white/90">₺{grandTotal.toFixed(2)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
