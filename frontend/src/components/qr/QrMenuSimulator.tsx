import React, { useState, useEffect } from 'react';
import { 
  QrCode, Smartphone, Bell, Receipt, ShoppingCart, 
  Plus, CheckCircle2, CreditCard, Sparkles, AlertCircle, Printer, X 
} from 'lucide-react';
import { Area, Table, Category, Product } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface QrMenuSimulatorProps {
  areas: Area[];
  onBuzzerSent: () => void;
}

export const QrMenuSimulator: React.FC<QrMenuSimulatorProps> = ({ areas, onBuzzerSent }) => {
  const allTables = areas.flatMap(a => a.tables);
  const [selectedTableId, setSelectedTableId] = useState<number>(allTables[0]?.id || 1);
  const [menuData, setMenuData] = useState<any>(null);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number>(0);
  const [customerCart, setCustomerCart] = useState<any[]>([]);
  const [orderSentMessage, setOrderSentMessage] = useState<string>('');
  const [isVirtualPosOpen, setIsVirtualPosOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (selectedTableId) {
      loadTableQrMenu(selectedTableId);
    }
  }, [selectedTableId]);

  const loadTableQrMenu = async (tableId: number) => {
    try {
      const data = await api.getQrMenu(tableId);
      setMenuData(data);
    } catch (e) {
      console.warn('Failed to load QR menu', e);
    }
  };

  const handleAddToCart = (product: any) => {
    sound.beep();
    setCustomerCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        return prev.map(item => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        price: product.base_price,
        quantity: 1,
        selected_modifiers: [],
        negative_modifiers: []
      }];
    });
  };

  const handleSendOrderFromPhone = async () => {
    if (customerCart.length === 0) return;
    setLoading(true);
    sound.beep();
    try {
      const formattedItems = customerCart.map(i => ({
        product_id: i.product_id,
        unit_price: i.price,
        quantity: i.quantity,
        selected_modifiers: [],
        negative_modifiers: [],
        kitchen_note: 'Masadan QR Sipariş'
      }));

      await api.placeCustomerTableOrder(selectedTableId, formattedItems);
      sound.kitchenBell();
      setCustomerCart([]);
      setOrderSentMessage('Siparişiniz mutfağa iletildi! Afiyet olsun.');
      setTimeout(() => setOrderSentMessage(''), 4000);
      await loadTableQrMenu(selectedTableId);
    } catch (err: any) {
      alert(err.message || 'Sipariş gönderilemedi.');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleCallWaiter = async (reason: string = 'Garson Çağır') => {
    sound.waiterBuzzer();
    try {
      await api.triggerWaiterCall(selectedTableId, reason);
      onBuzzerSent();
      setOrderSentMessage(`${reason} talebiniz garson ekranına iletildi!`);
      setTimeout(() => setOrderSentMessage(''), 3000);
    } catch (e) {
      sound.warning();
    }
  };

  const currentCategory = menuData?.menu?.[activeCategoryIndex];
  const cartTotal = customerCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const selectedTable = allTables.find(t => t.id === selectedTableId);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none transition-colors duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">QR Kod Dijital Menü & Masadan Sipariş</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Müşteri Telefon Simülatörü, Garson Çağırma ve Masada Sanal POS Ödeme</p>
        </div>
      </div>

      {/* Main Grid: QR Generator Card (Left 4 cols) + Mobile Device Simulator (Right 8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Table QR Code Card & Selection (4 cols) */}
        <div className="lg:col-span-4 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-500" />
            <span>Masa Seç & QR Kod Kartı</span>
          </h3>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">Aktif Masa:</label>
            <select
              value={selectedTableId}
              onChange={(e) => { sound.beep(); setSelectedTableId(Number(e.target.value)); }}
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl p-3 text-sm text-slate-900 dark:text-white font-bold"
            >
              {allTables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.status === 'occupied' ? 'Dolu' : 'Boş'})
                </option>
              ))}
            </select>
          </div>

          {/* Printable QR Code Card Template */}
          <div className="p-6 bg-slate-50 dark:bg-white text-slate-950 rounded-3xl shadow-2xl text-center space-y-3 border border-slate-200 dark:border-slate-300">
            <div className="text-xs uppercase font-extrabold tracking-widest text-slate-600">
              BONCORE RESTAURANT & LOUNGE
            </div>
            <div className="text-xl font-black">{selectedTable?.name || 'Masa'}</div>

            {/* Visual SVG QR Code Mock */}
            <div className="w-40 h-40 mx-auto bg-white dark:bg-slate-100 p-2 rounded-2xl border-2 border-slate-900 flex items-center justify-center">
              <div className="w-full h-full bg-slate-900 rounded-xl p-2 flex flex-col items-center justify-center text-white text-[10px] font-mono">
                <QrCode className="w-24 h-24 text-white mx-auto mb-1" />
                <span className="text-[9px] opacity-80">MASA #{selectedTableId}</span>
              </div>
            </div>

            <p className="text-[11px] font-bold text-slate-700 leading-tight">
              Kameranızla okutarak menüyü inceleyebilir, sipariş verebilir ve garson çağırabilirsiniz.
            </p>
          </div>

          <button
            onClick={() => window.print()}
            className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs border border-slate-300 dark:border-slate-700 transition flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>BU MASANIN QR KARTINI YAZDIR</span>
          </button>
        </div>

        {/* Right: Interactive Customer Smartphone Simulator Frame (8 cols) */}
        <div className="lg:col-span-8 flex justify-center">
          <div className="w-[375px] h-[720px] bg-slate-950 rounded-[45px] border-[8px] border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden relative">
            {/* Phone Notch */}
            <div className="h-6 bg-slate-950 flex items-center justify-center pt-1 z-20">
              <div className="w-24 h-4 bg-slate-800 rounded-full" />
            </div>

            {/* Mobile App Header */}
            <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-10 backdrop-blur-md">
              <div>
                <span className="text-[10px] uppercase font-bold text-orange-400">DİJİTAL MENÜ</span>
                <h4 className="text-base font-black text-white">{selectedTable?.name || 'Masa'}</h4>
              </div>

              {/* Buzzer Quick Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleCallWaiter('Garson Çağır')}
                  className="px-2.5 py-1 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold flex items-center gap-1"
                >
                  <Bell className="w-3 h-3" /> Garson
                </button>
                <button
                  onClick={() => handleCallWaiter('Hesap İste')}
                  className="px-2.5 py-1 rounded-xl bg-blue-600/20 text-blue-300 border border-blue-500/40 text-[10px] font-bold flex items-center gap-1"
                >
                  <Receipt className="w-3 h-3" /> Hesap
                </button>
              </div>
            </div>

            {/* Notification Toast */}
            {orderSentMessage && (
              <div className="bg-emerald-600 text-white text-xs font-bold p-2 text-center animate-fadeIn z-20">
                {orderSentMessage}
              </div>
            )}

            {/* Category Pills Bar */}
            <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-800/80 flex gap-1.5 overflow-x-auto">
              {menuData?.menu?.map((cat: any, idx: number) => (
                <button
                  key={cat.id}
                  onClick={() => { sound.beep(); setActiveCategoryIndex(idx); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                    activeCategoryIndex === idx
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Products List in Category */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {currentCategory?.products?.map((p: any) => (
                <div
                  key={p.id}
                  className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80 flex items-center justify-between gap-3 shadow-md"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-sm text-white">{p.name}</span>
                      {p.is_spicy && <span className="text-[9px] text-red-400 font-bold">🌶️</span>}
                      {p.is_vegan && <span className="text-[9px] text-emerald-400 font-bold">🌱</span>}
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">{p.description}</p>
                    <div className="text-xs font-black text-emerald-400 font-mono mt-1">
                      ₺{p.base_price.toFixed(2)}
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddToCart(p)}
                    className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center font-bold shadow"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Mobile Bottom Cart Bar */}
            {customerCart.length > 0 && (
              <div className="p-3 bg-slate-900 border-t border-slate-800 space-y-2 z-10">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-bold">
                    Sepetiniz ({customerCart.reduce((s, i) => s + i.quantity, 0)} Ürün):
                  </span>
                  <span className="font-mono font-black text-emerald-400 text-sm">
                    ₺{cartTotal.toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSendOrderFromPhone}
                    disabled={loading}
                    className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/30 transition flex items-center justify-center gap-1.5"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>MUTFAĞA SİPARİŞ VER</span>
                  </button>
                  <button
                    onClick={() => { sound.beep(); setIsVirtualPosOpen(true); }}
                    className="px-3 py-3 rounded-2xl bg-blue-600 text-white text-xs font-bold shadow"
                    title="Masada Kartla Öde"
                  >
                    <CreditCard className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Simulated Virtual POS 3D Secure Modal */}
      {isVirtualPosOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Masada Sanal POS Ödeme (3D Secure)</h3>
              </div>
              <button onClick={() => setIsVirtualPosOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-xs space-y-1">
              <div className="text-slate-400">Çekilecek Tutar:</div>
              <div className="text-xl font-black text-emerald-400 font-mono">₺{cartTotal.toFixed(2)}</div>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Kart Numarası:</label>
                <input
                  type="text"
                  defaultValue="5401 2345 6789 0123"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Son Kullanma:</label>
                  <input
                    type="text"
                    defaultValue="12/28"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-mono text-center"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">CVV:</label>
                  <input
                    type="text"
                    defaultValue="342"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-mono text-center"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                sound.cashDrawer();
                alert('Ödemeniz başarıyla alındı! E-Adisyon fişiniz oluşturuldu.');
                setIsVirtualPosOpen(false);
                setCustomerCart([]);
              }}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs shadow-lg shadow-emerald-500/30"
            >
              3D SECURE İLE ÖDE & TAMAMLA
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
