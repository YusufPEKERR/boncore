import React, { useState } from 'react';
import {
  Monitor, ShoppingBag, Plus, Minus, CreditCard, CheckCircle2,
  Sparkles, Utensils, Tv, Volume2, Trash2
} from 'lucide-react';
import { Category, Product } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface KioskCfdViewProps {
  categories: Category[];
}

export const KioskCfdView: React.FC<KioskCfdViewProps> = ({ categories }) => {
  const [mode, setMode] = useState<'kiosk' | 'cfd'>('kiosk');
  const [selectedCatId, setSelectedCatId] = useState<number | null>(
    categories.length > 0 ? categories[0].id : null
  );
  const [cart, setCart] = useState<Array<{ product: Product; qty: number }>>([]);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [customerName, setCustomerName] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [lastTicket, setLastTicket] = useState<{ queue_number: string; total: number; order_id: number } | null>(null);

  // Queue numbers for CFD screen
  const [preparingQueue, setPreparingQueue] = useState<string[]>(['#K-104', '#K-105', '#K-106']);
  const [readyQueue, setReadyQueue] = useState<string[]>(['#K-101', '#K-102', '#K-103']);

  const activeCategory = categories.find(c => c.id === selectedCatId) || categories[0];

  const addToCart = (prod: Product) => {
    sound.beep();
    setCart(prev => {
      const existing = prev.find(i => i.product.id === prod.id);
      if (existing) {
        return prev.map(i => i.product.id === prod.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { product: prod, qty: 1 }];
    });
  };

  const updateQty = (prodId: number, delta: number) => {
    sound.beep();
    setCart(prev =>
      prev
        .map(i => i.product.id === prodId ? { ...i, qty: i.qty + delta } : i)
        .filter(i => i.qty > 0)
    );
  };

  const totalAmount = cart.reduce((sum, i) => sum + (i.product.base_price || 0) * i.qty, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      sound.cashDrawer();
      const res = await api.submitKioskOrder({
        customer_name: customerName.trim() || 'Kiosk Misafiri',
        order_type: orderType,
        payment_method: 'credit_card',
        items: cart.map(i => ({ product_id: i.product.id, quantity: i.qty }))
      });
      if (res && res.queue_number) {
        setLastTicket({
          queue_number: res.queue_number,
          total: res.total_amount || totalAmount,
          order_id: res.order_id
        });
        setPreparingQueue(prev => [res.queue_number, ...prev]);
        setCart([]);
        setCustomerName('');
      }
    } catch (e) {
      console.error('Kiosk order error', e);
    } finally {
      setSubmitting(false);
    }
  };

  const promoteToReady = (qNum: string) => {
    sound.cashDrawer();
    setPreparingQueue(prev => prev.filter(x => x !== qNum));
    setReadyQueue(prev => [qNum, ...prev]);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none">
      {/* Top Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              Self-Servis Kiosk & Müşteri Çağrı Ekranı (CFD)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white uppercase">
              Adisyo Kiosk + CFD
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Müşterilerin dokunmatik ekrandan kendi siparişini oluşturup ödediği Kiosk modu ve sipariş sıra çağrı ekranı.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.beep(); setMode('kiosk'); }}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
              mode === 'kiosk'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>Dokunmatik Kiosk Modu</span>
          </button>
          <button
            onClick={() => { sound.beep(); setMode('cfd'); }}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
              mode === 'cfd'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>Müşteri Sıra & Bilgi Ekranı (CFD)</span>
          </button>
        </div>
      </div>

      {mode === 'cfd' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Preparing Column */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 text-white space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Utensils className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-black uppercase tracking-wider text-amber-400">Hazırlanıyor (Mutfakta)</h2>
              </div>
              <span className="text-xs font-bold text-slate-400">Tıklayarak Hazıra Aktarın</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {preparingQueue.map((q) => (
                <button
                  key={q}
                  onClick={() => promoteToReady(q)}
                  className="p-5 rounded-2xl bg-slate-800/90 hover:bg-amber-500/20 border border-amber-500/40 text-center transition cursor-pointer"
                >
                  <div className="text-2xl font-black text-amber-300 font-mono">{q}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1">Hazır İşaretle →</div>
                </button>
              ))}
            </div>
          </div>

          {/* Ready Column */}
          <div className="rounded-3xl bg-emerald-950 border border-emerald-800 p-6 text-white space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-emerald-800 pb-3">
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-emerald-400 animate-pulse" />
                <h2 className="text-lg font-black uppercase tracking-wider text-emerald-300">Hazır! Teslim Alabilirsiniz</h2>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950">
                CANLI EKRAN
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {readyQueue.map((q) => (
                <div
                  key={q}
                  onClick={() => setReadyQueue(prev => prev.filter(x => x !== q))}
                  className="p-5 rounded-2xl bg-emerald-600 text-white text-center shadow-lg cursor-pointer hover:opacity-90 transition"
                >
                  <div className="text-2xl font-black font-mono">{q}</div>
                  <div className="text-[10px] font-bold text-emerald-100 mt-1">Teslim Edildi (Kaldır)</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Categories & Products (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Category Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { sound.beep(); setSelectedCatId(cat.id); }}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
                    (activeCategory && activeCategory.id === cat.id)
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Product Touch Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {(activeCategory?.products || []).map((prod) => (
                <button
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-500 shadow-sm hover:shadow-md transition text-left flex flex-col justify-between gap-3 cursor-pointer group"
                >
                  <div>
                    <div className="font-black text-sm text-slate-900 dark:text-white group-hover:text-rose-600 transition">
                      {prod.name}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Dokun & Sepete Ekle</div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="font-black text-base text-rose-600 dark:text-rose-400">
                      ₺{(prod.base_price || 0).toFixed(2)}
                    </span>
                    <span className="w-7 h-7 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Kiosk Checkout Basket (4 cols) */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 flex flex-col justify-between space-y-4 shadow-lg">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-black text-base text-slate-900 dark:text-white">Kiosk Sipariş Sepeti</h3>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[11px] font-bold">
                  <button
                    onClick={() => setOrderType('dine_in')}
                    className={`px-2.5 py-1 rounded-lg cursor-pointer ${orderType === 'dine_in' ? 'bg-rose-600 text-white' : ''}`}
                  >
                    Restoranda
                  </button>
                  <button
                    onClick={() => setOrderType('takeaway')}
                    className={`px-2.5 py-1 rounded-lg cursor-pointer ${orderType === 'takeaway' ? 'bg-rose-600 text-white' : ''}`}
                  >
                    Paket Al-Götür
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="İsminiz (Çağrı ekranı için opsiyonel)"
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              />

              {cart.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 font-semibold">
                  Sepetiniz boş. Sol taraftan ürünlere dokunarak ekleyebilirsiniz.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-slate-900 dark:text-white truncate">{item.product.name}</div>
                        <div className="text-[11px] text-rose-600 font-bold">₺{((item.product.base_price || 0) * item.qty).toFixed(2)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(item.product.id, -1)}
                          className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-black w-5 text-center">{item.qty}</span>
                        <button
                          onClick={() => updateQty(item.product.id, 1)}
                          className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Ödenecek Toplam</span>
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                  ₺{totalAmount.toFixed(2)}
                </span>
              </div>

              <button
                disabled={cart.length === 0 || submitting}
                onClick={handleCheckout}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer"
              >
                <CreditCard className="w-5 h-5" />
                <span>{submitting ? 'Sipariş Gönderiliyor...' : 'Temassız Öde & Siparişi Tamamla'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kiosk Ticket Confirmation Modal */}
      {lastTicket && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">Siparişiniz Alındı!</h3>
            <p className="text-xs text-slate-500">Siparişiniz doğrudan mutfak ekranına (KDS) iletildi.</p>
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800">
              <div className="text-[11px] font-bold text-slate-400 uppercase">Sıra Numaranız</div>
              <div className="text-4xl font-black text-rose-600 font-mono mt-1">{lastTicket.queue_number}</div>
              <div className="text-xs font-bold text-slate-500 mt-1">Ödenen: ₺{lastTicket.total.toFixed(2)}</div>
            </div>
            <button
              onClick={() => setLastTicket(null)}
              className="w-full py-3 rounded-2xl bg-rose-600 text-white font-black text-xs cursor-pointer"
            >
              Yeni Kiosk Siparişi
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
