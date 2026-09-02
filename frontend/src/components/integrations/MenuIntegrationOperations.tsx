import React, { useState } from 'react';
import { Layers, Search, Filter, AlertCircle, RefreshCw, CheckCircle2, X } from 'lucide-react';
import { Category } from '../../types';
import { sound } from '../../services/sound';

interface MenuIntegrationOperationsProps {
  categories: Category[];
}

export const MenuIntegrationOperations: React.FC<MenuIntegrationOperationsProps> = ({
  categories
}) => {
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showWarningToast, setShowWarningToast] = useState<boolean>(true);

  const allProducts = categories.flatMap(c => c.products || []);

  const filteredProducts = allProducts.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none animate-fadeIn font-sans transition-colors duration-200 space-y-6">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Entegrasyon Menü İşlemleri</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Burada, yalnızca ürün durum değişikliğini destekleyen entegratörlere yönelik işlem yapılabilmektedir.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
            <span className="px-2 text-slate-500">Ürün Durumu:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-slate-800 dark:text-white font-semibold focus:outline-none"
            >
              <option value="all">Aktif, Pasif</option>
              <option value="active">Sadece Aktif</option>
              <option value="passive">Sadece Pasif</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="bg-[#c0392b] text-white px-3 py-1.5 rounded-lg font-bold focus:outline-none"
            >
              <option value="all">Marka Seç (Tümü)</option>
              <option value="yemeksepeti">Yemeksepeti</option>
              <option value="getir">Getir Yemek</option>
              <option value="trendyol">Trendyol Yemek</option>
              <option value="migros">Migros Yemek</option>
            </select>
          </div>
        </div>
      </div>

      {/* Integration Products Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/60 p-4 border-b border-slate-200 dark:border-slate-800 text-xs font-black text-slate-700 dark:text-slate-300 uppercase">
          <div className="col-span-5">Ürün Adı</div>
          <div className="col-span-3">Entegrasyon</div>
          <div className="col-span-2">Fiyat</div>
          <div className="col-span-2 text-right">Satışa Açık/Kapalı</div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredProducts.slice(0, 15).map((p) => (
            <div key={p.id} className="grid grid-cols-12 p-4 items-center text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
              <div className="col-span-5 font-bold text-slate-900 dark:text-white uppercase">
                {p.name}
              </div>
              <div className="col-span-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-extrabold text-[10px]">
                  Yemeksepeti & Getir
                </span>
              </div>
              <div className="col-span-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                ₺{p.base_price.toFixed(2)}
              </div>
              <div className="col-span-2 flex justify-end">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Red Warning Toast (Matching Frame 010) */}
      {showWarningToast && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#e74c3c] text-white p-3.5 rounded-2xl shadow-xl flex items-center gap-3 text-xs font-bold animate-fadeIn max-w-md">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">
            Herhangi bir seçim yapmadınız. "Entegrasyon Değiştir" butonundan tekrar seçim yapabilirsiniz.
          </span>
          <button onClick={() => setShowWarningToast(false)} className="p-1 hover:bg-white/20 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
