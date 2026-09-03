import React, { useState, useEffect } from 'react';
import { 
  Save, Printer, X, History, ArrowLeft, Check, Percent, Tag, 
  Users, ChevronRight, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { Table, Order, PaymentItem, PaymentMethodConfig } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  table: Table | null;
  cashierName: string;
  onPaymentCompleted: () => void;
  onViewFiscal: (orderId: number) => void;
}

// 👆 Hand touch pointer icon matching reference image
const TouchHandIcon = ({ active }: { active?: boolean }) => (
  <svg 
    className={`w-5 h-5 transition-colors ${active ? 'text-red-600' : 'text-gray-700'}`} 
    viewBox="0 0 24 24" 
    fill="currentColor"
  >
    {/* Touch wave / ripple */}
    <path 
      d="M13.8 2.2a4.5 4.5 0 0 0-4.5 4.5v3.8c-.3-.2-.7-.4-1.1-.5a2.5 2.5 0 0 0-2.9 2.5v4.5a8 8 0 0 0 8 8h3.2a7 7 0 0 0 7-7v-4.5a2.5 2.5 0 0 0-2.5-2.5c-.4 0-.8.1-1.1.3v-1.6a2.5 2.5 0 0 0-2.5-2.5c-.3 0-.6.1-.9.2V6.7a2.5 2.5 0 0 0-2.7-4.5z" 
      opacity="0.2"
    />
    <path d="M12.5 3.5a1.5 1.5 0 0 1 1.5 1.5v6.5h1V8a1.5 1.5 0 0 1 3 0v3.5h1V9.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-2.8a7 7 0 0 1-7-7v-3.5a1.5 1.5 0 0 1 2.8-.7l1.5 2.2V5a1.5 1.5 0 0 1 2-1.5z"/>
  </svg>
);

// 💵 Realistic green banknotes stack icon
const CashStackIcon = () => (
  <div className="w-16 h-12 flex items-center justify-center">
    <svg viewBox="0 0 64 48" className="w-full h-full drop-shadow-sm">
      {/* Bottom bill */}
      <path d="M6 34 L32 20 L58 34 L32 46 Z" fill="#2e7d32" stroke="#1b5e20" strokeWidth="1" />
      {/* Middle bill */}
      <path d="M6 28 L32 14 L58 28 L32 40 Z" fill="#388e3c" stroke="#1b5e20" strokeWidth="1" />
      {/* Top bill */}
      <path d="M6 22 L32 8 L58 22 L32 34 Z" fill="#4caf50" stroke="#2e7d32" strokeWidth="1" />
      <ellipse cx="32" cy="21" rx="7" ry="4" fill="#81c784" stroke="#2e7d32" strokeWidth="1" />
      {/* White band */}
      <path d="M26 12 L38 18 L38 32 L26 26 Z" fill="#f8f9fa" opacity="0.95" stroke="#cfd8dc" strokeWidth="0.8" />
    </svg>
  </div>
);

// 💳 Visa & Mastercard logos icon
const CreditCardLogosIcon = () => (
  <div className="w-16 h-12 flex flex-col items-center justify-center gap-1">
    <div className="flex items-center -space-x-2">
      <div className="w-5 h-5 rounded-full bg-[#eb001b]" />
      <div className="w-5 h-5 rounded-full bg-[#f79e1b] opacity-90" />
    </div>
    <span className="text-[11px] font-black tracking-widest text-[#1a1f71] italic leading-none font-sans">
      VISA
    </span>
  </div>
);

