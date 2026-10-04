import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Download, Printer, Filter, Calendar, 
  ChevronRight, TrendingUp, Users, DollarSign, ArrowUpRight, Award,
  CreditCard, Wallet, Receipt, Percent, Clock, Truck, Phone,
  ShoppingBag, Store, QrCode, Search, CheckCircle2, AlertCircle,
  Coffee, UtensilsCrossed, ArrowDownRight, Sparkles, RotateCcw,
  FileText, XCircle, Gift, ChevronDown, Check, RefreshCw
} from 'lucide-react';
import { sound } from '../../services/sound';
import { api } from '../../services/api';

export const RestaurantStatistics: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('summary');
  const [dateRange, setDateRange] = useState<string>('Bugün (Canlı)');
  const [showDateMenu, setShowDateMenu] = useState<boolean>(false);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshToast, setRefreshToast] = useState<string | null>(null);

  // Sub-filters
  const [chartSegment, setChartSegment] = useState<'hourly' | 'category' | 'trend' | 'payment'>('hourly');
  const [waiterSearch, setWaiterSearch] = useState<string>('');
  const [waiterSort, setWaiterSort] = useState<'sales' | 'orders' | 'tips' | 'kuver'>('sales');
  const [complimentaryFilter, setComplimentaryFilter] = useState<'all' | 'treats' | 'voids' | 'discounts'>('all');

  const tabs = [
    { id: 'summary', label: 'Özet' },
    { id: 'daily_turnover', label: 'Günlük Ciro Verileri' },
    { id: 'chart_data', label: 'Grafik Verileri' },
    { id: 'delivery', label: 'Paket Siparişler' },
    { id: 'channels', label: 'Satış Kanalı Bazında Satışlar' },
    { id: 'waiter_sales', label: 'Garson Bazlı Satışlar' },
    { id: 'complimentary', label: 'Ödenmez / İkram Bazlı Satışlar' }
  ];

  const dateOptions = [
    'Bugün (Canlı)',
    'Dün',
    'Bu Hafta (Pzt - Paz)',
    'Bu Ay (Eylül 2026)',
    'Son 30 Gün'
  ];

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    setLoading(true);
    try {
      const data = await api.getRestaurantStatistics();
      setStats(data);
    } catch (e) {
      console.warn('Failed to load restaurant statistics:', e);
    } finally {
      setLoading(false);
    }
  };

  // Safe fallback and defaults from live or mock
  const totalTurnover = stats?.total_turnover || 43950.00;
  const totalOrders = stats?.total_orders || 101;
  const avgTicket = stats?.average_ticket || (totalOrders > 0 ? totalTurnover / totalOrders : 0);
  const totalDiscounts = (stats?.total_discounts || 0) + (stats?.total_treats || 0);

  const dailyData = stats?.daily_turnover || {
    gross_sales: 46250.00,
    net_sales: totalTurnover,
    total_discounts: 1100.00,
    total_treats: 1200.00,
    payment_breakdown: {
      cash: { name: 'Nakit', amount: 12450.00, count: 32, percent: 28.3, color: '#10b981' },
      credit_card: { name: 'Kredi Kartı', amount: 26800.00, count: 58, percent: 61.0, color: '#3b82f6' },
      sodexo: { name: 'Sodexo / Multinet', amount: 3100.00, count: 7, percent: 7.1, color: '#8b5cf6' },
      open_account: { name: 'Açık Hesap (Cari)', amount: 1200.00, count: 3, percent: 2.7, color: '#f59e0b' },
      online: { name: 'Online Tahsilat', amount: 400.00, count: 1, percent: 0.9, color: '#ec4899' }
    },
    vat_summary: {
      vat_1: { rate: '%1', base: 5274.00, tax: 52.74 },
      vat_10: { rate: '%10', base: 31644.00, tax: 3164.40 },
      vat_20: { rate: '%20', base: 7032.00, tax: 1406.40 }
    },
    hourly_breakdown: [
      { time_range: '08:00 - 10:00', orders_count: 5, turnover: 1250.00, avg_ticket: 250.00, percent: 2.8 },
      { time_range: '10:00 - 12:00', orders_count: 14, turnover: 4800.00, avg_ticket: 342.86, percent: 10.9 },
      { time_range: '12:00 - 14:00', orders_count: 36, turnover: 15400.00, avg_ticket: 427.78, percent: 35.0 },
      { time_range: '14:00 - 16:00', orders_count: 11, turnover: 3900.00, avg_ticket: 354.55, percent: 8.9 },
      { time_range: '16:00 - 18:00', orders_count: 8, turnover: 2950.00, avg_ticket: 368.75, percent: 6.7 },
      { time_range: '18:00 - 20:00', orders_count: 22, turnover: 11800.00, avg_ticket: 536.36, percent: 26.8 },
      { time_range: '20:00 - 22:00', orders_count: 4, turnover: 3450.00, avg_ticket: 862.50, percent: 7.9 },
      { time_range: '22:00 - 00:00', orders_count: 1, turnover: 400.00, avg_ticket: 400.00, percent: 1.0 }
    ],
    recent_bills: [
      { id: 1, order_no: 'ORD-48651', table_name: 'Salon 1', waiter: 'Ahmet Garson', time: '14:25', grand_total: 840.00, status: 'Ödendi', payment_method: 'Kredi Kartı' },
      { id: 2, order_no: 'ORD-48648', table_name: 'Bahçe 2', waiter: 'Ayşe Kasiyer', time: '14:18', grand_total: 420.00, status: 'Ödendi', payment_method: 'Nakit' },
      { id: 3, order_no: 'ORD-48630', table_name: 'Teras 4', waiter: '37799 - fatih', time: '14:10', grand_total: 1250.00, status: 'Ödendi', payment_method: 'Kredi Kartı' },
      { id: 4, order_no: 'ORD-48615', table_name: 'VIP 1', waiter: 'Ahmet Garson', time: '13:55', grand_total: 3100.00, status: 'Ödendi', payment_method: 'Kredi Kartı' },
      { id: 5, order_no: 'ORD-48602', table_name: 'Paket #102', waiter: 'Can Kurtaran', time: '13:42', grand_total: 680.00, status: 'Ödendi', payment_method: 'Nakit' }
    ]
  };

  const chartData = stats?.chart_data || {
    hourly_sales: [
      { hour: '09:00', turnover: 450.00, orders: 2 },
      { hour: '10:00', turnover: 1200.00, orders: 4 },
      { hour: '11:00', turnover: 2600.00, orders: 8 },
      { hour: '12:00', turnover: 6800.00, orders: 17 },
      { hour: '13:00', turnover: 8600.00, orders: 19 },
      { hour: '14:00', turnover: 3900.00, orders: 9 },
      { hour: '15:00', turnover: 2100.00, orders: 6 },
      { hour: '16:00', turnover: 1800.00, orders: 5 },
      { hour: '17:00', turnover: 2400.00, orders: 7 },
      { hour: '18:00', turnover: 5200.00, orders: 12 },
      { hour: '19:00', turnover: 7900.00, orders: 16 },
      { hour: '20:00', turnover: 5600.00, orders: 11 },
      { hour: '21:00', turnover: 3100.00, orders: 6 },
      { hour: '22:00', turnover: 1200.00, orders: 3 }
    ],
    weekly_trend: [
      { day: 'Pazartesi', turnover: 32400.00, orders: 78 },
      { day: 'Salı', turnover: 35600.00, orders: 84 },
      { day: 'Çarşamba', turnover: 38900.00, orders: 92 },
      { day: 'Perşembe', turnover: 41200.00, orders: 96 },
      { day: 'Cuma', turnover: 54300.00, orders: 126 },
      { day: 'Cumartesi', turnover: 62800.00, orders: 148 },
      { day: 'Pazar', turnover: 48900.00, orders: 114 }
    ],
    category_sales: [
      { category: 'Ana Yemek & Izgara', turnover: 19800.00, count: 48, percent: 45.1, color: '#ef4444' },
      { category: 'Burger & Dürüm', turnover: 9600.00, count: 28, percent: 21.8, color: '#f97316' },
      { category: 'Pizzalar & Taş Fırın', turnover: 6400.00, count: 18, percent: 14.6, color: '#eab308' },
      { category: 'Tatlılar & Pastane', turnover: 4800.00, count: 24, percent: 10.9, color: '#ec4899' },
      { category: 'Sıcak & Soğuk İçecekler', turnover: 3350.00, count: 52, percent: 7.6, color: '#3b82f6' }
    ],
    payment_distribution: [
      { name: 'Kredi Kartı / POS', amount: 26800.00, percent: 61.0, color: '#3b82f6' },
      { name: 'Nakit', amount: 12450.00, percent: 28.3, color: '#10b981' },
      { name: 'Sodexo / Multinet', amount: 3100.00, percent: 7.1, color: '#8b5cf6' },
      { name: 'Açık Hesap (Cari)', amount: 1200.00, percent: 2.7, color: '#f59e0b' },
      { name: 'Online Ödeme', amount: 400.00, percent: 0.9, color: '#ec4899' }
    ]
  };

  const deliveryData = stats?.delivery || {
    total_turnover: 10980.00,
    total_orders: 22,
    avg_ticket: 499.09,
    on_the_way: 2,
    delivered: 19,
    cancelled: 1,
    platforms: [
      { name: 'Telefon / Restoran', orders: 8, turnover: 3840.00, share: 35.0, badge: 'bg-slate-700' },
      { name: 'Yemeksepeti', orders: 6, turnover: 2980.00, share: 27.2, badge: 'bg-rose-600' },
      { name: 'Getir Yemek', orders: 4, turnover: 2150.00, share: 19.6, badge: 'bg-purple-600' },
      { name: 'Trendyol Yemek', orders: 3, turnover: 1490.00, share: 13.6, badge: 'bg-orange-500' },
      { name: 'Migros Yemek', orders: 1, turnover: 520.00, share: 4.6, badge: 'bg-amber-600' }
    ],
    couriers: [
      { id: 1, name: 'Burak Demir (Motor 1)', phone: '0535 111 22 33', plate: '34 POS 01', deliveries_count: 14, cash_collected: 840.00, card_collected: 1460.00, avg_time: '22 dk', status: 'Dağıtımda' },
      { id: 2, name: 'Can Kurtaran (Motor 2)', phone: '0536 222 33 44', plate: '34 POS 02', deliveries_count: 8, cash_collected: 680.00, card_collected: 820.00, avg_time: '18 dk', status: 'Müsait' }
    ],
    orders: [
      { id: 101, order_no: 'PKT-9041', platform: 'Yemeksepeti', customer: 'Ali Vural', phone: '0532 *** 4512', address: 'Bağdat Cad. No:114 D:5', courier: 'Burak Demir', amount: 420.00, status: 'Yolda', time: '14:15', payment: 'Online Ödeme' },
      { id: 102, order_no: 'PKT-9042', platform: 'Telefon', customer: 'Selin Aydın', phone: '0544 *** 8920', address: 'Atatürk Mah. Lale Sok. 8/2', courier: 'Can Kurtaran', amount: 680.00, status: 'Teslim Edildi', time: '13:50', payment: 'Kapıda Nakit' },
      { id: 103, order_no: 'PKT-9043', platform: 'Getir Yemek', customer: 'Murat Kaya', phone: '0533 *** 1234', address: 'Moda Cad. No:44', courier: 'Burak Demir', amount: 340.00, status: 'Teslim Edildi', time: '13:30', payment: 'Online Ödeme' },
      { id: 104, order_no: 'PKT-9044', platform: 'Trendyol', customer: 'Ece Çetin', phone: '0555 *** 6789', address: 'Caddebostan İskele Sok. 12', courier: 'Burak Demir', amount: 510.00, status: 'Yolda', time: '14:20', payment: 'Online Ödeme' },
      { id: 105, order_no: 'PKT-9045', platform: 'Migros', customer: 'Hakan Koç', phone: '0530 *** 9988', address: 'Fenerbahçe Mah. Kalamış Cad.', courier: 'Can Kurtaran', amount: 290.00, status: 'Teslim Edildi', time: '13:10', payment: 'Online Ödeme' }
    ]
  };

  const channelData = stats?.channels?.channels || [
    { id: 'dine_in', name: 'Salon / Masa', description: 'Masa içi servis & kuver', orders: 62, turnover: 28400.00, share: 64.6, avg_ticket: 458.06, kuver: 148, avg_stay: '48 dk', color: 'emerald' },
    { id: 'delivery', name: 'Paket Servis (Kurye)', description: 'Telefon & Entegrasyonlar', orders: 22, turnover: 9800.00, share: 22.3, avg_ticket: 445.45, kuver: 22, avg_stay: '28 dk', color: 'rose' },
    { id: 'takeaway', name: 'Gel-Al (Tezgah)', description: 'Müşteri teslimatları', orders: 12, turnover: 3600.00, share: 8.2, avg_ticket: 300.00, kuver: 12, avg_stay: '8 dk', color: 'amber' },
    { id: 'qr_order', name: 'Masadan QR Sipariş', description: 'Temassız dijital menü', orders: 5, turnover: 2150.00, share: 4.9, avg_ticket: 430.00, kuver: 8, avg_stay: '35 dk', color: 'blue' }
  ];

  const waiterList = stats?.waiters && stats.waiters.length > 0 ? stats.waiters : [
    { waiter_name: '37799 - fatih', orders_count: 42, total_sales: 18450.00, total_kuver: 84, total_tip: 450.00, share: 42.0, badge: 'Günün Yıldızı', avg_bill: 439.28 },
    { waiter_name: 'Ahmet Garson', orders_count: 28, total_sales: 14200.00, total_kuver: 56, total_tip: 320.00, share: 32.3, badge: 'En Yüksek Ciro', avg_bill: 507.14 },
    { waiter_name: 'Ayşe Kasiyer', orders_count: 19, total_sales: 7900.00, total_kuver: 38, total_tip: 190.00, share: 18.0, badge: 'Hızlı Servis', avg_bill: 415.78 },
    { waiter_name: 'Kemal Müdür', orders_count: 12, total_sales: 3400.00, total_kuver: 24, total_tip: 120.00, share: 7.7, badge: 'Misafir Favorisi', avg_bill: 283.33 }
  ];

  // Filter & sort waiters
  const filteredWaiters = waiterList
    .filter((w: any) => w.waiter_name.toLowerCase().includes(waiterSearch.toLowerCase()))
    .sort((a: any, b: any) => {
      if (waiterSort === 'orders') return b.orders_count - a.orders_count;
      if (waiterSort === 'tips') return (b.total_tip || 0) - (a.total_tip || 0);
      if (waiterSort === 'kuver') return (b.total_kuver || 0) - (a.total_kuver || 0);
      return b.total_sales - a.total_sales;
    });

  const complimentaryData = stats?.complimentary || {
    total_treats: 680.00,
    total_voids: 760.00,
    total_discounts: 300.00,
    loss_rate_percent: 3.9,
    treat_items: [
      { id: 201, order_no: 'ORD-48651', table_name: 'Salon 1', product_name: 'Özel Hatay Künefesi', quantity: 1, amount: 250.00, reason: 'Müşteri Memnuniyeti', staff: 'Kemal Müdür', time: '14:15' },
      { id: 202, order_no: 'ORD-48618', table_name: 'Bahçe 3', product_name: 'Caffe Latte', quantity: 2, amount: 220.00, reason: 'Daimi Misafir İkramı', staff: 'Ahmet Garson', time: '13:30' },
      { id: 203, order_no: 'ORD-36101', table_name: 'Teras 2', product_name: 'San Sebastian Cheesecake', quantity: 1, amount: 210.00, reason: 'Doğum Günü Kutlaması', staff: 'Ayşe Kasiyer', time: '12:45' }
    ],
    void_items: [
      { id: 301, order_no: 'ORD-48601', table_name: 'Salon 4', product_name: 'Smoked Passion Mezcalita', quantity: 1, amount: 420.00, reason: 'Müşteri İptal Etti (Gecikti)', staff: '37799 - fatih', approved_by: 'Kemal Müdür', time: '14:05' },
      { id: 302, order_no: 'ORD-35990', table_name: 'Bahçe 1', product_name: 'Dana & Kuzu Izgara Köfte', quantity: 1, amount: 340.00, reason: 'Hatalı Masa Seçimi (Yeniden Açıldı)', staff: 'Ahmet Garson', approved_by: 'Kemal Müdür', time: '13:15' }
    ],
    discount_orders: [
      { id: 401, order_no: 'ORD-48651', table_name: 'Salon 1', amount: 180.00, rate: 10.0, reason: 'Personel / Kurumsal İndirimi', staff: 'Kemal Müdür', time: '14:25' },
      { id: 402, order_no: 'ORD-36101', table_name: 'Teras 2', amount: 120.00, rate: 5.0, reason: 'Sadakat Kartı Puanı', staff: 'Ayşe Kasiyer', time: '13:00' }
    ]
  };

  const exportToExcel = () => {
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
    <div className="flex-1 flex h-[calc(100vh-3.5rem)] bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden font-sans transition-colors duration-200">
      {/* Left Sidebar Submenu */}
      <div className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-sm shrink-0">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 text-xs font-black uppercase tracking-wider text-slate-400">
          Restaurant İstatistikleri
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { sound.beep(); setActiveTab(t.id); }}
              className={`w-full p-3 rounded-xl text-left text-xs font-bold transition flex items-center justify-between cursor-pointer relative ${
                activeTab === t.id
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white font-black'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <span>{t.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              {activeTab === t.id && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-7 bg-red-600 rounded-l-full" />
              )}
            </button>
          ))}
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
                    <div className="col-span-2 text-center">Kuver (Kişi)</div>
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
                      <div className="col-span-2 text-center font-mono">{w.total_kuver || 0}</div>
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
                    <div className="col-span-4">Satış Kanalı</div>
                    <div className="col-span-2 text-center">Sipariş Sayısı</div>
                    <div className="col-span-2 text-center">Kuver / Kişi</div>
                    <div className="col-span-2 text-right">Ortalama Masa Sepeti</div>
                    <div className="col-span-2 text-right">Kanal Cirosu</div>
                  </div>

                  {channelData.map((ch: any) => (
                    <div key={ch.id} className="grid grid-cols-12 p-4 items-center font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <div className="col-span-4 flex items-center gap-3">
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
                      <div className="col-span-2 text-center font-mono font-bold">{ch.kuver} Kişi</div>
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
                    onClick={() => setWaiterSort('kuver')}
                    className={`px-3 py-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                      waiterSort === 'kuver'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Kuver (Kişi)
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
                    <div className="col-span-1 text-center">Kuver</div>
                    <div className="col-span-2 text-right">Kuver Başı Tutar</div>
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
                      <div className="col-span-1 text-center font-mono font-bold">{w.total_kuver}</div>
                      <div className="col-span-2 text-right font-mono text-slate-500">
                        ₺{w.total_kuver > 0 ? (w.total_sales / w.total_kuver).toFixed(2) : (w.total_sales / Math.max(1, w.orders_count)).toFixed(2)}
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
        </div>
      </div>
    </div>
  );
};
