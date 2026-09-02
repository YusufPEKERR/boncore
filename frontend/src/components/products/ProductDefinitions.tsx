import React, { useState } from 'react';
import { 
  Plus, Search, MoreVertical, Heart, Palette, Copy, 
  Trash2, Edit3, CheckCircle2, Box, Layers 
} from 'lucide-react';
import { Category, Product } from '../../types';
import { sound } from '../../services/sound';

interface ProductDefinitionsProps {
  categories: Category[];
  onRefreshData?: () => void;
}

import { api } from '../../services/api';

export const ProductDefinitions: React.FC<ProductDefinitionsProps> = ({
  categories,
  onRefreshData
}) => {
  const [activeCatId, setActiveCatId] = useState<number>(categories[0]?.id || 1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState<boolean>(false);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');

  // New Product Form State
  const [newProdName, setNewProdName] = useState<string>('');
  const [newProdPrice, setNewProdPrice] = useState<number>(150);
  const [newProdUnit, setNewProdUnit] = useState<string>('Porsiyon');
  const [newProdStock, setNewProdStock] = useState<number>(50);

  const currentCategory = categories.find(c => c.id === activeCatId) || categories[0];
  const displayedProducts = currentCategory?.products?.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    sound.beep();
    try {
      await api.createCategory({ name: newCatName });
      if (onRefreshData) onRefreshData();
      setNewCatName('');
      setIsAddCategoryModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Kategori eklenemedi.');
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;
    sound.beep();
    try {
      await api.createProduct({
        category_id: currentCategory?.id || 1,
        name: newProdName,
        base_price: Number(newProdPrice),
        station: 'kitchen',
        is_available: true
      });
      if (onRefreshData) onRefreshData();
      setNewProdName('');
      setIsAddProductModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Ürün eklenemedi.');
    }
  };

  const handleDeleteProduct = async (prodId: number) => {
    if (confirm('Bu ürünü silmek istediğinize emin misiniz?')) {
      sound.beep();
      try {
        await api.deleteProduct(prodId);
        if (onRefreshData) onRefreshData();
      } catch (err: any) {
        alert(err.message || 'Ürün silinemedi.');
      }
    }
  };

  return (
    <div className="flex-1 flex h-[calc(100vh-3.5rem)] bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden font-sans transition-colors duration-200">
      {/* Left Sidebar: Categories List (Matching Adisyo Frame 030) - ~280px */}
      <div className="w-64 md:w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-sm z-10">
        {/* Top Button: + Kategori Ekle */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => { sound.beep(); setIsAddCategoryModalOpen(true); }}
            className="w-full py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-extrabold text-xs border border-red-200 dark:border-red-900/60 flex items-center justify-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Kategori Ekle</span>
          </button>
        </div>

        {/* Scrollable Categories List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {categories.map((cat) => {
            const isActive = cat.id === activeCatId;
            return (
              <div
                key={cat.id}
                onClick={() => { sound.beep(); setActiveCatId(cat.id); }}
                className={`p-2.5 rounded-xl cursor-pointer transition flex items-center justify-between text-xs font-bold ${
                  isActive
                    ? 'bg-slate-200 text-slate-950 dark:bg-slate-800 dark:text-white border-l-4 border-red-600 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <span className="uppercase truncate">{cat.name}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    sound.beep();
                    alert(`Kategori Ayarları: ${cat.name}`);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Content: Products Grid & Search Toolbar (Frame 030) */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Top Toolbar */}
        <div className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 flex-1 max-w-lg">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
              Tüm Kategoriler
            </span>
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Arama..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <button
            onClick={() => { sound.beep(); setIsAddProductModalOpen(true); }}
            className="px-4 py-2 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-md transition flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Ürün Ekle</span>
          </button>
        </div>

        {/* Products Cards Grid (Matching Frame 030) */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayedProducts.map((p) => (
            <div
              key={p.id}
              className="h-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition relative group"
            >
              {/* Card Top: Action Icons (♡ Favorite, 🎨 Color, ❐ Duplicate) */}
              <div className="flex items-center justify-end gap-2 text-slate-400">
                <button 
                  onClick={() => alert(`${p.name} favorilere eklendi`)}
                  className="p-1 hover:text-red-500 transition" 
                  title="Favori"
                >
                  <Heart className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => alert(`Kart rengi değiştir: ${p.name}`)}
                  className="p-1 hover:text-blue-500 transition" 
                  title="Renk / İkon"
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => alert(`${p.name} kopyalandı`)}
                  className="p-1 hover:text-emerald-500 transition" 
                  title="Kopyala"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Card Center: Product Name & Unit */}
              <div className="text-center my-auto">
                <h4 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-tight">
                  {p.name}
                </h4>
                <span className="text-[11px] font-semibold text-slate-400">
                  {p.unit || 'Kg'}
                </span>
              </div>

              {/* Card Bottom: Price (Left) + Stock (Right) */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <span className="font-mono font-black text-slate-900 dark:text-white">
                  ₺{p.base_price.toFixed(2)}
                </span>
                <span className="text-[11px] font-bold text-slate-500 font-mono">
                  Stok: {p.stock_quantity ?? 6.92}
                </span>
              </div>
            </div>
          ))}

          {displayedProducts.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-400 text-xs font-semibold">
              Bu kategoride ürün bulunamadı veya arama kriterine uygun sonuç yok.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Yeni Ürün Ekle */}
      {isAddProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <h3 className="text-base font-black">Yeni Ürün Tanımla</h3>
            <form onSubmit={handleAddProduct} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1">Ürün Adı:</label>
                <input
                  type="text"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="Örn: Kuzu Gerdan"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 block mb-1">Satış Fiyatı (₺):</label>
                  <input
                    type="number"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Birim:</label>
                  <select
                    value={newProdUnit}
                    onChange={(e) => setNewProdUnit(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                  >
                    <option value="Porsiyon">Porsiyon</option>
                    <option value="Kg">Kg</option>
                    <option value="Adet">Adet</option>
                    <option value="Kişilik">Kişilik</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black shadow"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Yeni Kategori Ekle */}
      {isAddCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <h3 className="text-base font-black">Yeni Kategori Ekle</h3>
            <form onSubmit={handleAddCategory} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1">Kategori Adı:</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Örn: FIRIN ÜRÜNLERİ"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white uppercase font-bold"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCategoryModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black shadow"
                >
                  Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
