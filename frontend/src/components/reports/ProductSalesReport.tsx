import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Search, Download, Printer, Filter, Calendar, 
  TrendingUp, Award, DollarSign, ChevronRight, RefreshCw, 
  Sparkles, CheckCircle2, Coffee, UtensilsCrossed, ArrowUpDown,
  Layers, ShoppingBag, Eye, Percent, FileText
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';
import { useWebSocket } from '../../services/websocket';

interface ProductSalesItem {
  product_id: number;
  product_name: string;
  category_id: number;
  category_name: string;
  station: string;
  unit: string;
  image_url?: string | null;
  vat_rate: number;
  total_quantity: number;
  total_turnover: number;
  avg_price: number;
  orders_count: number;
  treat_count: number;
  share_percent: number;
  unit_cost: number;
  total_cost: number;
  profit: number;
  profit_margin_percent: number;
}

interface CategorySummary {
  category: string;
  turnover: number;
  quantity: number;
  share: number;
}

export const ProductSalesReport: React.FC = () => {
  const [dateRange, setDateRange] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<number | 'ALL'>('ALL');
  const [selectedStation, setSelectedStation] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'turnover' | 'quantity' | 'name' | 'share'>('turnover');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<{
    total_revenue: number;
    total_quantity_sold: number;
    distinct_products_count: number;
    total_orders_analyzed: number;
    top_by_turnover: string;
    top_by_quantity: string;
    categories_summary: CategorySummary[];
    categories_filter: { id: number; name: string }[];
    items: ProductSalesItem[];
  } | null>(null);

  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getProductSalesReport({
        dateRange: dateRange === 'custom' ? undefined : dateRange,
        startDate: dateRange === 'custom' && startDate ? startDate : undefined,
        endDate: dateRange === 'custom' && endDate ? endDate : undefined,
        categoryId: selectedCategory === 'ALL' ? undefined : Number(selectedCategory),
        station: selectedStation === 'all' ? undefined : selectedStation,
        search: searchQuery.trim() || undefined
      });
      setData(res);
    } catch (err) {
      console.warn('Failed to load product sales report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateRange, selectedCategory, selectedStation]);

  useWebSocket('all', (type) => {
    if (type === 'ORDER_PAID' || type === 'ORDER_CREATED' || type === 'ORDER_UPDATED' || type === 'Z_REPORT_GENERATED') {
      loadData();
    }
  });

  const handleApplyCustomDates = () => {
    if (startDate && endDate) {
      sound.beep();
      loadData();
    }
  };

  // Client-side filtering & sorting for smooth UX
  const filteredAndSortedItems = useMemo(() => {
    if (!data?.items) return [];
    let items = [...data.items];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        i => i.product_name.toLowerCase().includes(q) || i.category_name.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => {
      let valA: any = a[sortBy === 'share' ? 'share_percent' : sortBy === 'turnover' ? 'total_turnover' : sortBy === 'quantity' ? 'total_quantity' : 'product_name'];
      let valB: any = b[sortBy === 'share' ? 'share_percent' : sortBy === 'turnover' ? 'total_turnover' : sortBy === 'quantity' ? 'total_quantity' : 'product_name'];
      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB, 'tr') : valB.localeCompare(valA, 'tr');
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return items;
  }, [data, searchQuery, sortBy, sortOrder]);

  const exportToCSV = () => {
    sound.beep();
    if (!filteredAndSortedItems.length) return;
    const headers = ['Ürün Adı', 'Kategori', 'İstasyon', 'Birim', 'Birim Fiyat (TL)', 'Satılan Miktar', 'Toplam Satış Tutarı (TL)', 'Ciro Payı (%)', 'Sipariş Sayısı', 'İkram Adedi'];
    const rows = filteredAndSortedItems.map(i => [
      `"${i.product_name}"`,
      `"${i.category_name}"`,
      `"${i.station}"`,
      `"${i.unit}"`,
      i.avg_price.toFixed(2),
      i.total_quantity,
      i.total_turnover.toFixed(2),
      i.share_percent.toFixed(2),
      i.orders_count,
      i.treat_count
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Urun_Satis_Raporu_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setRefreshNotice('Excel / CSV dosyası indirildi.');
    setTimeout(() => setRefreshNotice(null), 3000);
  };

  const printReport = () => {
    sound.beep();
    window.print();
  };

  const getStationLabel = (st: string) => {
    switch (st?.toLowerCase()) {
      case 'kitchen': return 'Mutfak';
      case 'bar': return 'Bar';
      case 'grill': return 'Izgara';
      case 'pastry': return 'Tatlı / Pasta';
      default: return st || 'Mutfak';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4 md:p-6 space-y-6">
      {/* Toast Notice */}
      {refreshNotice && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg font-bold text-xs flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{refreshNotice}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <span>Raporlar</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-red-600 font-bold">Ürün Satış Raporu</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <ShoppingBag className="w-6 h-6 text-red-600" />
            Ürün Satış Raporu
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Menüdeki ürünlerin porsiyon, kilogram, ciro ve ciro payı bazında kapsamlı satış performansı dökümü
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              sound.beep();
              loadData();
            }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-600' : ''}`} />
            <span>Yenile</span>
          </button>

          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel / CSV</span>
          </button>

          <button
            onClick={printReport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white shadow-sm transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Yazdır</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        {/* Date presets */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Tarih Aralığı:
            </span>
            {[
              { id: 'all', label: 'Tüm Zamanlar' },
              { id: 'today', label: 'Bugün' },
              { id: 'yesterday', label: 'Dün' },
              { id: 'week', label: 'Son 7 Gün' },
              { id: 'month', label: 'Son 30 Gün' },
              { id: 'custom', label: 'Özel Tarih' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  sound.beep();
                  setDateRange(tab.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  dateRange === tab.id
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Ürün veya kategori ara..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-red-500 outline-none"
            />
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500">Başlangıç:</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500">Bitiş:</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none"
              />
            </div>
            <button
              onClick={handleApplyCustomDates}
              className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition"
            >
              Filtrele
            </button>
          </div>
        )}

        {/* Dropdowns row */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex-wrap text-xs">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-500">Kategori:</span>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none"
            >
              <option value="ALL">Tüm Kategoriler ({data?.categories_filter?.length || 0})</option>
              {data?.categories_filter?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Station Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-500">İstasyon:</span>
            <select
              value={selectedStation}
              onChange={e => setSelectedStation(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none"
            >
              <option value="all">Tüm İstasyonlar</option>
              <option value="kitchen">Mutfak</option>
              <option value="bar">Bar</option>
              <option value="grill">Izgara</option>
              <option value="pastry">Tatlı</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="font-bold text-slate-500">Sırala:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none"
            >
              <option value="turnover">En Yüksek Ciro (₺)</option>
              <option value="quantity">En Çok Satan Miktar</option>
              <option value="share">Ciro Payı (%)</option>
              <option value="name">Ürün Adı (A-Z)</option>
            </select>
            <button
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              title={sortOrder === 'desc' ? 'Azalan' : 'Artan'}
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Turnover */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Toplam Ürün Satış Cirosu</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              ₺{(data?.total_revenue || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {data?.total_orders_analyzed || 0} adet sipariş incelendi
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>

        {/* Total Quantity */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Toplam Satılan Miktar</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {(data?.total_quantity_sold || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold">Porsiyon / Adet / Kg</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {data?.distinct_products_count || 0} farklı ürün menüden satıldı
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
        </div>

        {/* Top Seller by Turnover */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ciro Lideri Ürün</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-base font-extrabold text-slate-900 dark:text-white line-clamp-1">
              {data?.top_by_turnover || '-'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> En yüksek hasılat sağlayan ürün
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
        </div>

        {/* Top Seller by Quantity */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Miktar Lideri Ürün</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-purple-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-base font-extrabold text-slate-900 dark:text-white line-clamp-1">
              {data?.top_by_quantity || '-'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-purple-600 dark:text-purple-400 font-bold flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> En çok sipariş edilen ürün
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-500" />
        </div>
      </div>

      {/* Category Sales Breakdown Pills */}
      {data?.categories_summary && data.categories_summary.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-red-600" />
              Kategori Bazında Ciro Payları
            </h3>
            <span className="text-[11px] text-slate-400">
              Toplam {data.categories_summary.length} kategori
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {data.categories_summary.map((cat, idx) => (
              <div 
                key={idx} 
                className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{cat.category}</span>
                  <span className="font-mono font-extrabold text-red-600">%{cat.share.toFixed(1)}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-red-600 rounded-full" style={{ width: `${Math.min(100, cat.share)}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>₺{cat.turnover.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  <span>{cat.quantity} ad/kg</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Products Data Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col flex-1">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Satılan Ürünler Listesi ({filteredAndSortedItems.length} Kalem)
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Filtrelenen ciro: ₺{filteredAndSortedItems.reduce((acc, i) => acc + i.total_turnover, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-4">Ürün Adı</th>
                <th className="py-3 px-3">Kategori</th>
                <th className="py-3 px-3">İstasyon</th>
                <th className="py-3 px-3 text-right">Birim Fiyat</th>
                <th className="py-3 px-3 text-right">Satış Miktarı</th>
                <th className="py-3 px-3 text-right">Toplam Ciro (₺)</th>
                <th className="py-3 px-3 w-32">Ciro Payı</th>
                <th className="py-3 px-3 text-center">Adisyon</th>
                <th className="py-3 px-3 text-center">İkram</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-600" />
                    Satış verileri yükleniyor...
                  </td>
                </tr>
              ) : filteredAndSortedItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    Seçilen kriterlerde satılmış ürün kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredAndSortedItems.map((item, idx) => (
                  <tr 
                    key={item.product_id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="py-3 px-3 text-center font-bold text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {item.image_url ? (
                          <img 
                            src={item.image_url} 
                            alt={item.product_name} 
                            className="w-7 h-7 rounded-lg object-cover border border-slate-200 dark:border-slate-700" 
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center font-bold text-[10px]">
                            {item.product_name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-extrabold text-slate-900 dark:text-white leading-tight">
                            {item.product_name}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            KDV: %{item.vat_rate}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                        {item.category_name}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[11px] text-slate-500 font-medium">
                        {getStationLabel(item.station)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                      ₺{item.avg_price.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                      {item.unit === 'Kg' ? `${item.total_quantity.toFixed(3)} kg` : `${item.total_quantity} ad`}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                      ₺{item.total_turnover.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">%{item.share_percent.toFixed(1)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-red-600 rounded-full transition-all"
                            style={{ width: `${Math.min(100, item.share_percent * 2)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-500 font-semibold">
                      {item.orders_count}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.treat_count > 0 ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 font-bold text-[10px]">
                          {item.treat_count} ikram
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
