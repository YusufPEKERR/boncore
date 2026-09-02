import React, { useState, useEffect } from 'react';
import { 
  X, Banknote, CreditCard, Sparkles, Users, 
  Receipt, ArrowRight, CheckCircle2, RotateCcw, DollarSign, Plus 
} from 'lucide-react';
import { Table, Order, PaymentItem, PaymentMethodConfig } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

const getMethodColor = (id: string) => {
  switch (id) {
    case 'credit_card':
      return 'from-blue-600 to-indigo-600';
    case 'cash':
      return 'from-emerald-600 to-teal-600';
    case 'sodexo':
      return 'from-orange-600 to-amber-600';
    case 'multinet':
      return 'from-purple-600 to-pink-600';
    case 'ticket':
      return 'from-red-600 to-rose-600';
    case 'open_account':
      return 'from-slate-700 to-zinc-800';
    default:
      return 'from-indigo-600 to-purple-600';
  }
};

const defaultPaymentMethodsFallback: PaymentMethodConfig[] = [
  { id: 'credit_card', name: 'Kredi Kartı', icon: '💳', desc: 'Fiziki POS ve temassız çekim', is_active: true },
  { id: 'cash', name: 'Nakit Para', icon: '💵', desc: 'Kasada anlık nakit tahsilat', is_active: true },
  { id: 'sodexo', name: 'Sodexo', icon: '🍱', desc: 'Yemek kartı entegrasyonu', is_active: true },
  { id: 'multinet', name: 'Multinet', icon: '💳', desc: 'Multinet kart ve karekod', is_active: true },
  { id: 'ticket', name: 'Ticket Edenred', icon: '🎫', desc: 'Edenred yemek kartı', is_active: true },
  { id: 'open_account', name: 'Açık Hesap / Veresiye', icon: '📋', desc: 'Cari müşteri borçlandırma', is_active: true }
];

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  table: Table | null;
  cashierName: string;
  onPaymentCompleted: () => void;
  onViewFiscal: (orderId: number) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  orderId,
  table,
  cashierName,
  onPaymentCompleted,
  onViewFiscal
}) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Available Active Payment Methods from Settings
  const [availableMethods, setAvailableMethods] = useState<PaymentMethodConfig[]>(defaultPaymentMethodsFallback);

  // Payment Mode: 'mixed' (Parçalı), 'split_equal' (Eşit Bölme), 'split_item' (Ürün Bazlı)
  const [mode, setMode] = useState<'mixed' | 'split_equal' | 'split_item'>('mixed');

  // Mixed Payment Form
  const [currentMethod, setCurrentMethod] = useState<string>('credit_card');
  const [payAmount, setPayAmount] = useState<string>('');
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [roundingAmount, setRoundingAmount] = useState<number>(0);
  const [paymentEntries, setPaymentEntries] = useState<any[]>([]);

  // Split Equal State
  const [splitPersons, setSplitPersons] = useState<number>(2);

  // Split Itemized State
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);

  useEffect(() => {
    if (isOpen && orderId) {
      loadOrderData();
      loadActivePaymentMethods();
    }
  }, [isOpen, orderId]);

  const loadActivePaymentMethods = async () => {
    try {
      const data = await api.getSettings();
      if (data && data.payment_methods && Array.isArray(data.payment_methods)) {
        const activeOnly = data.payment_methods.filter((m: PaymentMethodConfig) => m.is_active);
        if (activeOnly.length > 0) {
          setAvailableMethods(activeOnly);
          setCurrentMethod(prev => activeOnly.some((m: PaymentMethodConfig) => m.id === prev) ? prev : activeOnly[0].id);
        } else {
          setAvailableMethods(defaultPaymentMethodsFallback);
        }
      } else {
        const cached = localStorage.getItem('boncore_payment_methods');
        if (cached) {
          const parsed = JSON.parse(cached);
          const activeOnly = parsed.filter((m: PaymentMethodConfig) => m.is_active);
          if (activeOnly.length > 0) {
            setAvailableMethods(activeOnly);
            setCurrentMethod(prev => activeOnly.some((m: PaymentMethodConfig) => m.id === prev) ? prev : activeOnly[0].id);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch settings for payment methods, using cache:', e);
      const cached = localStorage.getItem('boncore_payment_methods');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const activeOnly = parsed.filter((m: PaymentMethodConfig) => m.is_active);
          if (activeOnly.length > 0) {
            setAvailableMethods(activeOnly);
            setCurrentMethod(prev => activeOnly.some((m: PaymentMethodConfig) => m.id === prev) ? prev : activeOnly[0].id);
          }
        } catch (err) {}
      }
    }
  };

  const loadOrderData = async () => {
    setLoading(true);
    try {
      const data = await api.getOrder(orderId);
      setOrder(data);
      setPayAmount(data.remaining_total.toFixed(2));
      setPaymentEntries([]);
    } catch (e) {
      console.warn('Failed to fetch order', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !order) return null;

  const handleAddPaymentEntry = (method = currentMethod, amount = parseFloat(payAmount)) => {
    if (isNaN(amount) || amount <= 0) return;
    sound.beep();
    const entry = { method, amount, tip: tipAmount };
    const updated = [...paymentEntries, entry];
    setPaymentEntries(updated);

    const totalEntered = updated.reduce((sum, p) => sum + p.amount, 0);
    const newRemaining = Math.max(0, order.remaining_total - totalEntered);
    setPayAmount(newRemaining > 0 ? newRemaining.toFixed(2) : '');
  };

  const handleSettleFull = async () => {
    setLoading(true);
    sound.beep();
    try {
      // If no entries added yet, treat current input as full payment
      const paymentsToSend = paymentEntries.length > 0 
        ? paymentEntries 
        : [{ method: currentMethod, amount: parseFloat(payAmount) || order.remaining_total, tip: tipAmount }];

      const res = await api.settlePayment({
        order_id: order.id,
        payments: paymentsToSend,
        rounding: roundingAmount,
        cashier_name: cashierName,
        close_table: true
      });

      sound.cashDrawer();
      onPaymentCompleted();
      onClose();
      onViewFiscal(order.id);
    } catch (err: any) {
      alert(err.message || 'Ödeme tamamlanamadı.');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const totalPaidInForm = paymentEntries.reduce((sum, p) => sum + p.amount, 0);
  const remainingInForm = Math.max(0, order.remaining_total - totalPaidInForm);

  // Quick Numpad for Custom Amount
  const handleNumpad = (digit: string) => {
    sound.beep();
    if (digit === 'C') {
      setPayAmount('');
    } else if (digit === '.') {
      if (!payAmount.includes('.')) setPayAmount(prev => prev + '.');
    } else {
      setPayAmount(prev => prev + digit);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none font-sans animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-900 dark:text-slate-100 transition-colors duration-200">
        {/* Header */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-500/30 shadow-sm">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Tahsilat & Ödeme ({table ? `Masa ${table.name}` : 'Paket Servis'})
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold">
                  {order.order_no}
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Kasiyer: {cashierName}</div>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-200/80 dark:bg-slate-800 p-1 rounded-2xl border border-slate-300/60 dark:border-slate-700">
            <button
              onClick={() => { sound.beep(); setMode('mixed'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                mode === 'mixed' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Parçalı / Miks
            </button>
            <button
              onClick={() => { sound.beep(); setMode('split_equal'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                mode === 'split_equal' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Alman Usulü (Eşit)
            </button>
            <button
              onClick={() => { sound.beep(); setMode('split_item'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                mode === 'split_item' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Ürün Seçerek Böl
            </button>
          </div>

          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-50/50 dark:bg-slate-900/50">
          {/* Left Column: Order Bill Breakdown (5 cols) */}
          <div className="md:col-span-5 bg-white dark:bg-slate-950/80 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Adisyon Detayı ({order.items.length} Kalem)
              </h4>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {order.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      <span className="font-bold text-slate-900 dark:text-white mr-1">{it.quantity}x</span> {it.product_name}
                      {it.variant_name && <span className="text-slate-400 text-[10px] ml-1">({it.variant_name})</span>}
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-emerald-400">₺{it.total_price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals Summary Card */}
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400 font-medium">
                <span>Ara Toplam:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">₺{order.subtotal.toFixed(2)}</span>
              </div>
              {order.kuver_total > 0 && (
                <div className="flex justify-between text-indigo-600 dark:text-indigo-300 font-medium">
                  <span>Kuver:</span>
                  <span className="font-mono font-bold">₺{order.kuver_total.toFixed(2)}</span>
                </div>
              )}
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                  <span>İndirim:</span>
                  <span className="font-mono">-₺{order.discount_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-1">
                <span>Genel Toplam:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">₺{order.grand_total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-black bg-amber-50 dark:bg-slate-900 p-3 rounded-2xl border border-amber-200 dark:border-slate-700 shadow-sm">
                <span className="text-amber-800 dark:text-amber-400">Kalan Tutar:</span>
                <span className="font-mono text-amber-700 dark:text-amber-400 text-lg">₺{remainingInForm.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Payment Methods & Numpad Engine (7 cols) */}
          <div className="md:col-span-7 flex flex-col justify-between space-y-4">
            {mode === 'mixed' && (
              <>
                {/* Payment Method Badges (Only Active Methods) */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {availableMethods.map((m) => {
                    const isSel = currentMethod === m.id;
                    const colorGrad = getMethodColor(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { sound.beep(); setCurrentMethod(m.id); }}
                        className={`p-2.5 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer ${
                          isSel
                            ? `bg-gradient-to-tr ${colorGrad} text-white border-white/40 shadow-md scale-[1.02]`
                            : 'bg-white hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="text-lg leading-none">{m.icon || '💳'}</span>
                        <span className="text-[10px] font-black leading-tight truncate max-w-full">{m.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Amount Input & Numpad */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-7 space-y-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Çekilecek Tutar (₺):</label>
                      <input
                        type="text"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-2xl p-3 text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono focus:outline-none focus:border-blue-500 text-center shadow-inner"
                      />
                    </div>

                    {/* Quick Amount Helper Chips */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => setPayAmount(remainingInForm.toFixed(2))}
                        className="py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-extrabold text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 transition"
                      >
                        Tam Tutar
                      </button>
                      <button
                        onClick={() => setPayAmount((remainingInForm / 2).toFixed(2))}
                        className="py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
                      >
                        1/2 Yarısı
                      </button>
                      <button
                        onClick={() => setPayAmount((remainingInForm / 3).toFixed(2))}
                        className="py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
                      >
                        1/3 Üçte Biri
                      </button>
                    </div>

                    {/* Add Partial Payment Entry */}
                    <button
                      onClick={() => handleAddPaymentEntry()}
                      className="w-full py-2.5 rounded-2xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-extrabold text-xs border border-slate-300 dark:border-slate-600 transition flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Bu Tutarı Ekle ({availableMethods.find(m => m.id === currentMethod)?.name || currentMethod.toUpperCase()})</span>
                    </button>
                  </div>

                  {/* Touch Numpad */}
                  <div className="col-span-5 grid grid-cols-3 gap-1.5">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '.'].map((k) => (
                      <button
                        key={k}
                        onClick={() => handleNumpad(k)}
                        className="h-10 rounded-xl bg-white hover:bg-slate-100 active:bg-blue-600 active:text-white dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-mono font-black text-base border border-slate-200 dark:border-slate-700 shadow-sm transition flex items-center justify-center"
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Added Payments List */}
                {paymentEntries.length > 0 && (
                  <div className="p-2.5 bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Eklenen Ödemeler:</div>
                    {paymentEntries.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-0.5">
                        <span className="capitalize text-slate-700 dark:text-slate-300 font-semibold">• {p.method.replace('_', ' ')}</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">₺{p.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {mode === 'split_equal' && (
              <div className="space-y-4">
                <div className="p-4 bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-sm">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-2">Kaç Kişiye Eşit Bölünecek?</span>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => { sound.beep(); setSplitPersons(Math.max(2, splitPersons - 1)); }}
                      className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-900 dark:text-white font-bold text-xl transition cursor-pointer"
                    >
                      -
                    </button>
                    <span className="text-3xl font-black text-slate-900 dark:text-white font-mono">{splitPersons} Kişi</span>
                    <button
                      onClick={() => { sound.beep(); setSplitPersons(splitPersons + 1); }}
                      className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-900 dark:text-white font-bold text-xl transition cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-3 text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    Kişi Başı: ₺{(order.remaining_total / splitPersons).toFixed(2)}
                  </div>
                </div>

                {/* Quick Method Chips for Split */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <span className="text-[11px] font-bold text-slate-500 mr-1">Ödeyen Yöntemi:</span>
                  {availableMethods.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { sound.beep(); setCurrentMethod(m.id); }}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                        currentMethod === m.id
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      <span>{m.icon}</span>
                      <span>{m.name}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: splitPersons }).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAddPaymentEntry(currentMethod, order.remaining_total / splitPersons)}
                      className="p-3 bg-white dark:bg-slate-800 hover:bg-blue-600 hover:text-white rounded-2xl border border-slate-200 dark:border-slate-700 text-left transition group shadow-sm cursor-pointer"
                    >
                      <div className="font-bold text-xs text-slate-800 dark:text-white group-hover:text-white flex items-center justify-between">
                        <span>{idx + 1}. Misafir Payı</span>
                        <span className="text-[10px] opacity-70 group-hover:opacity-100">{availableMethods.find(m => m.id === currentMethod)?.name}</span>
                      </div>
                      <div className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400 group-hover:text-white">
                        ₺{(order.remaining_total / splitPersons).toFixed(2)}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Added Payments List */}
                {paymentEntries.length > 0 && (
                  <div className="p-2.5 bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Eklenen Ödemeler:</div>
                    {paymentEntries.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-0.5">
                        <span className="capitalize text-slate-700 dark:text-slate-300 font-semibold">• {availableMethods.find(m => m.id === p.method)?.name || p.method}</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">₺{p.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mode === 'split_item' && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">Şu Anda Ödenecek Ürünleri Seçiniz:</div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {order.items.map((it) => {
                    const isChecked = selectedItemIds.includes(it.id || 0);
                    return (
                      <div
                        key={it.id}
                        onClick={() => {
                          sound.beep();
                          if (it.id) {
                            setSelectedItemIds(prev => isChecked ? prev.filter(id => id !== it.id) : [...prev, it.id]);
                          }
                        }}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition ${
                          isChecked
                            ? 'bg-blue-50 dark:bg-blue-600/30 border-blue-500 text-blue-900 dark:text-white font-bold'
                            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="text-xs font-semibold">{it.quantity}x {it.product_name}</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-emerald-400">₺{it.total_price.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Method selector for itemized split */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    <span className="text-[11px] font-bold text-slate-500 mr-1">Ödeme Yöntemi:</span>
                    {availableMethods.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { sound.beep(); setCurrentMethod(m.id); }}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                          currentMethod === m.id
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        <span>{m.icon}</span>
                        <span>{m.name}</span>
                      </button>
                    ))}
                  </div>

                  {selectedItemIds.length > 0 && (
                    <button
                      onClick={() => {
                        const total = order.items
                          .filter(it => selectedItemIds.includes(it.id || 0))
                          .reduce((s, it) => s + it.total_price, 0);
                        handleAddPaymentEntry(currentMethod, total);
                        setSelectedItemIds([]);
                      }}
                      className="w-full py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>
                        Seçili Ürünleri Ekle (₺{order.items.filter(it => selectedItemIds.includes(it.id || 0)).reduce((s, it) => s + it.total_price, 0).toFixed(2)})
                      </span>
                    </button>
                  )}
                </div>

                {/* Added Payments List */}
                {paymentEntries.length > 0 && (
                  <div className="p-2.5 bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Eklenen Ödemeler:</div>
                    {paymentEntries.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-0.5">
                        <span className="capitalize text-slate-700 dark:text-slate-300 font-semibold">• {availableMethods.find(m => m.id === p.method)?.name || p.method}</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">₺{p.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Finalize Button */}
            <button
              onClick={handleSettleFull}
              disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-[#27ae60] hover:bg-[#219653] text-white font-black text-sm shadow-xl shadow-emerald-600/20 transition flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>TAHSİLATI TAMAMLA & MASAYI KAPAT</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
