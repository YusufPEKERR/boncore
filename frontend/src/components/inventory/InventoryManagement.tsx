import React, { useState, useEffect } from 'react';
import { 
  Boxes, ArrowRightLeft, FilePlus, AlertTriangle, 
  Search, RefreshCw, CheckCircle2, TrendingDown, Layers 
} from 'lucide-react';
import { Ingredient, Product, ProductRecipe } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

export const InventoryManagement: React.FC = () => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<ProductRecipe[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ingData, recData] = await Promise.all([
        api.getIngredients(),
        api.getRecipes()
      ]);
      setIngredients(ingData);
      setRecipes(recData);
      if (recData.length > 0 && !selectedProductId) {
        setSelectedProductId(recData[0].product_id);
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
      alert('Depolar arası stok transferi başarıyla yapıldı.');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Transfer başarısız.');
      sound.warning();
    }
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.beep();
    try {
      await api.enterPurchaseInvoice({
        warehouse_id: purchaseWh,
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
      alert('Tedarikçi irsaliye girişi ve stok artışı tamamlandı.');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'İrsaliye kaydedilemedi.');
      sound.warning();
    }
  };

  const selectedRecipe = recipes.find(r => r.product_id === selectedProductId) || recipes[0];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none transition-colors duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Stok, Çok Kademeli Reçete & Depo Yönetimi</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Satış Anında Otomatik Gramaj Düşümü, Fire Oranı ve İrsaliye Girişi</p>
        </div>
        <button
          onClick={() => { sound.beep(); loadData(); }}
          className="p-2.5 rounded-2xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition shadow-sm"
          title="Yenile"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Top Row: Raw Materials / Ingredients Stock Table */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Boxes className="w-5 h-5 text-emerald-500" />
            <span>Hammadde ve Yarı Mamul Stok Durumu</span>
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">{ingredients.length} Kalem Kayıtlı Hammadde</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <tr>
                <th className="py-3 px-4 font-bold">Hammadde Adı</th>
                <th className="py-3 px-4 font-bold">Birim</th>
                <th className="py-3 px-4 font-bold">Mevcut Toplam Stok</th>
                <th className="py-3 px-4 font-bold">Kritik Seviye</th>
                <th className="py-3 px-4 font-bold">Birim Maliyet</th>
                <th className="py-3 px-4 font-bold">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
              {ingredients.map((ing) => {
                return (
                  <tr key={ing.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{ing.name}</td>
                    <td className="py-3 px-4 font-mono uppercase text-slate-600 dark:text-slate-300">{ing.unit}</td>
                    <td className="py-3 px-4 font-mono font-black text-sm text-slate-900 dark:text-white">
                      {ing.current_stock} <span className="text-[11px] font-normal text-slate-500">{ing.unit}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">{ing.min_stock_alert} {ing.unit}</td>
                    <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">₺{ing.cost_per_unit.toFixed(2)}</td>
                    <td className="py-3 px-4">
                      {ing.is_critical ? (
                        <span className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 text-[10px] font-extrabold flex items-center gap-1 w-max animate-pulse">
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
            </tbody>
          </table>
        </div>
      </div>

      {/* Middle Row: Product Recipe BOM Explorer (Left 6 cols) + Warehouse Operations (Right 6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Product BOM Recipes (6 cols) */}
        <div className="lg:col-span-6 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-500" />
              <span>Ürün Reçetesi & Fire Oranı (BOM)</span>
            </h3>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Reçetesi İncelenecek Ürün:</label>
            <select
              value={selectedProductId || ''}
              onChange={(e) => {
                const pid = Number(e.target.value);
                setSelectedProductId(pid);
              }}
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white font-bold"
            >
              {recipes.map((r) => (
                <option key={r.product_id} value={r.product_id}>
                  {r.product_name} (Maliyet: ₺{r.estimated_cost.toFixed(2)} • Satış: ₺{r.base_price.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Gerekli Hammaddeler (1 Porsiyon İçin):</h4>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {selectedRecipe?.recipes?.map((item, i) => (
                <div
                  key={i}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-extrabold text-slate-900 dark:text-white">{item.ingredient_name}</span>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Fire Oranı: <span className="font-bold text-amber-600 dark:text-amber-400">%{item.waste_percentage}</span> (Pişme / Ayıklama Firesi)
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-sm text-blue-600 dark:text-blue-400">{item.amount} {item.unit}</span>
                    <div className="text-[10px] text-slate-500">Maliyet: ₺{item.cost.toFixed(2)}</div>
                  </div>
                </div>
              ))}
              {(!selectedRecipe || !selectedRecipe.recipes || selectedRecipe.recipes.length === 0) && (
                <div className="text-center py-6 text-xs text-slate-400 dark:text-slate-500">
                  Bu ürün için tanımlı hammadde reçetesi bulunmuyor.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Warehouse Operations (Transfer + Purchase Invoice) (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Warehouse Transfer Form */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-indigo-500" />
              <span>Depolar Arası Stok Transferi</span>
            </h3>

            <form onSubmit={handleTransfer} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Çıkış Deposu:</label>
                  <select
                    value={fromWh}
                    onChange={(e) => setFromWh(Number(e.target.value))}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white"
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
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white"
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
                    step="0.1"
                    value={transferQty}
                    onChange={(e) => setTransferQty(Number(e.target.value))}
                    required
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-md transition"
              >
                TRANSFERİ ONAYLA
              </button>
            </form>
          </div>

          {/* Supplier Purchase Invoice Form */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <FilePlus className="w-5 h-5 text-emerald-500" />
              <span>Tedarikçi Alış İrsaliye / Fatura Girişi</span>
            </h3>

            <form onSubmit={handlePurchase} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Hammadde:</label>
                  <select
                    value={purchaseIngId}
                    onChange={(e) => setPurchaseIngId(Number(e.target.value))}
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
                    step="0.5"
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
                    step="0.5"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(Number(e.target.value))}
                    required
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md transition"
              >
                İRSALİYE GİRİŞİNİ KAYDET & STOĞA EKLE
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
