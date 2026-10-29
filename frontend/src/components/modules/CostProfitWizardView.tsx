import React, { useState, useEffect } from 'react';
import {
  TrendingUp, FileSpreadsheet, DollarSign, Percent, Download,
  Printer, Search, RefreshCw, ArrowUpRight, Filter, Layers
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface ProductAnalysisItem {
  id: number;
  name: string;
  category: string;
  unit_price: number;
  unit_cost: number;
  unit_profit: number;
  margin_percent: number;
  sold_qty: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  has_recipe: boolean;
}

export const CostProfitWizardView: React.FC = () => {
  const [summary, setSummary] = useState<any>({});
  const [products, setProducts] = useState<ProductAnalysisItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'cost_profit' | 'wizard'>('cost_profit');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Report Wizard state
  const [wizardGroupBy, setWizardGroupBy] = useState<'product' | 'category' | 'margin_tier'>('product');
  const [wizardMinMargin, setWizardMinMargin] = useState<number>(0);
  const [wizardOnlySold, setWizardOnlySold] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getCostProfitAnalysis();
      if (res) {
        setSummary(res.summary || {});
        setProducts(res.products || []);
      }
    } catch (e) {
      console.error('Cost profit analysis load failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const categories = ['all', ...Array.from(new Set(products.map(p => p.category)))];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesMargin = p.margin_percent >= wizardMinMargin;
    const matchesSold = !wizardOnlySold || p.sold_qty > 0;
    return matchesSearch && matchesCat && matchesMargin && matchesSold;
  });

  // Category aggregation for Report Wizard
  const categoryAggregates = Object.values(
    filteredProducts.reduce((acc: Record<string, any>, p) => {
      if (!acc[p.category]) {
        acc[p.category] = {
          category: p.category,
          product_count: 0,
          sold_qty: 0,
          total_revenue: 0,
          total_cost: 0,
          total_profit: 0
        };
      }
      acc[p.category].product_count += 1;
      acc[p.category].sold_qty += p.sold_qty;
      acc[p.category].total_revenue += p.total_revenue;
      acc[p.category].total_cost += p.total_cost;
      acc[p.category].total_profit += p.total_profit;
      return acc;
    }, {})
  );

  const handleExportCsv = () => {
    sound.cashDrawer();
    const headers = ['Ürün Adı', 'Kategori', 'Birim Satış (TL)', 'Reçete Maliyeti (TL)', 'Birim Kar (TL)', 'Kar Marjı (%)', 'Satılan Adet', 'Toplam Ciro (TL)', 'Toplam Net Kar (TL)'];
    const rows = filteredProducts.map(p => [
      `"${p.name}"`,
      `"${p.category}"`,
      p.unit_price.toFixed(2),
      p.unit_cost.toFixed(2),
      p.unit_profit.toFixed(2),
      p.margin_percent.toFixed(1),
      p.sold_qty.toFixed(2),
      p.total_revenue.toFixed(2),
      p.total_profit.toFixed(2)
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BonCore_Maliyet_Karlilik_Raporu_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              Maliyet & Kârlılık Analizi + Rapor Sihirbazı
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white uppercase">
              Adisyo Pro Analitik
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Reçete maliyetlerinizi, ürün bazlı brüt kâr marjınızı, işletme giderlerinizi ve özel kırılımlı raporlarınızı tek ekrandan inceleyin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.beep(); loadData(); }}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-100 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Excel / CSV İndir</span>
          </button>
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Yazdır</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Toplam Satış Cirosu</div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
            ₺{(summary.total_revenue || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Gerçekleşen Sipariş Toplamı</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Reçete / Satış Maliyeti (COGS)</div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
            ₺{(summary.total_cogs || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Hammadde Tüketim Tutarı</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Brüt Kâr</div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            ₺{(summary.gross_profit || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5">
            Brüt Marj: %{summary.gross_margin_percent || 0}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Kasa Masraf / Giderler</div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
            ₺{(summary.total_expenses || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">İşletme Gider Çıkışları</div>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md">
          <div className="text-[11px] font-bold text-emerald-100 uppercase">Net İşletme Kârı</div>
          <div className="text-xl font-black mt-1">
            ₺{(summary.net_profit || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-emerald-100 font-bold mt-0.5">
            Net Kârlılık Oranı: %{summary.net_margin_percent || 0}
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.beep(); setActiveTab('cost_profit'); }}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'cost_profit'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Ürün Bazlı Maliyet & Kârlılık Tablosu</span>
          </button>
          <button
            onClick={() => { sound.beep(); setActiveTab('wizard'); }}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'wizard'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Dinamik Rapor Sihirbazı (Özel Kırılım)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
          >
            <option value="all">Tüm Kategoriler</option>
            {categories.filter(c => c !== 'all').map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="relative w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ürün veya kategori ara..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold"
            />
          </div>
        </div>
      </div>

      {/* Report Wizard Custom Filters Bar */}
      {activeTab === 'wizard' && (
        <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 font-black text-indigo-900 dark:text-indigo-300">
              <Filter className="w-4 h-4" />
              <span>Rapor Sihirbazı Kırılımı:</span>
            </div>
            <select
              value={wizardGroupBy}
              onChange={(e) => setWizardGroupBy(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-slate-700 font-bold"
            >
              <option value="product">Ürün Bazlı Detay Kırılım</option>
              <option value="category">Kategori Bazlı Toplam Kârlılık</option>
            </select>

            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600 dark:text-slate-300">Min. Kâr Marjı (%):</span>
              <input
                type="number"
                value={wizardMinMargin}
                onChange={(e) => setWizardMinMargin(Number(e.target.value))}
                className="w-20 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"
              />
            </div>

            <label className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={wizardOnlySold}
                onChange={(e) => setWizardOnlySold(e.target.checked)}
                className="rounded text-rose-600"
              />
              <span>Sadece Satışı Olan Ürünleri Göster</span>
            </label>
          </div>

          <div className="font-bold text-indigo-700 dark:text-indigo-300">
            Listelenen Kayıt: {wizardGroupBy === 'category' ? categoryAggregates.length : filteredProducts.length}
          </div>
        </div>
      )}

      {/* Table Output */}
      {activeTab === 'wizard' && wizardGroupBy === 'category' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black text-slate-500 uppercase">
                <th className="py-3.5 px-4">Kategori Adı</th>
                <th className="py-3.5 px-4">Ürün Çeşidi</th>
                <th className="py-3.5 px-4">Satılan Miktar</th>
                <th className="py-3.5 px-4">Toplam Ciro</th>
                <th className="py-3.5 px-4">Toplam Maliyet</th>
                <th className="py-3.5 px-4 text-right">Toplam Brüt Kâr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {categoryAggregates.map((cat: any) => (
                <tr key={cat.category} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3.5 px-4 font-black text-slate-900 dark:text-white text-sm">{cat.category}</td>
                  <td className="py-3.5 px-4 font-bold text-slate-600 dark:text-slate-400">{cat.product_count} Ürün</td>
                  <td className="py-3.5 px-4 font-bold">{cat.sold_qty.toFixed(1)}</td>
                  <td className="py-3.5 px-4 font-extrabold text-slate-900 dark:text-white">
                    ₺{cat.total_revenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-amber-600">
                    ₺{cat.total_cost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-emerald-600 dark:text-emerald-400 text-sm">
                    ₺{cat.total_profit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black text-slate-500 uppercase">
                  <th className="py-3.5 px-4">Ürün Adı</th>
                  <th className="py-3.5 px-4">Kategori</th>
                  <th className="py-3.5 px-4">Birim Satış</th>
                  <th className="py-3.5 px-4">Birim Maliyet</th>
                  <th className="py-3.5 px-4">Birim Net Kâr</th>
                  <th className="py-3.5 px-4">Kâr Marjı (%)</th>
                  <th className="py-3.5 px-4">Satış Adedi</th>
                  <th className="py-3.5 px-4 text-right">Toplam Net Kâr</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-extrabold text-slate-900 dark:text-white">{p.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {p.has_recipe ? 'Reçeteli Tam Maliyet' : 'Tahmini Hammadde (%35)'}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">{p.category}</td>
                    <td className="py-3 px-4 font-bold">₺{p.unit_price.toFixed(2)}</td>
                    <td className="py-3 px-4 font-bold text-amber-600 dark:text-amber-400">₺{p.unit_cost.toFixed(2)}</td>
                    <td className="py-3 px-4 font-extrabold text-emerald-600 dark:text-emerald-400">₺{p.unit_profit.toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              p.margin_percent >= 60 ? 'bg-emerald-500' : p.margin_percent >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, p.margin_percent))}%` }}
                          />
                        </div>
                        <span className="font-black text-slate-800 dark:text-slate-200">%{p.margin_percent.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-bold">{p.sold_qty.toFixed(1)}</td>
                    <td className="py-3 px-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                      ₺{p.total_profit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
