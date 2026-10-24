import React, { useState, useEffect } from 'react';
import { 
  Boxes, ArrowRightLeft, FilePlus, AlertTriangle, 
  Search, RefreshCw, CheckCircle2 
} from 'lucide-react';
import { Ingredient } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';
import { useWebSocket } from '../../services/websocket';

export const InventoryManagement: React.FC = () => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Transfer state
  const [transferIngId, setTransferIngId] = useState<number>(1);
  const [transferQty, setTransferQty] = useState<number>(5);
  const [fromWh, setFromWh] = useState<number>(1);
  const [toWh, setToWh] = useState<number>(2);

  // Purchase state
  const [purchaseIngId, setPurchaseIngId] = useState<number>(1);
  const [purchaseQty, setPurchaseQty] = useState<number>(20);
  const [purchaseCost, setPurchaseCost] = useState<number>(120);
  const [purchaseWh, setPurchaseWh] = useState<number>(1);

  const [loading, setLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    loadData();
  }, []);

  useWebSocket('all', (type) => {
    if (type === 'ORDER_CREATED' || type === 'ORDER_UPDATED' || type === 'MENU_UPDATED') {
      loadData();
    }
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const ingData = await api.getIngredients();
      setIngredients(ingData);
      if (ingData.length > 0) {
        if (!transferIngId || !ingData.some(i => i.id === transferIngId)) {
          setTransferIngId(ingData[0].id);
        }
        if (!purchaseIngId || !ingData.some(i => i.id === purchaseIngId)) {
          setPurchaseIngId(ingData[0].id);
          setPurchaseCost(ingData[0].cost_per_unit || 0);
        }
      }
    } catch (e) {
      console.warn('Failed to load inventory', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.beep();
    try {
      await api.transferStock(transferIngId, fromWh, toWh, transferQty, 'Depolar arası transfer');
      showToast('Depolar arası stok transferi başarıyla yapıldı.', 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Transfer başarısız.', 'error');
      sound.warning();
    }
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.beep();
    try {
      await api.enterPurchaseInvoice({
        warehouse_id: purchaseWh,
        supplier_name: 'Özdemir Et & Gıda Ltd.',
        supplier_title: 'Özdemir Et & Gıda Ltd.',
        invoice_no: 'IRS-' + Date.now().toString().slice(-6),
        items: [
          {
            ingredient_id: purchaseIngId,
            quantity: purchaseQty,
            unit_price: purchaseCost
          }
        ]
      });
      showToast('Tedarikçi irsaliye girişi ve stok artışı tamamlandı.', 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'İrsaliye kaydedilemedi.', 'error');
      sound.warning();
    }
  };

  const categories = Array.from(new Set(ingredients.map(i => i.category_name || i.category || 'DİĞER'))).filter(Boolean);

  const filteredIngredients = ingredients.filter(ing => {
    const matchesSearch = !searchQuery.trim() || 
      ing.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ing.product_code && ing.product_code.toLowerCase().includes(searchQuery.toLowerCase()));
    const cat = ing.category_name || ing.category || 'DİĞER';
    const matchesCat = selectedCategory === 'ALL' || cat === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none transition-colors duration-200">
      {/* Toast Notification */}
      {toast && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-bold shadow-lg transition-all animate-slideDown ${
          toast.type === 'success' 
            ? 'bg-emerald-600/95 text-white border border-emerald-500' 
            : 'bg-rose-600/95 text-white border border-rose-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Stok ve Depo Yönetimi</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Hammadde Stok Durumu, Depolar Arası Transfer ve Tedarikçi İrsaliye Girişi
          </p>
        </div>
        <button
          onClick={() => { sound.beep(); loadData(); }}
          className="p-2.5 rounded-2xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition shadow-sm self-start sm:self-auto cursor-pointer"
          title="Yenile"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Raw Materials / Ingredients Stock Table */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-emerald-500" />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Hammadde ve Yarı Mamul Stok Durumu
            </h3>
            <span className="text-xs text-slate-400 font-bold ml-2">
              ({filteredIngredients.length} / {ingredients.length} Kalem)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Hammadde ara..."
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-bold"
            >
              <option value="ALL">Tüm Kategoriler</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px]">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 font-bold">Kategori</th>
                <th className="py-3 px-4 font-bold">Ürün / Hammadde Adı</th>
                <th className="py-3 px-4 font-bold">Mutfak Grubu</th>
                <th className="py-3 px-4 font-bold text-right">Stok Miktarı</th>
                <th className="py-3 px-4 font-bold text-center">Kritik Stok</th>
                <th className="py-3 px-4 font-bold text-center">Birim</th>
                <th className="py-3 px-4 font-bold text-right">Birim Tutarı (₺)</th>
                <th className="py-3 px-4 font-bold text-right">Toplam Tutar (₺)</th>
                <th className="py-3 px-4 font-bold">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
              {filteredIngredients.map((ing) => {
                const totalVal = ing.total_value ?? (ing.current_stock * ing.cost_per_unit);
                const critLabel = ing.critical_display || (ing.min_stock_alert > 0 ? `${ing.min_stock_alert}` : '-');
                return (
                  <tr key={ing.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-[10px] border border-slate-200 dark:border-slate-700">
                        {ing.category_name || ing.category || 'DİĞER'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white">{ing.name}</td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 font-semibold">{ing.kitchen_group || 'MUTFAK'}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-black text-sm text-slate-900 dark:text-white">
                      {ing.current_stock.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                    </td>
                    <td className="py-2.5 px-4 text-center font-mono text-slate-500 dark:text-slate-400">{critLabel}</td>
                    <td className="py-2.5 px-4 text-center font-mono uppercase text-slate-600 dark:text-slate-300">{ing.unit}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                      ₺{ing.cost_per_unit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                      ₺{totalVal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4">
                      {ing.current_stock <= 0 ? (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-extrabold flex items-center gap-1 w-max">
                          <AlertTriangle className="w-3 h-3" /> TÜKENDİ (0)
                        </span>
                      ) : ing.is_critical ? (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-extrabold flex items-center gap-1 w-max">
                          <AlertTriangle className="w-3 h-3" /> KRİTİK SEVİYE
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold w-max">
                          YETERLİ
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredIngredients.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold">
                    Arama kriterine uygun hammadde bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warehouse Operations (Transfer + Purchase Invoice) Side-by-Side (6 cols + 6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Warehouse Transfer Form */}
        <div className="lg:col-span-6 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-indigo-500" />
            <span>Depolar Arası Stok Transferi</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ana depo, mutfak ve bar depoları arasında anlık hammadde aktarımı.
          </p>

          <form onSubmit={handleTransfer} className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Çıkış Deposu:</label>
                <select
                  value={fromWh}
                  onChange={(e) => setFromWh(Number(e.target.value))}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-bold"
                >
                  <option value={1}>1 - Ana Depo</option>
                  <option value={2}>2 - Mutfak Deposu</option>
                  <option value={3}>3 - Bar Deposu</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Giriş Deposu:</label>
                <select
                  value={toWh}
                  onChange={(e) => setToWh(Number(e.target.value))}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-bold"
                >
                  <option value={2}>2 - Mutfak Deposu</option>
                  <option value={3}>3 - Bar Deposu</option>
                  <option value={1}>1 - Ana Depo</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Hammadde:</label>
                <select
                  value={transferIngId}
                  onChange={(e) => setTransferIngId(Number(e.target.value))}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-bold"
                >
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Miktar:</label>
                <input
                  type="number"
                  step="0.001"
                  value={transferQty}
                  onChange={(e) => setTransferQty(Number(e.target.value))}
                  required
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-mono font-bold"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-md transition cursor-pointer"
            >
              TRANSFERİ ONAYLA
            </button>
          </form>
        </div>

        {/* Supplier Purchase Invoice Form */}
        <div className="lg:col-span-6 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <FilePlus className="w-5 h-5 text-emerald-500" />
            <span>Tedarikçi Alış İrsaliye / Fatura Girişi</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mal kabul ve fatura girişi ile hammadde stoklarını ve birim maliyetlerini güncelleme.
          </p>

          <form onSubmit={handlePurchase} className="space-y-3 pt-1">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Hammadde:</label>
                <select
                  value={purchaseIngId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setPurchaseIngId(id);
                    const found = ingredients.find(i => i.id === id);
                    if (found) setPurchaseCost(found.cost_per_unit || 0);
                  }}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-bold"
                >
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>{ing.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Miktar:</label>
                <input
                  type="number"
                  step="0.001"
                  value={purchaseQty}
                  onChange={(e) => setPurchaseQty(Number(e.target.value))}
                  required
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Birim Fiyat (₺):</label>
                <input
                  type="number"
                  step="0.01"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(Number(e.target.value))}
                  required
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-mono font-bold"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md transition cursor-pointer"
            >
              İRSALİYE GİRİŞİNİ KAYDET & STOĞA EKLE
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
