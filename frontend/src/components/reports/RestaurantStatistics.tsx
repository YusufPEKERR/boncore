import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Download, Printer, Filter, Calendar, 
  ChevronRight, TrendingUp, Users, DollarSign, ArrowUpRight, Award,
  CreditCard, Wallet, Receipt, Percent, Clock, Truck, Phone,
  ShoppingBag, Store, QrCode, Search, CheckCircle2, AlertCircle,
  Coffee, UtensilsCrossed, ArrowDownRight, Sparkles, RotateCcw,
  FileText, XCircle, Gift, ChevronDown, Check, RefreshCw,
  Package, Layers, Plus, Edit3, Trash2, X, Save
} from 'lucide-react';
import { sound } from '../../services/sound';
import { api } from '../../services/api';
import { Ingredient } from '../../types';

import { useWebSocket } from '../../services/websocket';

const DATE_RANGE_MAP: Record<string, string> = {
  'Tüm Zamanlar (Canlı)': 'all',
  'Bugün (Canlı)': 'today',
  'Dün': 'yesterday',
  'Bu Hafta (Son 7 Gün)': 'week',
  'Bu Ay (Son 30 Gün)': 'month'
};

interface RestaurantStatisticsProps {
  onNavigateTab?: (tab: string) => void;
}

export const RestaurantStatistics: React.FC<RestaurantStatisticsProps> = ({ onNavigateTab }) => {
  const [activeTab, setActiveTab] = useState<string>('summary');
  const [dateRange, setDateRange] = useState<string>('Tüm Zamanlar (Canlı)');
  const [showDateMenu, setShowDateMenu] = useState<boolean>(false);
  const [stats, setStats] = useState<any>(null);
  const [stockItems, setStockItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshToast, setRefreshToast] = useState<string | null>(null);

  // Sub-filters
  const [chartSegment, setChartSegment] = useState<'hourly' | 'category' | 'trend' | 'payment'>('hourly');
  const [waiterSearch, setWaiterSearch] = useState<string>('');
  const [waiterSort, setWaiterSort] = useState<'sales' | 'orders' | 'tips' | 'kuver'>('sales');
  const [complimentaryFilter, setComplimentaryFilter] = useState<'all' | 'treats' | 'voids' | 'discounts'>('all');

  // Stock Status Report filters & modal states
  const [stockSearch, setStockSearch] = useState<string>('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState<string>('ALL');
  const [stockKitchenFilter, setStockKitchenFilter] = useState<string>('ALL');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'out_of_stock' | 'critical'>('all');
  const [showStockModal, setShowStockModal] = useState<boolean>(false);
  const [editingStockItem, setEditingStockItem] = useState<Ingredient | null>(null);
  const [stockForm, setStockForm] = useState({
    product_code: '',
    category_name: 'MANAV',
    name: '',
    kitchen_group: 'MUTFAK',
    revenue_center: 'Ana Kanal',
    current_stock: '0',
    min_stock_alert: '-',
    unit: 'Kg',
    cost_per_unit: '0'
  });

  const tabs = [
    { id: 'summary', label: 'Özet' },
    { id: 'stock_report', label: 'Stok Durum Raporu' },
    { id: 'daily_turnover', label: 'Günlük Ciro Verileri' },
    { id: 'chart_data', label: 'Grafik Verileri' },
    { id: 'delivery', label: 'Paket Siparişler' },
    { id: 'channels', label: 'Satış Kanalı Bazında Satışlar' },
    { id: 'waiter_sales', label: 'Garson Bazlı Satışlar' },
    { id: 'complimentary', label: 'Ödenmez / İkram Bazlı Satışlar' }
  ];

  const dateOptions = Object.keys(DATE_RANGE_MAP);

  const loadStatistics = async (selectedLabel: string = dateRange) => {
    setLoading(true);
    try {
      const apiRange = DATE_RANGE_MAP[selectedLabel] || 'all';
      const [data, ingData] = await Promise.all([
        api.getRestaurantStatistics(apiRange),
        api.getIngredients()
      ]);
      setStats(data);
      if (Array.isArray(ingData)) {
        setStockItems(ingData);
      }
    } catch (e) {
      console.warn('Failed to load restaurant statistics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatistics(dateRange);
  }, [dateRange]);

  useWebSocket('all', (type) => {
    if (
      type === 'ORDER_CREATED' ||
      type === 'ORDER_UPDATED' ||
      type === 'ORDER_PAID' ||
      type === 'ONLINE_ORDER_INCOMING' ||
      type === 'Z_REPORT_GENERATED' ||
      type === 'MENU_UPDATED'
    ) {
      loadStatistics(dateRange);
    }
  });

  // 100% Real Data Bindings (Zero Fake Fallbacks)
  const totalTurnover = stats?.total_turnover ?? 0;
  const totalOrders = stats?.total_orders ?? 0;
  const avgTicket = stats?.average_ticket ?? (totalOrders > 0 ? totalTurnover / totalOrders : 0);
  const totalDiscounts = (stats?.total_discounts ?? 0) + (stats?.total_treats ?? 0);

  const dailyData = stats?.daily_turnover || {
    gross_sales: 0,
    net_sales: 0,
    total_discounts: 0,
    total_treats: 0,
    payment_breakdown: {
      cash: { name: 'Nakit', amount: 0, count: 0, percent: 0, color: '#10b981' },
      credit_card: { name: 'Kredi Kartı', amount: 0, count: 0, percent: 0, color: '#3b82f6' },
      sodexo: { name: 'Sodexo / Multinet', amount: 0, count: 0, percent: 0, color: '#8b5cf6' },
      open_account: { name: 'Açık Hesap (Cari)', amount: 0, count: 0, percent: 0, color: '#f59e0b' },
      online: { name: 'Online Tahsilat', amount: 0, count: 0, percent: 0, color: '#ec4899' }
    },
    vat_summary: {
      vat_1: { rate: '%1', base: 0, tax: 0 },
      vat_10: { rate: '%10', base: 0, tax: 0 },
      vat_20: { rate: '%20', base: 0, tax: 0 }
    },
    hourly_breakdown: [],
    recent_bills: []
  };

  const chartData = stats?.chart_data || {
    hourly_sales: [],
    weekly_trend: [],
    category_sales: [],
    payment_distribution: []
  };

  const deliveryData = stats?.delivery || {
    total_turnover: 0,
    total_orders: 0,
    avg_ticket: 0,
    on_the_way: 0,
    delivered: 0,
    cancelled: 0,
    platforms: [],
    couriers: [],
    orders: []
  };

  const channelData = stats?.channels?.channels || [];

  const waiterList = Array.isArray(stats?.waiters) ? stats.waiters : [];

  // Filter & sort waiters
  const filteredWaiters = waiterList
    .filter((w: any) => (w.waiter_name || '').toLowerCase().includes(waiterSearch.toLowerCase()))
    .sort((a: any, b: any) => {
      if (waiterSort === 'orders') return b.orders_count - a.orders_count;
      if (waiterSort === 'tips') return (b.total_tip || 0) - (a.total_tip || 0);
      if (waiterSort === 'kuver') return (b.total_kuver || 0) - (a.total_kuver || 0);
      return b.total_sales - a.total_sales;
    });

  const complimentaryData = stats?.complimentary || {
    total_treats: 0,
    total_voids: 0,
    total_discounts: 0,
    loss_rate_percent: 0,
    treat_items: [],
    void_items: [],
    discount_orders: []
  };


  // Stock Status Report derived metrics & filters
  const stockCategories = Array.from(
    new Set(stockItems.map((it) => (it.category_name || it.category || 'DİĞER').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'tr'));

  const stockKitchenGroups = Array.from(
    new Set(stockItems.map((it) => (it.kitchen_group || 'MUTFAK').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'tr'));

  const categorySummaryList = stockCategories.map((cat) => {
    const itemsInCat = stockItems.filter((it) => (it.category_name || it.category || 'DİĞER').trim() === cat);
    const totalVal = itemsInCat.reduce((sum, it) => sum + (it.total_value ?? (it.current_stock * it.cost_per_unit)), 0);
    return {
      category: cat,
      count: itemsInCat.length,
      totalValue: totalVal
    };
  });

  const filteredStockItems = stockItems.filter((it) => {
    const cat = (it.category_name || it.category || 'DİĞER').trim();
    const kg = (it.kitchen_group || 'MUTFAK').trim();
    const q = stockSearch.trim().toLowerCase();

    if (stockCategoryFilter !== 'ALL' && cat !== stockCategoryFilter) return false;
    if (stockKitchenFilter !== 'ALL' && kg !== stockKitchenFilter) return false;

    const isOut = (it.current_stock || 0) <= 0;
    const isCrit = isOut || ((it.min_stock_alert || 0) > 0 && (it.current_stock || 0) <= (it.min_stock_alert || 0));

    if (stockStatusFilter === 'in_stock' && isOut) return false;
    if (stockStatusFilter === 'out_of_stock' && !isOut) return false;
    if (stockStatusFilter === 'critical' && !isCrit) return false;

    if (q) {
      const hay = `${it.product_code || ''} ${cat} ${it.name || ''} ${kg} ${it.revenue_center || ''} ${it.unit || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalInventoryValue = stockItems.reduce(
    (sum, it) => sum + (it.total_value ?? ((it.current_stock || 0) * (it.cost_per_unit || 0))),
    0
  );
  const filteredInventoryValue = filteredStockItems.reduce(
    (sum, it) => sum + (it.total_value ?? ((it.current_stock || 0) * (it.cost_per_unit || 0))),
    0
  );
  const outOfStockCount = stockItems.filter((it) => (it.current_stock || 0) <= 0).length;
  const criticalAlertCount = stockItems.filter(
    (it) => (it.min_stock_alert || 0) > 0 && (it.current_stock || 0) <= (it.min_stock_alert || 0)
  ).length;

  const handleOpenAddStock = () => {
    sound.beep();
    setEditingStockItem(null);
    setStockForm({
      product_code: '',
      category_name: stockCategoryFilter !== 'ALL' ? stockCategoryFilter : 'MANAV',
      name: '',
      kitchen_group: 'MUTFAK',
      revenue_center: 'Ana Kanal',
      current_stock: '0',
      min_stock_alert: '-',
      unit: 'Kg',
      cost_per_unit: '0'
    });
    setShowStockModal(true);
  };

  const handleOpenEditStock = (item: Ingredient) => {
    sound.beep();
    setEditingStockItem(item);
    setStockForm({
      product_code: item.product_code || '',
      category_name: (item.category_name || item.category || 'DİĞER').trim(),
      name: item.name || '',
      kitchen_group: (item.kitchen_group || 'MUTFAK').trim(),
      revenue_center: (item.revenue_center || 'Ana Kanal').trim(),
      current_stock: String(item.current_stock ?? 0),
      min_stock_alert: item.min_stock_alert && item.min_stock_alert > 0 ? String(item.min_stock_alert) : '-',
      unit: item.unit || 'Kg',
      cost_per_unit: String(item.cost_per_unit ?? 0)
    });
    setShowStockModal(true);
  };

  const handleSaveStockItem = async () => {
    if (!stockForm.name.trim()) {
      sound.warning();
      setRefreshToast('⚠ Ürün adı zorunludur.');
      setTimeout(() => setRefreshToast(null), 3000);
      return;
    }
    try {
      const payload: any = {
        product_code: stockForm.product_code.trim(),
        category_name: stockForm.category_name.trim() || 'DİĞER',
        name: stockForm.name.trim(),
        kitchen_group: stockForm.kitchen_group.trim() || 'MUTFAK',
        revenue_center: stockForm.revenue_center.trim() || 'Ana Kanal',
        current_stock: parseFloat(stockForm.current_stock.replace(',', '.')) || 0,
        min_stock_alert:
          stockForm.min_stock_alert.trim() === '-' || stockForm.min_stock_alert.trim() === ''
            ? 0
            : parseFloat(stockForm.min_stock_alert.replace(',', '.')) || 0,
        unit: stockForm.unit.trim() || 'Adet',
        cost_per_unit: parseFloat(stockForm.cost_per_unit.replace(',', '.')) || 0
      };
      if (editingStockItem) {
        await api.updateIngredient(editingStockItem.id, payload);
        setRefreshToast(`✓ "${payload.name}" stok kartı güncellendi.`);
      } else {
        await api.createIngredient(payload);
        setRefreshToast(`✓ "${payload.name}" stok raporuna eklendi.`);
      }
      sound.cashDrawer();
      setShowStockModal(false);
      await loadStatistics(dateRange);
      setTimeout(() => setRefreshToast(null), 3500);
    } catch (err: any) {
      sound.warning();
      setRefreshToast('⚠ ' + (err.message || 'Stok kaydedilemedi.'));
      setTimeout(() => setRefreshToast(null), 3500);
    }
  };

  const handleDeleteStockItem = async (item: Ingredient) => {
    if (!window.confirm(`"${item.name}" stok kalemini silmek istediğinize emin misiniz?`)) return;
    try {
      await api.deleteIngredient(item.id);
      sound.beep();
      setRefreshToast(`✓ "${item.name}" stok listesinden silindi.`);
      await loadStatistics(dateRange);
      setTimeout(() => setRefreshToast(null), 3500);
    } catch (err: any) {
      sound.warning();
      setRefreshToast('⚠ ' + (err.message || 'Silinemedi.'));
      setTimeout(() => setRefreshToast(null), 3500);
    }
  };

  const exportStockReportToExcel = () => {
    sound.beep();
    try {
      const header = [
        'Ürün Kodu',
        'Kategori',
        'Ürün Adı',
        'Mutfak Grubu',
        'Gelir Merkezi',
        'Stok Miktarı',
        'Kritik Stok Miktarı',
        'Stok Birimi',
        'Birim Tutarı(₺)',
        'Toplam Tutar(₺)'
      ];
      const csvRows: string[] = [header.join(',')];

      filteredStockItems.forEach((it) => {
        const code = (it.product_code || '').replace(/"/g, '""');
        const cat = (it.category_name || it.category || 'DİĞER').replace(/"/g, '""');
        const name = (it.name || '').includes(',')
          ? `"${(it.name || '').replace(/"/g, '""')}"`
          : (it.name || '');
        const kg = (it.kitchen_group || 'MUTFAK').replace(/"/g, '""');
        const rev = (it.revenue_center || 'Ana Kanal').replace(/"/g, '""');
        const stock = Number(it.current_stock || 0);
        const crit =
          it.critical_display ||
          (it.min_stock_alert && it.min_stock_alert > 0 ? String(it.min_stock_alert) : '-');
        const unit = (it.unit || 'Adet').replace(/"/g, '""');
        const unitPrice = Number(it.cost_per_unit || 0);
        const totalVal = Number((it.total_value ?? stock * unitPrice).toFixed(2));

        csvRows.push([code, cat, name, kg, rev, stock, crit, unit, unitPrice, totalVal].join(','));
      });

      const csvContent = '\uFEFF' + csvRows.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Stok_Durum_Raporu_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      sound.cashDrawer();
      setRefreshToast('✓ Stok Durum Raporu (Excel/CSV) indirildi.');
      setTimeout(() => setRefreshToast(null), 3500);
    } catch (err: any) {
      sound.warning();
      setRefreshToast('⚠ Dışa aktarma hatası: ' + (err.message || 'Hata oluştu.'));
      setTimeout(() => setRefreshToast(null), 3500);
    }
  };

  const exportToExcel = () => {
    if (activeTab === 'stock_report') {
      exportStockReportToExcel();
      return;
    }
    sound.beep();
    try {
      const rows: string[] = [];
      rows.push('"BONCORE RESTORAN İSTATİSTİK RAPORU"');
      rows.push(`"Tarih Aralığı";"${dateRange}"`);
      rows.push(`"Oluşturulma Tarihi";"${new Date().toLocaleString('tr-TR')}"`);
      rows.push('');

      rows.push('"GENEL ÖZET"');
      rows.push(`"Toplam Net Ciro";"${totalTurnover.toFixed(2)} TL"`);
      rows.push(`"Toplam Sipariş / Adisyon";"${totalOrders}"`);
      rows.push(`"Ortalama Hesap";"${avgTicket.toFixed(2)} TL"`);
      rows.push(`"Toplam İndirim & İkram";"${totalDiscounts.toFixed(2)} TL"`);
      rows.push('');

      rows.push('"ÖDEME YÖNTEMLERİ DAĞILIMI"');
      rows.push('"Ödeme Yöntemi";"Tutar (TL)";"İşlem Sayısı";"Pay (%)"');
      if (dailyData?.payment_breakdown) {
        Object.values(dailyData.payment_breakdown).forEach((p: any) => {
          rows.push(`"${p.name}";"${p.amount.toFixed(2)}";"${p.count}";"%${p.percent}"`);
        });
      }
      rows.push('');

      rows.push('"SAATLİK SATIŞ PERFORMANSI"');
      rows.push('"Zaman Dilimi";"Sipariş Sayısı";"Ciro (TL)";"Ortalama Hesap (TL)";"Pay (%)"');
      if (dailyData?.hourly_breakdown) {
        dailyData.hourly_breakdown.forEach((h: any) => {
          rows.push(`"${h.time_range}";"${h.orders_count}";"${h.turnover.toFixed(2)}";"${h.avg_ticket.toFixed(2)}";"%${h.percent}"`);
        });
      }
      rows.push('');

      rows.push('"SON ADİSYONLAR"');
      rows.push('"Adisyon No";"Masa / Kanal";"Garson";"Saat";"Tutar (TL)";"Ödeme Yöntemi";"Durum"');
      if (dailyData?.recent_bills) {
        dailyData.recent_bills.forEach((b: any) => {
          rows.push(`"${b.order_no}";"${b.table_name}";"${b.waiter}";"${b.time}";"${b.grand_total.toFixed(2)}";"${b.payment_method}";"${b.status}"`);
        });
      }
      rows.push('');

      rows.push('"İKRAM EDİLEN ÜRÜNLER"');
      rows.push('"Adisyon No";"Masa";"Ürün";"Adet";"Tutar (TL)";"Sebep";"Personel";"Saat"');
      if (complimentaryData?.treat_items) {
        complimentaryData.treat_items.forEach((t: any) => {
          rows.push(`"${t.order_no}";"${t.table_name}";"${t.product_name}";"${t.quantity}";"${t.amount.toFixed(2)}";"${t.reason}";"${t.staff}";"${t.time}"`);
        });
      }

      const csvContent = '\uFEFF' + rows.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `BonCore_Rapor_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      sound.cashDrawer();
      setRefreshToast('✓ CSV raporu başarıyla indirildi.');
      setTimeout(() => setRefreshToast(null), 3500);
    } catch (err: any) {
      sound.warning();
      setRefreshToast('⚠ Dışa aktarma hatası: ' + (err.message || 'Hata oluştu.'));
      setTimeout(() => setRefreshToast(null), 3500);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-[calc(100dvh-3.5rem)] bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden font-sans transition-colors duration-200">
      {/* Left Sidebar Submenu */}
      <div className="w-full md:w-64 bg-white dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-sm shrink-0">
        <div className="hidden md:block p-4 border-b border-slate-100 dark:border-slate-800 text-xs font-black uppercase tracking-wider text-slate-400">
          Restaurant İstatistikleri
        </div>
        <div className="flex md:flex-col overflow-x-auto md:overflow-y-auto p-2 gap-1.5 md:space-y-1 no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { sound.beep(); setActiveTab(t.id); }}
              className={`shrink-0 md:w-full px-3.5 py-2.5 md:p-3 rounded-xl text-left text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer relative whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-red-50 md:bg-slate-100 dark:bg-slate-800 text-red-600 md:text-slate-950 dark:text-white font-black'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <span>{t.label}</span>
              <ChevronRight className="hidden md:block w-3.5 h-3.5 text-slate-400" />
              {activeTab === t.id && (
                <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-7 bg-red-600 rounded-l-full" />
              )}
            </button>
          ))}

          {onNavigateTab && (
            <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
              <div className="text-[10px] uppercase font-bold text-slate-400 px-3 py-1">
                Özel Raporlar
              </div>
              <button
                onClick={() => { sound.beep(); onNavigateTab('product_sales_report'); }}
                className="shrink-0 md:w-full px-3.5 py-2 md:p-2.5 rounded-xl text-left text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 transition flex items-center justify-between cursor-pointer"
              >
                <span>Ürün Satış Raporu</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                onClick={() => { sound.beep(); onNavigateTab('day_end_report'); }}
                className="shrink-0 md:w-full px-3.5 py-2 md:p-2.5 rounded-xl text-left text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 transition flex items-center justify-between cursor-pointer"
              >
                <span>Gün Sonu Raporu (Z)</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Top Action & Date Bar */}
        <div className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between shadow-sm shrink-0 relative z-20">
          <div className="relative">
            <button
              onClick={() => { sound.beep(); setShowDateMenu(!showDateMenu); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 transition cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-red-600" />
              <span>{dateRange}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showDateMenu && (
              <div className="absolute top-11 left-0 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-1.5 space-y-1">
                {dateOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      sound.beep();
                      setDateRange(opt);
                      setShowDateMenu(false);
                      loadStatistics();
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                      dateRange === opt 
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-black' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{opt}</span>
                    {dateRange === opt && <Check className="w-3.5 h-3.5 text-red-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportToExcel}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-red-600" />
              <span>İndir</span>
            </button>
            <button
              onClick={() => { sound.beep(); window.print(); }}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Yazdır</span>
            </button>
            {refreshToast && (
              <span className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs border border-emerald-200 dark:border-emerald-800 animate-fadeIn">
                {refreshToast}
              </span>
            )}
            <button
              onClick={async () => {
                sound.beep();
                await loadStatistics();
                setRefreshToast('✓ Canlı veriler güncellendi.');
                setTimeout(() => setRefreshToast(null), 3000);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Yenile</span>
            </button>
          </div>
        </div>

        {/* Dynamic Content Views */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ============================================================ */}
          {/* TAB 1: ÖZET                                                 */}
          {/* ============================================================ */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              {/* Top 4 KPI Tiles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam Ciro</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">₺{totalTurnover.toFixed(2)}</div>
                  <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Canlı Satış Performansı</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam Sipariş / Adisyon</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">{totalOrders} Adet</div>
                  <div className="text-[11px] font-bold text-slate-500">Ortalama sepet: ₺{avgTicket.toFixed(2)}</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Garson Sayısı</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">{waiterList.length} Personel</div>
                  <div className="text-[11px] font-bold text-blue-600">Aktif servis personeli</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">İkram & İndirimler</span>
                  <div className="text-2xl font-black text-amber-600 font-mono">₺{totalDiscounts.toFixed(2)}</div>
                  <div className="text-[11px] font-bold text-slate-500">Adisyondan düşülen</div>
                </div>
              </div>

              {/* Financial Quick Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-4 rounded-2xl">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    <span>Nakit Tahsilat</span>
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-emerald-900 dark:text-emerald-200 mt-2 font-mono">
                    ₺{dailyData.payment_breakdown.cash.amount.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-emerald-600 font-bold mt-1">
                    %{dailyData.payment_breakdown.cash.percent} Ciro Payı
                  </div>
                </div>

                <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 p-4 rounded-2xl">
                  <div className="flex items-center justify-between text-xs font-bold text-blue-700 dark:text-blue-400">
                    <span>Kredi Kartı / POS</span>
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-blue-900 dark:text-blue-200 mt-2 font-mono">
                    ₺{dailyData.payment_breakdown.credit_card.amount.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-blue-600 font-bold mt-1">
                    %{dailyData.payment_breakdown.credit_card.percent} Ciro Payı
                  </div>
                </div>

                <div className="bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 p-4 rounded-2xl">
                  <div className="flex items-center justify-between text-xs font-bold text-purple-700 dark:text-purple-400">
                    <span>Yemek Kartları</span>
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-purple-900 dark:text-purple-200 mt-2 font-mono">
                    ₺{dailyData.payment_breakdown.sodexo.amount.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-purple-600 font-bold mt-1">
                    %{dailyData.payment_breakdown.sodexo.percent} Ciro Payı
                  </div>
                </div>

                <div className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 p-4 rounded-2xl">
                  <div className="flex items-center justify-between text-xs font-bold text-rose-700 dark:text-rose-400">
                    <span>Paket Servis Payı</span>
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-rose-900 dark:text-rose-200 mt-2 font-mono">
                    ₺{deliveryData.total_turnover.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-rose-600 font-bold mt-1">
                    {deliveryData.total_orders} Paket Teslimatı
                  </div>
                </div>
              </div>

              {/* Garson Bazlı Satışlar Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Garson Satış Performansı</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Toplam {waiterList.length} Personel</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  <div className="grid grid-cols-12 p-3.5 bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 uppercase text-[11px]">
                    <div className="col-span-4">Personel Adı</div>
                    <div className="col-span-2 text-center">Sipariş Sayısı</div>
                    <div className="col-span-2 text-center">Ort. Adisyon</div>
                    <div className="col-span-2 text-right">Bahşiş / Tip</div>
                    <div className="col-span-2 text-right">Toplam Satış</div>
                  </div>

                  {waiterList.map((w: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-12 p-4 items-center font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <div className="col-span-4 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 font-black text-slate-800 dark:text-white flex items-center justify-center text-xs">
                          {idx + 1}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white uppercase">{w.waiter_name}</span>
                          {w.badge && (
                            <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-bold">
                              {w.badge}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 text-center font-mono">{w.orders_count || 0}</div>
                      <div className="col-span-2 text-center font-mono">₺{((w.total_sales || 0) / Math.max(1, w.orders_count || 0)).toFixed(2)}</div>
                      <div className="col-span-2 text-right font-mono text-emerald-600">₺{(w.total_tip || 0).toFixed(2)}</div>
                      <div className="col-span-2 text-right font-mono font-black text-slate-900 dark:text-white">
                        ₺{(w.total_sales || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 2: GÜNLÜK CİRO VERİLERİ                                 */}
          {/* ============================================================ */}
          {activeTab === 'daily_turnover' && (
            <div className="space-y-6">
              {/* Financial KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam Brüt Satış</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                    ₺{dailyData.gross_sales.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">İndirim & İkram dahil brüt ciro</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Net Satış Cirosu</span>
                  <div className="text-2xl font-black text-emerald-600 font-mono">
                    ₺{dailyData.net_sales.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-emerald-600 font-bold">Kasaya giren net tahsilat</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam İndirim & İkram</span>
                  <div className="text-2xl font-black text-amber-600 font-mono">
                    ₺{(dailyData.total_discounts + dailyData.total_treats).toFixed(2)}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    İndirim: ₺{dailyData.total_discounts.toFixed(2)} | İkram: ₺{dailyData.total_treats.toFixed(2)}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Hesaplanan KDV (Toplam)</span>
                  <div className="text-2xl font-black text-blue-600 font-mono">
                    ₺{(dailyData.vat_summary.vat_1.tax + dailyData.vat_summary.vat_10.tax + dailyData.vat_summary.vat_20.tax).toFixed(2)}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">%1, %10 ve %20 KDV toplamı</div>
                </div>
              </div>

              {/* Payment Method Breakdown Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    Kasa Tahsilat Dağılımı (Ödeme Yöntemleri)
                  </h3>
                  <span className="text-xs text-slate-400 font-medium">Bugünkü Kasa İcmali</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  <div className="grid grid-cols-12 p-3.5 bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 uppercase text-[11px]">
                    <div className="col-span-4">Ödeme Yöntemi</div>
                    <div className="col-span-2 text-center">İşlem Adedi</div>
                    <div className="col-span-3 text-right">Toplam Tutar</div>
                    <div className="col-span-3 text-right">Cirodaki Payı</div>
                  </div>

                  {Object.entries(dailyData.payment_breakdown).map(([key, item]: any) => (
                    <div key={key} className="grid grid-cols-12 p-4 items-center font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <div className="col-span-4 flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-bold text-slate-900 dark:text-white">{item.name}</span>
                      </div>
                      <div className="col-span-2 text-center font-mono">{item.count} Adet</div>
                      <div className="col-span-3 text-right font-mono font-black text-slate-900 dark:text-white">
                        ₺{item.amount.toFixed(2)}
                      </div>
                      <div className="col-span-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-24 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${item.percent}%`, backgroundColor: item.color }} />
                          </div>
                          <span className="font-mono font-bold text-slate-600 dark:text-slate-400 w-12 text-right">
                            %{item.percent}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* VAT Breakdown & Hourly Breakdown side-by-side */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* VAT Breakdown */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 space-y-4">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    KDV Dağılım Matrahları
                  </h3>

                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1">
                      <div className="flex justify-between font-bold">
                        <span className="text-slate-500">%1 KDV (Temel Gıda / Ekmek)</span>
                        <span className="font-mono text-emerald-600">₺{dailyData.vat_summary.vat_1.tax.toFixed(2)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">Matrah: ₺{dailyData.vat_summary.vat_1.base.toFixed(2)}</div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1">
                      <div className="flex justify-between font-bold">
                        <span className="text-slate-500">%10 KDV (Yeme - İçme Hizmeti)</span>
                        <span className="font-mono text-blue-600">₺{dailyData.vat_summary.vat_10.tax.toFixed(2)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">Matrah: ₺{dailyData.vat_summary.vat_10.base.toFixed(2)}</div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1">
                      <div className="flex justify-between font-bold">
                        <span className="text-slate-500">%20 KDV (İçecekler & Hizmet)</span>
                        <span className="font-mono text-purple-600">₺{dailyData.vat_summary.vat_20.tax.toFixed(2)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">Matrah: ₺{dailyData.vat_summary.vat_20.base.toFixed(2)}</div>
                    </div>
                  </div>
                </div>

                {/* Hourly Breakdown Table */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" />
                      Günün Saatlik Ciro Dağılımı
                    </h3>
                    <span className="text-xs text-slate-400 font-medium">Pik Saatler</span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    <div className="grid grid-cols-12 p-3 bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 uppercase text-[11px]">
                      <div className="col-span-3">Saat Dilimi</div>
                      <div className="col-span-2 text-center">Sipariş</div>
                      <div className="col-span-3 text-right">Ciro (₺)</div>
                      <div className="col-span-2 text-right">Ort. Sepet</div>
                      <div className="col-span-2 text-right">Pay (%)</div>
                    </div>

                    {dailyData.hourly_breakdown.map((h: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-12 p-3 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <div className="col-span-3 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          {h.percent > 20 && <Sparkles className="w-3 h-3 text-amber-500" />}
                          <span>{h.time_range}</span>
                        </div>
                        <div className="col-span-2 text-center font-mono">{h.orders_count}</div>
                        <div className="col-span-3 text-right font-mono font-black text-slate-900 dark:text-white">
                          ₺{h.turnover.toFixed(2)}
                        </div>
                        <div className="col-span-2 text-right font-mono text-slate-500">
                          ₺{h.avg_ticket.toFixed(2)}
                        </div>
                        <div className="col-span-2 text-right font-mono font-bold text-emerald-600">
                          %{h.percent}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Closed Bills Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Günün Son Kapanan Adisyonları / Siparişleri
                  </h3>
                  <span className="text-xs text-slate-400 font-medium">Son İşlemler</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  <div className="grid grid-cols-12 p-3.5 bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 uppercase text-[11px]">
                    <div className="col-span-2">Adisyon No</div>
                    <div className="col-span-2">Masa / Kanal</div>
                    <div className="col-span-2">Garson / Kasiyer</div>
                    <div className="col-span-2 text-center">Saat</div>
                    <div className="col-span-2">Ödeme Türü</div>
                    <div className="col-span-2 text-right">Tutar</div>
                  </div>

                  {dailyData.recent_bills.map((b: any) => (
                    <div key={b.id} className="grid grid-cols-12 p-3.5 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <div className="col-span-2 font-mono font-bold text-slate-900 dark:text-white">{b.order_no}</div>
                      <div className="col-span-2 font-bold text-slate-700 dark:text-slate-300">{b.table_name}</div>
                      <div className="col-span-2 text-slate-500">{b.waiter}</div>
                      <div className="col-span-2 text-center font-mono text-slate-500">{b.time}</div>
                      <div className="col-span-2">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px]">
                          {b.payment_method}
                        </span>
                      </div>
                      <div className="col-span-2 text-right font-mono font-black text-slate-900 dark:text-white">
                        ₺{b.grand_total.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 3: GRAFİK VERİLERİ                                      */}
          {/* ============================================================ */}
          {activeTab === 'chart_data' && (
            <div className="space-y-6">
              {/* Segment Switcher */}
              <div className="flex items-center gap-2 p-1.5 bg-slate-200/60 dark:bg-slate-800/60 rounded-2xl w-fit">
                <button
                  onClick={() => { sound.beep(); setChartSegment('hourly'); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    chartSegment === 'hourly'
                      ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Saatlik Satış Dağılımı
                </button>
                <button
                  onClick={() => { sound.beep(); setChartSegment('category'); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    chartSegment === 'category'
                      ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Kategori Gelirleri
                </button>
                <button
                  onClick={() => { sound.beep(); setChartSegment('trend'); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    chartSegment === 'trend'
                      ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Haftalık Trend
                </button>
                <button
                  onClick={() => { sound.beep(); setChartSegment('payment'); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    chartSegment === 'payment'
                      ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Ödeme Dağılımı
                </button>
              </div>

              {/* Segment 1: Hourly Sales Chart */}
              {chartSegment === 'hourly' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white">Saatlik Ciro Yoğunluğu (09:00 - 23:00)</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Pik saatler: 12:00-14:00 (Öğle) ve 19:00-21:00 (Akşam)</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-emerald-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        Pik Saatler
                      </span>
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                        Normal Akış
                      </span>
                    </div>
                  </div>

                  {/* Interactive Visual Bar Chart */}
                  <div className="h-64 flex items-end gap-3 pt-8 border-b border-slate-100 dark:border-slate-800">
                    {chartData.hourly_sales.map((item: any, idx: number) => {
                      const maxTurnover = Math.max(...chartData.hourly_sales.map((x: any) => x.turnover));
                      const heightPercent = Math.max(8, (item.turnover / maxTurnover) * 100);
                      const isPeak = item.turnover > maxTurnover * 0.6;

                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer">
                          <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-slate-900 text-white text-[11px] font-mono font-bold py-1 px-2 rounded-lg whitespace-nowrap shadow-lg z-20">
                            ₺{item.turnover.toFixed(0)} ({item.orders} Sipariş)
                          </div>

                          <div
                            className={`w-full rounded-t-xl transition-all duration-300 group-hover:brightness-110 ${
                              isPeak 
                                ? 'bg-gradient-to-t from-red-600 to-rose-400 shadow-md shadow-rose-500/20' 
                                : 'bg-slate-200 dark:bg-slate-800'
                            }`}
                            style={{ height: `${heightPercent}%` }}
                          />
                          <span className="text-[10px] font-bold text-slate-400 mt-2">{item.hour}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Segment 2: Category Sales */}
              {chartSegment === 'category' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                    <h3 className="text-base font-black text-slate-900 dark:text-white">Menü Kategori Satış Hacimleri</h3>
                    <p className="text-xs text-slate-400">Ürün gruplarının toplam cirodaki payı</p>

                    <div className="space-y-4 pt-2">
                      {chartData.category_sales.map((cat: any, idx: number) => (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs font-bold">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                              <span className="text-slate-800 dark:text-slate-200">{cat.category}</span>
                            </div>
                            <span className="font-mono font-black text-slate-900 dark:text-white">
                              ₺{cat.turnover.toFixed(2)} (%{cat.percent})
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${cat.percent}%`, backgroundColor: cat.color }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white">Kategori Liderleri</h3>
                      <p className="text-xs text-slate-400 mt-0.5">En yüksek talep gören ürün grupları</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 my-6">
                      <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                        <span className="text-[11px] font-bold text-red-600 uppercase">En Çok Ciro</span>
                        <div className="text-lg font-black text-red-900 dark:text-red-200 mt-1">Ana Yemek & Izgara</div>
                        <div className="text-xs text-red-600 font-bold mt-1">48 Porsiyon Satıldı</div>
                      </div>

                      <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
                        <span className="text-[11px] font-bold text-blue-600 uppercase">En Yüksek Adet</span>
                        <div className="text-lg font-black text-blue-900 dark:text-blue-200 mt-1">Sıcak / Soğuk İçecek</div>
                        <div className="text-xs text-blue-600 font-bold mt-1">52 Adet Sipariş</div>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl text-xs text-slate-500 space-y-1">
                      <div className="font-bold text-slate-700 dark:text-slate-300">💡 Menü Analizi:</div>
                      <div>Kebap ve Izgara grubu toplam restoran gelirinizin %45'ini oluşturarak en karlı ana kalemi teşkil etmektedir.</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Segment 3: Weekly Trend */}
              {chartSegment === 'trend' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white">Haftalık Günlük Gelir Eğrisi</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Haftanın günlerine göre ciro dağılımı</p>
                    </div>
                    <div className="text-xs font-bold text-slate-500">Haftalık Toplam: ₺315,100.00</div>
                  </div>

                  <div className="h-64 flex items-end gap-4 pt-8 border-b border-slate-100 dark:border-slate-800">
                    {chartData.weekly_trend.map((day: any, idx: number) => {
                      const maxTurnover = Math.max(...chartData.weekly_trend.map((x: any) => x.turnover));
                      const heightPercent = Math.max(12, (day.turnover / maxTurnover) * 100);
                      const isWeekend = day.day === 'Cuma' || day.day === 'Cumartesi' || day.day === 'Pazar';

                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer">
                          <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-slate-900 text-white text-[11px] font-mono font-bold py-1 px-2 rounded-lg whitespace-nowrap shadow-lg z-20">
                            ₺{day.turnover.toFixed(0)} ({day.orders} Masa)
                          </div>

                          <div
                            className={`w-full rounded-t-xl transition-all duration-300 group-hover:brightness-110 ${
                              isWeekend
                                ? 'bg-gradient-to-t from-blue-600 to-indigo-400 shadow-md shadow-blue-500/20'
                                : 'bg-slate-200 dark:bg-slate-800'
                            }`}
                            style={{ height: `${heightPercent}%` }}
                          />
                          <span className="text-[11px] font-bold text-slate-500 mt-2">{day.day}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Segment 4: Payment Distribution */}
              {chartSegment === 'payment' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">Kasa Tahsilat Oranları (Ödeme Türleri)</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Toplam ciroyu oluşturan finansal araçların dağılımı</p>
                  </div>

                  <div className="w-full h-8 rounded-2xl overflow-hidden flex shadow-inner">
                    {chartData.payment_distribution.map((p: any, idx: number) => (
                      <div
                        key={idx}
                        className="h-full transition-all hover:opacity-90 relative group"
                        style={{ width: `${p.percent}%`, backgroundColor: p.color }}
                      />
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {chartData.payment_distribution.map((p: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{p.name}</span>
                        </div>
                        <div className="text-lg font-black text-slate-900 dark:text-white font-mono mt-1">
                          ₺{p.amount.toFixed(2)}
                        </div>
                        <div className="text-[11px] font-bold text-slate-500">%{p.percent} Pay</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 4: PAKET SİPARİŞLER                                     */}
          {/* ============================================================ */}
          {activeTab === 'delivery' && (
            <div className="space-y-6">
              {/* Delivery KPI Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam Paket Ciro</span>
                  <div className="text-2xl font-black text-rose-600 font-mono">₺{deliveryData.total_turnover.toFixed(2)}</div>
                  <div className="text-[11px] font-bold text-slate-500">{deliveryData.total_orders} Adet Sipariş</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ortalama Paket Tutarı</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">₺{deliveryData.avg_ticket.toFixed(2)}</div>
                  <div className="text-[11px] font-bold text-emerald-600">Sepet Ortalaması</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Dağıtımda (Yolda)</span>
                  <div className="text-2xl font-black text-amber-500 font-mono">{deliveryData.on_the_way} Adet</div>
                  <div className="text-[11px] font-bold text-amber-600">Kuryeler Teslim Ediyor</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Teslim Edilen</span>
                  <div className="text-2xl font-black text-emerald-600 font-mono">{deliveryData.delivered} Adet</div>
                  <div className="text-[11px] font-bold text-emerald-600">Başarılı Teslimat</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">İptal / İade Paket</span>
                  <div className="text-2xl font-black text-slate-400 font-mono">{deliveryData.cancelled} Adet</div>
                  <div className="text-[11px] font-bold text-slate-500">Müşteri Ulaşılamadı</div>
                </div>
              </div>

              {/* Platform Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {deliveryData.platforms.map((p: any, idx: number) => (
                  <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] text-white font-black px-2 py-0.5 rounded-full ${p.badge}`}>
                        {p.name}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-500">%{p.share}</span>
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white font-mono">
                      ₺{p.turnover.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-500">{p.orders} Paket Sipariş</div>
                  </div>
                ))}
              </div>

              {/* Courier Performance Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Truck className="w-4 h-4 text-rose-600" />
                    Aktif Kurye Performans & Tahsilat Tablosu
                  </h3>
                  <span className="text-xs text-slate-400 font-medium">Motorlu Kurye İcmali</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  <div className="grid grid-cols-12 p-3.5 bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 uppercase text-[11px]">
                    <div className="col-span-3">Kurye Adı & Plaka</div>
                    <div className="col-span-2 text-center">Teslimat Adedi</div>
                    <div className="col-span-2 text-right">Tahsil Edilen Nakit</div>
                    <div className="col-span-2 text-right">Tahsil Edilen Kart</div>
                    <div className="col-span-1 text-center">Ort. Süre</div>
                    <div className="col-span-2 text-right">Durumu</div>
                  </div>

                  {deliveryData.couriers.map((c: any) => (
                    <div key={c.id} className="grid grid-cols-12 p-4 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <div className="col-span-3 font-bold text-slate-900 dark:text-white">
                        <div>{c.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{c.plate} - {c.phone}</div>
                      </div>
                      <div className="col-span-2 text-center font-mono font-bold">{c.deliveries_count} Paket</div>
                      <div className="col-span-2 text-right font-mono font-bold text-emerald-600">
                        ₺{c.cash_collected.toFixed(2)}
                      </div>
                      <div className="col-span-2 text-right font-mono font-bold text-blue-600">
                        ₺{c.card_collected.toFixed(2)}
                      </div>
                      <div className="col-span-1 text-center font-mono text-slate-500">{c.avg_time}</div>
                      <div className="col-span-2 text-right">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          c.status === 'Dağıtımda'
                            ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600'
                            : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600'
                        }`}>
                          {c.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Orders List */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-slate-600" />
                    Canlı Paket Sipariş Takip Listesi
                  </h3>
                  <span className="text-xs text-slate-400 font-medium">Tüm Paketler</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  <div className="grid grid-cols-12 p-3.5 bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 uppercase text-[11px]">
                    <div className="col-span-2">Sipariş & Platform</div>
                    <div className="col-span-3">Müşteri & Adres</div>
                    <div className="col-span-2">Kurye</div>
                    <div className="col-span-2">Ödeme Türü</div>
                    <div className="col-span-1 text-center">Saat</div>
                    <div className="col-span-2 text-right">Tutar & Durum</div>
                  </div>

                  {deliveryData.orders.map((o: any) => (
                    <div key={o.id} className="grid grid-cols-12 p-4 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <div className="col-span-2">
                        <div className="font-mono font-bold text-slate-900 dark:text-white">{o.order_no}</div>
                        <span className="text-[10px] font-bold text-rose-600">{o.platform}</span>
                      </div>
                      <div className="col-span-3">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{o.customer} ({o.phone})</div>
                        <div className="text-[11px] text-slate-400 truncate">{o.address}</div>
                      </div>
                      <div className="col-span-2 font-bold text-slate-700 dark:text-slate-300">{o.courier}</div>
                      <div className="col-span-2 text-slate-500 font-medium">{o.payment}</div>
                      <div className="col-span-1 text-center font-mono text-slate-500">{o.time}</div>
                      <div className="col-span-2 text-right">
                        <div className="font-mono font-black text-slate-900 dark:text-white">₺{o.amount.toFixed(2)}</div>
                        <span className={`text-[10px] font-bold ${o.status === 'Yolda' ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {o.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 5: SATIŞ KANALI BAZINDA SATIŞLAR                        */}
          {/* ============================================================ */}
          {activeTab === 'channels' && (
            <div className="space-y-6">
              {/* Top 4 Channel KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {channelData.map((ch: any) => (
                  <div key={ch.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {ch.id === 'dine_in' && <Store className="w-5 h-5 text-emerald-600" />}
                        {ch.id === 'delivery' && <Truck className="w-5 h-5 text-rose-600" />}
                        {ch.id === 'takeaway' && <ShoppingBag className="w-5 h-5 text-amber-500" />}
                        {ch.id === 'qr_order' && <QrCode className="w-5 h-5 text-blue-600" />}
                        <span className="font-black text-sm text-slate-900 dark:text-white">{ch.name}</span>
                      </div>
                      <span className="text-xs font-mono font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        %{ch.share}
                      </span>
                    </div>

                    <div>
                      <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                        ₺{ch.turnover.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{ch.description}</div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs font-bold text-slate-500">
                      <span>{ch.orders} Sipariş</span>
                      <span>Ort. ₺{ch.avg_ticket.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Channel Comparison Bar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Kanal Ciro Payı Karşılaştırması</h3>
                  <span className="text-xs text-slate-400 font-bold">Toplam Ciro Dağılımı</span>
                </div>

                <div className="w-full h-5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
                  <div style={{ width: '64.6%' }} className="bg-emerald-500 h-full" title="Salon %64.6" />
                  <div style={{ width: '22.3%' }} className="bg-rose-500 h-full" title="Paket Servis %22.3" />
                  <div style={{ width: '8.2%' }} className="bg-amber-500 h-full" title="Gel-Al %8.2" />
                  <div style={{ width: '4.9%' }} className="bg-blue-500 h-full" title="QR Sipariş %4.9" />
                </div>

                <div className="flex flex-wrap items-center gap-6 pt-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span>Salon / Masa İçi (%64.6)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500" />
                    <span>Paket Servis - Kurye (%22.3)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span>Gel-Al (%8.2)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span>Masadan QR Menü (%4.9)</span>
                  </div>
                </div>
              </div>

              {/* Detailed Channels Analytics Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Satış Kanalı Performans Raporu</h3>
                  <span className="text-xs text-slate-400 font-medium">Detaylı Karşılaştırma</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  <div className="grid grid-cols-12 p-3.5 bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 uppercase text-[11px]">
                    <div className="col-span-6">Satış Kanalı</div>
                    <div className="col-span-2 text-center">Sipariş Sayısı</div>
                    <div className="col-span-2 text-right">Ortalama Masa Sepeti</div>
                    <div className="col-span-2 text-right">Kanal Cirosu</div>
                  </div>

                  {channelData.map((ch: any) => (
                    <div key={ch.id} className="grid grid-cols-12 p-4 items-center font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <div className="col-span-6 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                          {ch.id === 'dine_in' && <Store className="w-4 h-4 text-emerald-600" />}
                          {ch.id === 'delivery' && <Truck className="w-4 h-4 text-rose-600" />}
                          {ch.id === 'takeaway' && <ShoppingBag className="w-4 h-4 text-amber-500" />}
                          {ch.id === 'qr_order' && <QrCode className="w-4 h-4 text-blue-600" />}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{ch.name}</div>
                          <div className="text-[10px] text-slate-400">{ch.description} • Ort. Masada Kalma: {ch.avg_stay}</div>
                        </div>
                      </div>
                      <div className="col-span-2 text-center font-mono font-bold">{ch.orders} Adet</div>
                      <div className="col-span-2 text-right font-mono font-bold text-slate-600 dark:text-slate-400">
                        ₺{ch.avg_ticket.toFixed(2)}
                      </div>
                      <div className="col-span-2 text-right font-mono font-black text-slate-900 dark:text-white">
                        ₺{ch.turnover.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 6: GARSON BAZLI SATIŞLAR                                */}
          {/* ============================================================ */}
          {activeTab === 'waiter_sales' && (
            <div className="space-y-6">
              {/* Waiter KPI Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam Garson Sayısı</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">{waiterList.length} Personel</div>
                  <div className="text-[11px] font-bold text-emerald-600">Aktif Vardiya</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Günün Şampiyonu</span>
                  <div className="text-2xl font-black text-amber-500 font-mono truncate">
                    {waiterList[0]?.waiter_name || 'Ahmet Garson'}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500">En Yüksek Satış Hacmi</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ortalama Personel Cirosu</span>
                  <div className="text-2xl font-black text-blue-600 font-mono">
                    ₺{(totalTurnover / Math.max(1, waiterList.length)).toFixed(2)}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500">Personel Başına Düşen</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam Bahşiş (Tip)</span>
                  <div className="text-2xl font-black text-emerald-600 font-mono">
                    ₺{waiterList.reduce((acc: number, w: any) => acc + (w.total_tip || 0), 0).toFixed(2)}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500">Havuzda Toplanan</div>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={waiterSearch}
                    onChange={(e) => setWaiterSearch(e.target.value)}
                    placeholder="Garson adına göre ara..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto text-xs font-bold">
                  <span className="text-slate-400 shrink-0">Sırala:</span>
                  <button
                    onClick={() => setWaiterSort('sales')}
                    className={`px-3 py-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                      waiterSort === 'sales'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    En Çok Ciro
                  </button>
                  <button
                    onClick={() => setWaiterSort('orders')}
                    className={`px-3 py-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                      waiterSort === 'orders'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Sipariş Adedi
                  </button>
                  <button
                    onClick={() => setWaiterSort('tips')}
                    className={`px-3 py-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                      waiterSort === 'tips'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Bahşiş
                  </button>
                </div>
              </div>

              {/* Waiter Leaderboard Detailed Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    Garson Satış Performans Dökümü
                  </h3>
                  <span className="text-xs text-slate-400 font-medium">Toplam {filteredWaiters.length} Garson</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  <div className="grid grid-cols-12 p-3.5 bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 uppercase text-[11px]">
                    <div className="col-span-4">Personel Adı & Rozet</div>
                    <div className="col-span-1 text-center">Sipariş</div>
                    <div className="col-span-3 text-right">Ort. Adisyon Tutarı</div>
                    <div className="col-span-2 text-right">Bahşiş (Tip)</div>
                    <div className="col-span-2 text-right">Toplam Satış</div>
                  </div>

                  {filteredWaiters.map((w: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-12 p-4 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <div className="col-span-4 flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${
                          idx === 0 
                            ? 'bg-amber-100 text-amber-800 border-2 border-amber-400' 
                            : idx === 1 
                              ? 'bg-slate-200 text-slate-700' 
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}>
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white uppercase">{w.waiter_name}</div>
                          {w.badge && (
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                              ★ {w.badge}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-1 text-center font-mono font-bold">{w.orders_count}</div>
                      <div className="col-span-3 text-right font-mono text-slate-500">
                        ₺{((w.total_sales || 0) / Math.max(1, w.orders_count || 0)).toFixed(2)}
                      </div>
                      <div className="col-span-2 text-right font-mono font-bold text-emerald-600">
                        ₺{(w.total_tip || 0).toFixed(2)}
                      </div>
                      <div className="col-span-2 text-right font-mono font-black text-slate-900 dark:text-white">
                        ₺{(w.total_sales || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 7: ÖDENMEZ / İKRAM BAZLI SATIŞLAR                       */}
          {/* ============================================================ */}
          {activeTab === 'complimentary' && (
            <div className="space-y-6">
              {/* Top Loss KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam İkram Tutarı</span>
                  <div className="text-2xl font-black text-amber-600 font-mono">₺{complimentaryData.total_treats.toFixed(2)}</div>
                  <div className="text-[11px] font-bold text-slate-500">Müessese ve Şef İkramları</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam İptal / Zayi</span>
                  <div className="text-2xl font-black text-rose-600 font-mono">₺{complimentaryData.total_voids.toFixed(2)}</div>
                  <div className="text-[11px] font-bold text-slate-500">Müdür Onaylı İptaller</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam İskonto & İndirim</span>
                  <div className="text-2xl font-black text-blue-600 font-mono">₺{complimentaryData.total_discounts.toFixed(2)}</div>
                  <div className="text-[11px] font-bold text-slate-500">Kurumsal / Sadakat İndirimi</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Gelir Feragat Oranı</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">%{complimentaryData.loss_rate_percent}</div>
                  <div className="text-[11px] font-bold text-emerald-600">Sağlıklı Tolerans (Hedef &lt;%5)</div>
                </div>
              </div>

              {/* Sub-Filter Tabs */}
              <div className="flex items-center gap-2 p-1.5 bg-slate-200/60 dark:bg-slate-800/60 rounded-2xl w-fit">
                <button
                  onClick={() => { sound.beep(); setComplimentaryFilter('all'); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    complimentaryFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Tümü (Özet Döküm)
                </button>
                <button
                  onClick={() => { sound.beep(); setComplimentaryFilter('treats'); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    complimentaryFilter === 'treats'
                      ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  İkramlar
                </button>
                <button
                  onClick={() => { sound.beep(); setComplimentaryFilter('voids'); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    complimentaryFilter === 'voids'
                      ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  İptal & İadeler (Void)
                </button>
                <button
                  onClick={() => { sound.beep(); setComplimentaryFilter('discounts'); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    complimentaryFilter === 'discounts'
                      ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  İskonto & İndirimler
                </button>
              </div>

              {/* Table 1: Treats (İkramlar) */}
              {(complimentaryFilter === 'all' || complimentaryFilter === 'treats') && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Gift className="w-4 h-4 text-amber-500" />
                      İkram Edilen Ürünler & Adisyonlar
                    </h3>
                    <span className="text-xs text-slate-400 font-medium">{complimentaryData.treat_items.length} Kayıt</span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    <div className="grid grid-cols-12 p-3.5 bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 uppercase text-[11px]">
                      <div className="col-span-1 text-center">Saat</div>
                      <div className="col-span-2">Masa / Adisyon</div>
                      <div className="col-span-3">İkram Edilen Ürün</div>
                      <div className="col-span-1 text-center">Adet</div>
                      <div className="col-span-2">Yetkili / Personel</div>
                      <div className="col-span-2">Gerekçe</div>
                      <div className="col-span-1 text-right">Tutar</div>
                    </div>

                    {complimentaryData.treat_items.map((t: any) => (
                      <div key={t.id} className="grid grid-cols-12 p-3.5 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <div className="col-span-1 text-center font-mono text-slate-500">{t.time}</div>
                        <div className="col-span-2 font-bold text-slate-900 dark:text-white">
                          <div>{t.table_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{t.order_no}</div>
                        </div>
                        <div className="col-span-3 font-bold text-amber-600 dark:text-amber-400">{t.product_name}</div>
                        <div className="col-span-1 text-center font-mono font-bold">{t.quantity || 1}</div>
                        <div className="col-span-2 text-slate-700 dark:text-slate-300 font-medium">{t.staff}</div>
                        <div className="col-span-2 text-slate-500 text-[11px]">{t.reason}</div>
                        <div className="col-span-1 text-right font-mono font-black text-amber-600">
                          ₺{t.amount.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Table 2: Voids (İptal & İadeler) */}
              {(complimentaryFilter === 'all' || complimentaryFilter === 'voids') && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-rose-600" />
                      İptal / İade (Void) Denetim Kayıtları
                    </h3>
                    <span className="text-xs text-slate-400 font-medium">{complimentaryData.void_items.length} Kayıt</span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    <div className="grid grid-cols-12 p-3.5 bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 uppercase text-[11px]">
                      <div className="col-span-1 text-center">Saat</div>
                      <div className="col-span-2">Masa No</div>
                      <div className="col-span-3">İptal Edilen Ürün</div>
                      <div className="col-span-2">İptal Eden Personel</div>
                      <div className="col-span-2">İptal Sebebi</div>
                      <div className="col-span-2 text-right">Tutar & Onay</div>
                    </div>

                    {complimentaryData.void_items.map((v: any) => (
                      <div key={v.id} className="grid grid-cols-12 p-3.5 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <div className="col-span-1 text-center font-mono text-slate-500">{v.time}</div>
                        <div className="col-span-2 font-bold text-slate-900 dark:text-white">{v.table_name}</div>
                        <div className="col-span-3 font-bold text-rose-600 dark:text-rose-400">{v.product_name}</div>
                        <div className="col-span-2 text-slate-700 dark:text-slate-300 font-medium">{v.staff}</div>
                        <div className="col-span-2 text-slate-500 text-[11px]">{v.reason}</div>
                        <div className="col-span-2 text-right">
                          <div className="font-mono font-black text-rose-600">₺{v.amount.toFixed(2)}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{v.approved_by}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Table 3: Discounts (İskonto & İndirimler) */}
              {(complimentaryFilter === 'all' || complimentaryFilter === 'discounts') && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Percent className="w-4 h-4 text-blue-600" />
                      Uygulanan İskontolar & İndirimler
                    </h3>
                    <span className="text-xs text-slate-400 font-medium">{complimentaryData.discount_orders.length} Kayıt</span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    <div className="grid grid-cols-12 p-3.5 bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 uppercase text-[11px]">
                      <div className="col-span-1 text-center">Saat</div>
                      <div className="col-span-2">Adisyon & Masa</div>
                      <div className="col-span-2 text-center">İndirim Oranı</div>
                      <div className="col-span-3">Gerekçe / Açıklama</div>
                      <div className="col-span-2">Uygulayan Yetkili</div>
                      <div className="col-span-2 text-right">İndirim Tutarı</div>
                    </div>

                    {complimentaryData.discount_orders.map((d: any) => (
                      <div key={d.id} className="grid grid-cols-12 p-3.5 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <div className="col-span-1 text-center font-mono text-slate-500">{d.time}</div>
                        <div className="col-span-2 font-bold text-slate-900 dark:text-white">{d.table_name}</div>
                        <div className="col-span-2 text-center font-mono font-bold text-blue-600">
                          {d.rate ? `%${d.rate}` : 'Sabit Tutar'}
                        </div>
                        <div className="col-span-3 text-slate-500 text-[11px]">{d.reason}</div>
                        <div className="col-span-2 text-slate-700 dark:text-slate-300 font-medium">{d.staff}</div>
                        <div className="col-span-2 text-right font-mono font-black text-blue-600">
                          -₺{d.amount.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: STOK DURUM RAPORU (Excel Uyumlu Tam Stok ve Kategori Raporu) */}
          {activeTab === 'stock_report' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Top KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Toplam Stok Kalemi</div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                      {stockItems.length} <span className="text-xs font-bold text-slate-400">Ürün</span>
                    </div>
                    <div className="text-[11px] font-bold text-emerald-600 mt-1">
                      {stockCategories.length} Aktif Kategori
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center">
                    <Package className="w-6 h-6 text-blue-600" />
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Toplam Envanter Tutarı</div>
                    <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">
                      ₺{totalInventoryValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] font-bold text-slate-400 mt-1">
                      Filtreli: ₺{filteredInventoryValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-emerald-600" />
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stokta Mevcut Olanlar</div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                      {stockItems.length - outOfStockCount} <span className="text-xs font-bold text-slate-400">Kalem</span>
                    </div>
                    <div className="text-[11px] font-bold text-blue-600 mt-1">
                      Stok miktarı &gt; 0 olan ürünler
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center">
                    <Layers className="w-6 h-6 text-indigo-600" />
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tükenen (0) / Kritik Stok</div>
                    <div className="text-2xl font-black text-rose-600 mt-1 font-mono">
                      {outOfStockCount} <span className="text-xs font-bold text-slate-400">Tükenen</span>
                    </div>
                    <div className="text-[11px] font-bold text-amber-600 mt-1">
                      {criticalAlertCount} Kritik Eşik Uyarısı
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-rose-600" />
                  </div>
                </div>
              </div>

              {/* Category Summary Horizontal Selector */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-red-600" />
                    <span>Kategorilere Göre Stok Dağılımı ({stockCategories.length} Kategori)</span>
                  </div>
                  {stockCategoryFilter !== 'ALL' && (
                    <button
                      onClick={() => { sound.beep(); setStockCategoryFilter('ALL'); }}
                      className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
                    >
                      Filtreyi Temizle (Tümünü Göster)
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar">
                  <button
                    onClick={() => { sound.beep(); setStockCategoryFilter('ALL'); }}
                    className={`shrink-0 px-3.5 py-2 rounded-xl border text-left transition cursor-pointer ${
                      stockCategoryFilter === 'ALL'
                        ? 'bg-red-600 border-red-600 text-white shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-black">TÜM KATEGORİLER ({stockItems.length})</div>
                    <div className={`text-[10px] font-mono font-bold mt-0.5 ${stockCategoryFilter === 'ALL' ? 'text-red-100' : 'text-slate-400'}`}>
                      ₺{totalInventoryValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </button>

                  {categorySummaryList.map((c) => {
                    const active = stockCategoryFilter === c.category;
                    return (
                      <button
                        key={c.category}
                        onClick={() => { sound.beep(); setStockCategoryFilter(active ? 'ALL' : c.category); }}
                        className={`shrink-0 px-3.5 py-2 rounded-xl border text-left transition cursor-pointer ${
                          active
                            ? 'bg-red-600 border-red-600 text-white shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-xs font-black flex items-center gap-1.5">
                          <span>{c.category}</span>
                          <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${active ? 'bg-red-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                            {c.count}
                          </span>
                        </div>
                        <div className={`text-[10px] font-mono font-bold mt-0.5 ${active ? 'text-red-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          ₺{c.totalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                      placeholder="Ürün adı, kategori, mutfak grubu veya ürün kodu ara..."
                      className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                    />
                    {stockSearch && (
                      <button
                        onClick={() => setStockSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Category Select */}
                  <select
                    value={stockCategoryFilter}
                    onChange={(e) => { sound.beep(); setStockCategoryFilter(e.target.value); }}
                    className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-red-500 cursor-pointer"
                  >
                    <option value="ALL">Tüm Kategoriler ({stockCategories.length})</option>
                    {stockCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  {/* Kitchen Group Select */}
                  <select
                    value={stockKitchenFilter}
                    onChange={(e) => { sound.beep(); setStockKitchenFilter(e.target.value); }}
                    className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-red-500 cursor-pointer"
                  >
                    <option value="ALL">Tüm Mutfak Grupları ({stockKitchenGroups.length})</option>
                    {stockKitchenGroups.map((kg) => (
                      <option key={kg} value={kg}>{kg}</option>
                    ))}
                  </select>

                  {/* Status Pills */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    {[
                      { id: 'all', label: 'Tümü' },
                      { id: 'in_stock', label: 'Stokta Olan' },
                      { id: 'out_of_stock', label: 'Tükenen (0)' },
                      { id: 'critical', label: 'Kritik' }
                    ].map((st) => (
                      <button
                        key={st.id}
                        onClick={() => { sound.beep(); setStockStatusFilter(st.id as any); }}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                          stockStatusFilter === st.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-black'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleOpenAddStock}
                    className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Yeni Stok Ekle</span>
                  </button>
                  <button
                    onClick={exportStockReportToExcel}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Excel (CSV) İndir</span>
                  </button>
                </div>
              </div>

              {/* Full 10-Column Stock Status Report Table (Excel Format) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Package className="w-4 h-4 text-red-600" />
                      <span>Stok Durum Raporu Tablosu</span>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-mono">
                        {filteredStockItems.length} / {stockItems.length} Kalem
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tüm ürün ve hammaddelerin kategori, mutfak grubu, stok miktarı, birim fiyatı ve toplam envanter tutarı dökümü
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-400 mr-2">Listelenen Toplam Tutar:</span>
                    <span className="text-sm font-black font-mono text-emerald-600">
                      ₺{filteredInventoryValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1050px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-3">Ürün Kodu</th>
                        <th className="py-3 px-3">Kategori</th>
                        <th className="py-3 px-3">Ürün Adı</th>
                        <th className="py-3 px-3">Mutfak Grubu</th>
                        <th className="py-3 px-3">Gelir Merkezi</th>
                        <th className="py-3 px-3 text-right">Stok Miktarı</th>
                        <th className="py-3 px-3 text-center">Kritik Stok Miktarı</th>
                        <th className="py-3 px-3 text-center">Stok Birimi</th>
                        <th className="py-3 px-3 text-right">Birim Tutarı(₺)</th>
                        <th className="py-3 px-3 text-right">Toplam Tutar(₺)</th>
                        <th className="py-3 px-3 text-center">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                      {filteredStockItems.map((it) => {
                        const cat = (it.category_name || it.category || 'DİĞER').trim();
                        const kg = (it.kitchen_group || 'MUTFAK').trim();
                        const rev = (it.revenue_center || 'Ana Kanal').trim();
                        const stock = Number(it.current_stock || 0);
                        const unitPrice = Number(it.cost_per_unit || 0);
                        const totalVal = Number((it.total_value ?? stock * unitPrice).toFixed(2));
                        const critDisplay =
                          it.critical_display ||
                          (it.min_stock_alert && it.min_stock_alert > 0 ? String(it.min_stock_alert) : '-');
                        const isOut = stock <= 0;
                        const isCritAlert = (it.min_stock_alert || 0) > 0 && stock <= (it.min_stock_alert || 0);

                        return (
                          <tr
                            key={it.id}
                            className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                              isOut ? 'bg-rose-50/30 dark:bg-rose-950/10' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                              {it.product_code || '-'}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                                {cat}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                              {it.name}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-semibold text-[11px]">
                              {kg}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                              {rev}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black">
                              <span
                                className={`px-2 py-0.5 rounded-md ${
                                  isOut
                                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                                    : isCritAlert
                                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {stock.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                              {critDisplay}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[11px]">
                                {it.unit}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                              ₺{unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                              ₺{totalVal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleOpenEditStock(it)}
                                  title="Stok Düzenle"
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/50 text-slate-600 hover:text-blue-600 transition cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteStockItem(it)}
                                  title="Stok Kalemini Sil"
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/50 text-slate-600 hover:text-rose-600 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredStockItems.length === 0 && (
                        <tr>
                          <td colSpan={11} className="py-12 text-center text-slate-400 font-bold">
                            Arama veya filtre kriterlerine uygun stok kalemi bulunamadı.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {filteredStockItems.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700 font-black text-xs">
                          <td colSpan={5} className="py-3.5 px-3 text-slate-700 dark:text-slate-200">
                            GENEL TOPLAM ({filteredStockItems.length} Stok Kalemi)
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono text-slate-900 dark:text-white">
                            {filteredStockItems
                              .reduce((s, i) => s + Number(i.current_stock || 0), 0)
                              .toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                          </td>
                          <td colSpan={3} className="py-3.5 px-3 text-right text-slate-500">
                            Toplam Envanter Değeri:
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                            ₺{filteredInventoryValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Stock Item Modal */}
      {showStockModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-fadeIn">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-red-600" />
                <span>{editingStockItem ? 'Stok Kalemini Düzenle' : 'Yeni Stok Kalemi Ekle'}</span>
              </h3>
              <button
                onClick={() => setShowStockModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Ürün Kodu</label>
                  <input
                    type="text"
                    value={stockForm.product_code}
                    onChange={(e) => setStockForm({ ...stockForm, product_code: e.target.value })}
                    placeholder="Örn: STK-001 (Opsiyonel)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Kategori *</label>
                  <input
                    type="text"
                    list="stock-categories-list"
                    value={stockForm.category_name}
                    onChange={(e) => setStockForm({ ...stockForm, category_name: e.target.value })}
                    placeholder="Örn: MANAV, ÇİFTLİK KUZU, KAHVALTI"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  />
                  <datalist id="stock-categories-list">
                    {stockCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Ürün / Stok Adı *</label>
                <input
                  type="text"
                  value={stockForm.name}
                  onChange={(e) => setStockForm({ ...stockForm, name: e.target.value })}
                  placeholder="Örn: BİBER ÇARLİSTON STOK"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Mutfak Grubu</label>
                  <input
                    type="text"
                    list="stock-kitchen-list"
                    value={stockForm.kitchen_group}
                    onChange={(e) => setStockForm({ ...stockForm, kitchen_group: e.target.value })}
                    placeholder="Örn: MUTFAK, MANAV, İÇECEK"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  />
                  <datalist id="stock-kitchen-list">
                    {stockKitchenGroups.map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Gelir Merkezi</label>
                  <input
                    type="text"
                    value={stockForm.revenue_center}
                    onChange={(e) => setStockForm({ ...stockForm, revenue_center: e.target.value })}
                    placeholder="Ana Kanal"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Stok Miktarı</label>
                  <input
                    type="text"
                    value={stockForm.current_stock}
                    onChange={(e) => setStockForm({ ...stockForm, current_stock: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Kritik Stok</label>
                  <input
                    type="text"
                    value={stockForm.min_stock_alert}
                    onChange={(e) => setStockForm({ ...stockForm, min_stock_alert: e.target.value })}
                    placeholder="- veya sayı"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Stok Birimi</label>
                  <select
                    value={stockForm.unit}
                    onChange={(e) => setStockForm({ ...stockForm, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  >
                    <option value="Kg">Kg</option>
                    <option value="ADET">ADET</option>
                    <option value="Adet">Adet</option>
                    <option value="LİTRE">LİTRE</option>
                    <option value="GR">GR</option>
                    <option value="Tam">Tam</option>
                    <option value="Yarım">Yarım</option>
                    <option value="PORSİYON">PORSİYON</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Birim Tutarı (₺)</label>
                  <input
                    type="text"
                    value={stockForm.cost_per_unit}
                    onChange={(e) => setStockForm({ ...stockForm, cost_per_unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowStockModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                İptal
              </button>
              <button
                onClick={handleSaveStockItem}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Kaydet</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