// 🤝 Blue circle with handshake icon
const OpenAccountHandshakeIcon = () => (
  <div className="w-12 h-12 rounded-full bg-[#2072c4] flex items-center justify-center shadow-sm">
    <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.5 7.5l-4-4a2.12 2.12 0 0 0-3 0L10 6 7.5 3.5a2.12 2.12 0 0 0-3 0l-1 1a2.12 2.12 0 0 0 0 3L6 10l-2.5 2.5a2.12 2.12 0 0 0 0 3l5 5a2.12 2.12 0 0 0 3 0l6-6a2.12 2.12 0 0 0 0-3L15 9l2.5-2.5a2.12 2.12 0 0 0 2-2zM9 18.5l-4-4L6.5 13l2 2a1 1 0 0 0 1.41 0l4-4 1.5 1.5-6.41 6z"/>
    </svg>
  </div>
);

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

  // Active Tab on Right Panel ('methods' | 'tip')
  const [activeRightTab, setActiveRightTab] = useState<'methods' | 'tip'>('methods');

  // Entered amount on numeric keypad
  const [payAmount, setPayAmount] = useState<string>('0.00');

  // Selected item IDs for partial payment (Parçalı Öde)
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);

  // Item paid amounts tracking (simulated for UI display per item)
  const [itemPaidMap, setItemPaidMap] = useState<Record<number, number>>({});

  // Modals for 1/n, İndirim, and Tahsilat Geçmişi
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState<boolean>(false);
  const [isSplitNModalOpen, setIsSplitNModalOpen] = useState<boolean>(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('10');
  const [splitCount, setSplitCount] = useState<number>(2);

  // Tip state
  const [tipAmount, setTipAmount] = useState<number>(0);

  // Status message / toast
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && orderId) {
      loadOrderData();
    }
  }, [isOpen, orderId]);

  const loadOrderData = async () => {
    setLoading(true);
    try {
      const data = await api.getOrder(orderId);
      setOrder(data);
      setPayAmount(data.remaining_total > 0 ? data.remaining_total.toFixed(2) : '0.00');
      setSelectedItemIds([]);
    } catch (e) {
      console.warn('Failed to fetch order', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !order) return null;

  // Selected items total sum
  const selectedItemsSum = order.items
    .filter(it => it.id && selectedItemIds.includes(it.id))
    .reduce((sum, it) => sum + it.total_price, 0);

  // Toggle item selection for Parçalı Ödeme
  const handleToggleItem = (itemId?: number) => {
    if (!itemId) return;
    sound.beep();
    setSelectedItemIds(prev => {
      const isAlreadySelected = prev.includes(itemId);
      const next = isAlreadySelected ? prev.filter(id => id !== itemId) : [...prev, itemId];
      
      // Update payAmount based on selection
      if (next.length > 0) {
        const sum = order.items
          .filter(it => it.id && next.includes(it.id))
          .reduce((s, it) => s + it.total_price, 0);
        setPayAmount(sum.toFixed(2));
      } else {
        setPayAmount(order.remaining_total.toFixed(2));
      }
      return next;
    });
  };

  // Numpad key press handler
  const handleNumpad = (key: string) => {
    sound.beep();
    if (key === 'Tüm') {
      setSelectedItemIds([]);
      setPayAmount(order.remaining_total.toFixed(2));
      return;
    }
    if (key === '1/n') {
      setIsSplitNModalOpen(true);
      return;
    }
    if (key === 'İndirim') {
      setIsDiscountModalOpen(true);
      return;
    }
    if (key === '←') {
      setPayAmount(prev => {
        if (prev.length <= 1) return '0.00';
        return prev.slice(0, -1);
      });
      return;
    }
    if (key === '.') {
      if (!payAmount.includes('.')) {
        setPayAmount(prev => prev + '.');
      }
      return;
    }

    // Digit 0-9
    setPayAmount(prev => {
      if (prev === '0.00' || prev === '0') return key;
      return prev + key;
    });
  };

  // Apply Split 1/n
  const handleApplySplitN = (n: number) => {
    sound.beep();
    const base = selectedItemIds.length > 0 ? selectedItemsSum : order.remaining_total;
    const divided = (base / n).toFixed(2);
    setPayAmount(divided);
    setIsSplitNModalOpen(false);
    setStatusNotice(`Tutar ${n} kişiye bölündü: ₺${divided}`);
    setTimeout(() => setStatusNotice(null), 3000);
  };

  // Apply Discount
  const handleApplyDiscount = async () => {
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) return;
    setLoading(true);
    sound.beep();
    try {
      await api.applyDiscount(
        order.id,
        discountType,
        val,
        'Kasa İndirimi',
        cashierName
      );
      await loadOrderData();
      setIsDiscountModalOpen(false);
      setStatusNotice('İndirim başarıyla uygulandı.');
      setTimeout(() => setStatusNotice(null), 3000);
    } catch (err: any) {
      alert(err.message || 'İndirim uygulanamadı.');
    } finally {
      setLoading(false);
    }
  };

  // Perform Settlement with chosen payment method
  const handleProcessPayment = async (method: string, shouldPrint: boolean = false, shouldCloseTable: boolean = true) => {
    const amountToPay = parseFloat(payAmount);
    if (isNaN(amountToPay) || amountToPay <= 0) {
      alert('Lütfen geçerli bir ödeme tutarı giriniz.');
      return;
    }

    setLoading(true);
    sound.beep();

    try {
      const res = await api.settlePayment({
        order_id: order.id,
        payments: [{
          method,
          amount: amountToPay,
          tip: tipAmount
        }],
        rounding: 0,
        cashier_name: cashierName,
        close_table: shouldCloseTable
      });

      sound.cashDrawer();

      // If items were selected, mark them as paid in state
      if (selectedItemIds.length > 0) {
        setItemPaidMap(prev => {
          const next = { ...prev };
          selectedItemIds.forEach(id => {
            const it = order.items.find(item => item.id === id);
            if (it) next[id] = it.total_price;
          });
          return next;
        });
        setSelectedItemIds([]);
      }

      if (shouldPrint) {
        onViewFiscal(order.id);
      }

      if (res.is_fully_paid && shouldCloseTable) {
        onPaymentCompleted();
        onClose();
      } else {
        // Refresh local order data for partial payment
        await loadOrderData();
        setStatusNotice(`₺${amountToPay.toFixed(2)} tahsil edildi (${method === 'cash' ? 'Nakit' : method === 'credit_card' ? 'Kredi Kartı' : 'Açık Hesap'}).`);
        setTimeout(() => setStatusNotice(null), 3500);
      }
    } catch (err: any) {
      alert(err.message || 'Ödeme işlemi tamamlanamadı.');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  // Save changes without closing
  const handleSaveOnly = () => {
    sound.beep();
    onPaymentCompleted();
    onClose();
  };

  const waiterName = order.waiter_name || cashierName || 'YUSUF PEKER';
  const tableName = table ? table.name : (order.table_name || 'MASA 100');

  return (
    <div className="fixed inset-0 z-50 bg-[#f4f5f7] text-[#212529] flex flex-col select-none font-sans overflow-hidden animate-fadeIn">
      {/* ================= TOP HEADER BAR ================= */}
      <header className="bg-white border-b border-gray-200/90 px-6 py-3 flex items-center justify-between shadow-xs">
        {/* Left: Table & Waiter info */}
        <div>
          <h1 className="text-[15px] font-bold text-[#212529] tracking-tight leading-tight">
            Masa Adı: <span className="font-extrabold">{tableName}</span>
          </h1>
          <div className="text-[13px] text-gray-500 font-medium leading-tight">
            Garson: {waiterName}
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-6 text-[#d32f2f] text-[13px] font-semibold">
          {/* Kaydet */}
          <button 
            onClick={handleSaveOnly}
            className="flex items-center gap-1.5 hover:text-red-700 transition cursor-pointer active:scale-95"
          >
            <Save className="w-4 h-4 text-[#d32f2f]" />
            <span>Kaydet</span>
          </button>

          {/* Öde ve Kapat */}
          <button 
            onClick={() => handleProcessPayment('cash', false, true)}
            className="flex items-center gap-1.5 hover:text-red-700 transition cursor-pointer active:scale-95"
          >
            <Save className="w-4 h-4 text-[#d32f2f]" />
            <span>Öde ve Kapat</span>
          </button>

          {/* Öde ve Yazdır */}
          <button 
            onClick={() => handleProcessPayment('cash', true, false)}
            className="flex items-center gap-1.5 hover:text-red-700 transition cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4 text-[#d32f2f]" />
            <span>Öde ve Yazdır</span>
          </button>

          {/* Öde, Yazdır ve Kapat */}
          <button 
            onClick={() => handleProcessPayment('cash', true, true)}
            className="flex items-center gap-1.5 hover:text-red-700 transition cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4 text-[#d32f2f]" />
            <span>Öde, Yazdır ve Kapat</span>
          </button>

          {/* Ödeme Ekranını Kapat */}
          <button 
            onClick={onClose}
            className="flex items-center gap-1.5 hover:text-red-700 transition cursor-pointer active:scale-95 ml-2"
          >
            <X className="w-4 h-4 text-[#d32f2f]" />
            <span>Ödeme Ekranını Kapat</span>
          </button>
        </div>
      </header>

      {/* ================= STATUS NOTIFICATION TOAST ================= */}
      {statusNotice && (
        <div className="bg-emerald-600 text-white text-xs font-bold py-1.5 px-4 text-center shadow-sm animate-slideDown">
          {statusNotice}
        </div>
      )}

      {/* ================= MAIN THREE-COLUMN CONTAINER ================= */}
      <main className="flex-1 p-4 md:p-6 overflow-hidden grid grid-cols-1 md:grid-cols-12 gap-5">
        
        {/* ================= COLUMN 1: PARÇALI ÖDE (Left: 4 cols) ================= */}
        <section className="md:col-span-4 bg-white rounded-2xl border border-gray-200 shadow-xs p-4 flex flex-col justify-between overflow-hidden">
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header: PARÇALI ÖDE and Selected Total */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h2 className="text-[15px] font-bold text-[#212529] tracking-tight">
                PARÇALI ÖDE
              </h2>
              <span className="text-[15px] font-bold text-[#212529] font-mono">
                ₺{selectedItemsSum.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Filter Pill: Ödenmemiş Olanlar */}
            <div className="flex justify-center my-3">
              <span className="bg-[#e9ecef] text-[#495057] px-5 py-1 rounded-full text-xs font-semibold shadow-2xs">
                Ödenmemiş Olanlar
              </span>
            </div>

            {/* Scrollable Products List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1.5 custom-scrollbar">
              {order.items.map((it) => {
                const isSelected = it.id ? selectedItemIds.includes(it.id) : false;
                const paidAmt = (it.id && itemPaidMap[it.id]) || 0;
                const remainingAmt = Math.max(0, it.total_price - paidAmt);

                return (
                  <div
                    key={it.id || Math.random()}
                    onClick={() => handleToggleItem(it.id)}
                    className={`py-2 px-3 rounded-xl border transition cursor-pointer select-none ${
                      isSelected 
                        ? 'bg-red-50/80 border-red-300 shadow-2xs' 
                        : 'border-transparent hover:border-gray-200 hover:bg-gray-50/80'
                    }`}
                  >
                    {/* Top Row: Qty - Name and Price + Hand icon */}
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-[#212529] truncate pr-2">
                        {it.quantity} - (ADET) {it.product_name.toUpperCase()}
                        {it.variant_name && <span className="text-gray-500 text-xs ml-1 font-normal">({it.variant_name})</span>}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[13px] font-bold text-[#212529] font-mono">
                          ₺{it.total_price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                        <TouchHandIcon active={isSelected} />
                      </div>
                    </div>

                    {/* Bottom Row: Ödenen & Kalan */}
                    <div className="text-[11px] text-gray-500 font-medium mt-0.5">
                      Ödenen: ₺{paidAmt.toFixed(2)}  ·  Kalan: ₺{remainingAmt.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-3 mt-2 border-t border-gray-100">
            <button
              onClick={() => {
                sound.beep();
                setIsSplitNModalOpen(true);
              }}
              className="bg-[#f4f5f7] hover:bg-[#eaecef] text-[#d32f2f] font-bold text-xs py-2.5 px-2 rounded-xl border border-gray-200/80 shadow-2xs transition cursor-pointer text-center"
            >
              Ürün Bazlı 1/n
            </button>
            <button
              onClick={() => {
                sound.beep();
                setIsDiscountModalOpen(true);
              }}
              className="bg-[#f4f5f7] hover:bg-[#eaecef] text-[#d32f2f] font-bold text-xs py-2.5 px-2 rounded-xl border border-gray-200/80 shadow-2xs transition cursor-pointer text-center"
            >
              Ürün Bazlı İndirim
            </button>
          </div>
        </section>

        {/* ================= COLUMN 2: TOPLAM & NUMPAD (Center: 5 cols) ================= */}
        <section className="md:col-span-5 bg-white rounded-2xl border border-gray-200 shadow-xs p-5 flex flex-col justify-between">
          {/* Top Header: TOPLAM & Tahsilat Geçmişi & Total Amount */}
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h2 className="text-[15px] font-bold text-[#212529] tracking-tight">
                TOPLAM
              </h2>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    sound.beep();
                    setIsHistoryModalOpen(true);
                  }}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-[#d32f2f] transition cursor-pointer"
                >
                  <History className="w-4 h-4 text-[#d32f2f]" />
                  <span>TAHSİLAT GEÇMİŞİ</span>
                </button>
                <span className="text-[15px] font-bold text-[#212529] font-mono">
                  ₺{order.grand_total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Middle White Display Area with Ödenecek Tutar at bottom */}
            <div className="h-36 flex flex-col justify-end items-end pb-3 pr-2">
              <div className="text-right">
                <span className="text-base md:text-lg font-bold text-[#212529] mr-2">
                  Ödenecek Tutar:
                </span>
                <span className="text-xl md:text-2xl font-black text-[#111827] font-mono">
                  ₺{payAmount}
                </span>
              </div>
            </div>
          </div>

          {/* Numeric Keypad Table Grid */}
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
            {/* Row 1: 7 | 8 | 9 | Tüm */}
            <div className="grid grid-cols-4 border-b border-gray-200">
              {['7', '8', '9', 'Tüm'].map((k) => (
                <button
                  key={k}
                  onClick={() => handleNumpad(k)}
                  className="py-3.5 bg-white hover:bg-gray-50 active:bg-gray-100 border-r border-gray-200 last:border-r-0 text-center font-medium text-lg text-gray-800 transition cursor-pointer"
                >
                  {k === 'Tüm' ? <span className="text-sm font-semibold text-gray-700">Tüm</span> : k}
                </button>
              ))}
            </div>

            {/* Row 2: 4 | 5 | 6 | 1/n */}
            <div className="grid grid-cols-4 border-b border-gray-200">
              {['4', '5', '6', '1/n'].map((k) => (
                <button
                  key={k}
                  onClick={() => handleNumpad(k)}
                  className="py-3.5 bg-white hover:bg-gray-50 active:bg-gray-100 border-r border-gray-200 last:border-r-0 text-center font-medium text-lg text-gray-800 transition cursor-pointer"
                >
                  {k === '1/n' ? <span className="text-sm font-semibold text-gray-700">1/n</span> : k}
                </button>
              ))}
            </div>

            {/* Row 3: 1 | 2 | 3 | İndirim */}
            <div className="grid grid-cols-4 border-b border-gray-200">
              {['1', '2', '3', 'İndirim'].map((k) => (
                <button
                  key={k}
                  onClick={() => handleNumpad(k)}
                  className="py-3.5 bg-white hover:bg-gray-50 active:bg-gray-100 border-r border-gray-200 last:border-r-0 text-center font-medium text-lg text-gray-800 transition cursor-pointer"
                >
                  {k === 'İndirim' ? <span className="text-sm font-semibold text-gray-700">İndirim</span> : k}
                </button>
              ))}
            </div>

            {/* Row 4: . | 0 | ← | Empty */}
            <div className="grid grid-cols-4">
              {['.', '0', '←', ''].map((k, idx) => (
                <button
                  key={idx}
                  onClick={() => k && handleNumpad(k)}
                  disabled={!k}
                  className={`py-3.5 bg-white hover:bg-gray-50 active:bg-gray-100 border-r border-gray-200 last:border-r-0 text-center font-medium text-lg text-gray-800 transition ${
                    k ? 'cursor-pointer' : 'cursor-default bg-gray-50/50'
                  }`}
                >
                  {k === '←' ? <span className="text-xl font-bold">←</span> : k}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ================= COLUMN 3: ÖDEME TİPLERİ (Right: 3 cols) ================= */}
        <section className="md:col-span-3 bg-white rounded-2xl border border-gray-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            {/* Tab Bar: Ödeme Tipleri & Bahşiş ekle */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => { sound.beep(); setActiveRightTab('methods'); }}
                className={`pb-2.5 px-3 text-sm font-bold transition cursor-pointer relative ${
                  activeRightTab === 'methods'
                    ? 'text-[#d32f2f]'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span>Ödeme Tipleri</span>
                {activeRightTab === 'methods' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d32f2f]" />
                )}
              </button>

              <button
                onClick={() => { sound.beep(); setActiveRightTab('tip'); }}
                className={`pb-2.5 px-3 text-sm font-semibold transition cursor-pointer relative ${
                  activeRightTab === 'tip'
                    ? 'text-[#d32f2f] font-bold'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span>Bahşiş ekle</span>
                {activeRightTab === 'tip' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d32f2f]" />
                )}
              </button>
            </div>

            {/* TAB CONTENT 1: Ödeme Tipleri Tiles */}
            {activeRightTab === 'methods' && (
              <div className="grid grid-cols-2 gap-4 pt-5">
                {/* Tile 1: Nakit */}
                <button
                  onClick={() => handleProcessPayment('cash', false, true)}
                  className="border border-gray-200 rounded-xl p-5 bg-white hover:border-emerald-500 hover:shadow-md transition active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-2 group"
                >
                  <CashStackIcon />
                  <span className="font-bold text-sm text-[#212529] group-hover:text-emerald-600 transition">
                    Nakit
                  </span>
                </button>

                {/* Tile 2: Kredi Kartı */}
                <button
                  onClick={() => handleProcessPayment('credit_card', false, true)}
                  className="border border-gray-200 rounded-xl p-5 bg-white hover:border-blue-500 hover:shadow-md transition active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-2 group"
                >
                  <CreditCardLogosIcon />
                  <span className="font-bold text-sm text-[#212529] group-hover:text-blue-600 transition">
                    Kredi Kartı
                  </span>
                </button>

                {/* Tile 3: Açık Hesap */}
                <button
                  onClick={() => handleProcessPayment('open_account', false, true)}
                  className="border border-gray-200 rounded-xl p-5 bg-white hover:border-indigo-500 hover:shadow-md transition active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-2 group"
                >
                  <OpenAccountHandshakeIcon />
                  <span className="font-bold text-sm text-[#212529] group-hover:text-indigo-600 transition">
                    Açık Hesap
                  </span>
                </button>
              </div>
            )}

            {/* TAB CONTENT 2: Bahşiş Ekle */}
            {activeRightTab === 'tip' && (
              <div className="pt-5 space-y-4">
                <span className="text-xs text-gray-500 font-semibold block">Hızlı Bahşiş Oranı:</span>
                <div className="grid grid-cols-2 gap-2">
                  {[5, 10, 15, 20].map((pct) => {
                    const tipVal = (order.remaining_total * pct) / 100;
                    return (
                      <button
                        key={pct}
                        onClick={() => {
                          sound.beep();
                          setTipAmount(tipVal);
                          setPayAmount((order.remaining_total + tipVal).toFixed(2));
                          setActiveRightTab('methods');
                          setStatusNotice(`%${pct} Bahşiş (₺${tipVal.toFixed(2)}) eklendi.`);
                          setTimeout(() => setStatusNotice(null), 3000);
                        }}
                        className="py-2.5 px-3 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-xs font-bold text-gray-800 transition"
                      >
                        %{pct} (₺{tipVal.toFixed(2)})
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <label className="text-xs text-gray-500 font-semibold mb-1 block">Özel Bahşiş Tutarı (₺):</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0.00"
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setTipAmount(val);
                      }}
                      className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold font-mono focus:outline-none focus:border-red-500"
                    />
                    <button
                      onClick={() => {
                        sound.beep();
                        setPayAmount((order.remaining_total + tipAmount).toFixed(2));
                        setActiveRightTab('methods');
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition"
                    >
                      Ekle
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ================= MODAL 1: TAHSİLAT GEÇMİŞİ ================= */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-[#d32f2f] font-bold text-base">
                <History className="w-5 h-5" />
                <span>Tahsilat Geçmişi ({tableName})</span>
              </div>
              <button 
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {order.payments && order.payments.length > 0 ? (
                order.payments.map((p, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-gray-800 capitalize">
                        {p.method === 'cash' ? 'Nakit' : p.method === 'credit_card' ? 'Kredi Kartı' : p.method}
                      </div>
                      <div className="text-gray-500 text-[11px]">
                        {p.created_at ? new Date(p.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Az önce'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-600 text-sm">
                        ₺{p.amount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  Bu adisyon için henüz yapılmış bir tahsilat kaydı bulunmamaktadır.
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: 1/n HESAP BÖLME ================= */}
      {isSplitNModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <span className="font-bold text-base text-gray-800">Hesabı Böl (1/n)</span>
              <button 
                onClick={() => setIsSplitNModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-gray-600 text-center">
              Kaç kişi arasında eşit bölünsün?
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4, 5, 6, 8].map((n) => (
                <button
                  key={n}
                  onClick={() => handleApplySplitN(n)}
                  className="p-3 bg-gray-50 hover:bg-red-50 hover:border-red-300 hover:text-[#d32f2f] rounded-xl border border-gray-200 text-center font-bold text-sm transition"
                >
                  {n} Kişi
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: İNDİRİM UYGULAMA ================= */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <span className="font-bold text-base text-gray-800">İndirim Uygula</span>
              <button 
                onClick={() => setIsDiscountModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setDiscountType('percentage')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  discountType === 'percentage' ? 'bg-white text-red-600 shadow-2xs' : 'text-gray-600'
                }`}
              >
                Yüzde (%)
              </button>
              <button
                onClick={() => setDiscountType('fixed')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  discountType === 'fixed' ? 'bg-white text-red-600 shadow-2xs' : 'text-gray-600'
                }`}
              >
                Tutar (₺)
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">
                {discountType === 'percentage' ? 'İndirim Oranı (%):' : 'İndirim Tutarı (₺):'}
              </label>
              <input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-full border border-gray-300 rounded-xl p-2.5 text-lg font-bold font-mono text-center focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setIsDiscountModalOpen(false)}
                className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
              >
                Vazgeç
              </button>
              <button
                onClick={handleApplyDiscount}
                className="py-2.5 bg-[#d32f2f] hover:bg-red-700 text-white rounded-xl text-xs font-bold transition"
              >
                İndirimi Uygula
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
