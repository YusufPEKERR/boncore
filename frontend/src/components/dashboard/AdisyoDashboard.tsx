import React, { useState, useEffect, useRef } from 'react';
import { 
  Layers, Users, BarChart2, ArrowLeftRight, TrendingUp, 
  CreditCard, PieChart, RefreshCw, Clock, ChevronRight, Utensils, Wallet 
} from 'lucide-react';
import { Area } from '../../types';
import { sound } from '../../services/sound';
import { api } from '../../services/api';

interface AdisyoDashboardProps {
  areas: Area[];
  onNavigateToTables: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const AdisyoDashboard: React.FC<AdisyoDashboardProps> = ({ areas, onNavigateToTables, onNavigateTab }) => {
  const [stats, setStats] = useState<any>(null);
  const [expensesTotal, setExpensesTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Live Real-Time Date & Clock State
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const lastDayRef = useRef<number>(new Date().getDate());

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      // Auto-refresh when crossing midnight into a new business day
      if (now.getDate() !== lastDayRef.current) {
        lastDayRef.current = now.getDate();
        loadDashboardData();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const turkishDaysFull = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const turkishMonthsFull = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  const liveFullDateStr = `${currentTime.getDate()} ${turkishMonthsFull[currentTime.getMonth()]} ${currentTime.getFullYear()}, ${turkishDaysFull[currentTime.getDay()]}`;
  const liveTimeStr = currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  useEffect(() => {
    loadDashboardData();
  }, [areas]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsData, expData] = await Promise.all([
        api.getRestaurantStatistics('all'),
        api.getExpenses()
      ]);
      setStats(statsData);
      if (Array.isArray(expData)) {
        const totalExp = expData
          .filter(e => e.expense_type === 'out' || e.type === 'out')
          .reduce((sum, e) => sum + (e.amount || 0), 0);
        setExpensesTotal(totalExp);
      }
    } catch (e) {
      console.warn('Dashboard data load warning:', e);
    } finally {
      setLoading(false);
    }
  };

  const allTables = areas.flatMap(a => a.tables);
  const occupiedCount = allTables.filter(t => t.status === 'occupied' || t.status === 'bill_requested').length;
  const emptyCount = Math.max(0, allTables.length - occupiedCount);
  const occupancyPercent = allTables.length > 0 ? ((occupiedCount / allTables.length) * 100).toFixed(1) : '0.0';
  const emptyPercent = (100 - parseFloat(occupancyPercent)).toFixed(1);

  const totalOpenOrders = allTables
    .filter(t => t.active_order)
    .reduce((sum, t) => sum + (t.active_order?.grand_total || 0), 0);

  // Live KPI values
  const liveTurnover = stats?.total_turnover ?? 0;
  const activeTableCount = allTables.filter(t => t.status !== 'empty').length;

  // Dynamic Hourly Chart Data from real backend statistics
  const hourlyPoints: { hour: string; turnover: number; orders: number }[] =
    Array.isArray(stats?.chart_data?.hourly_sales) && stats.chart_data.hourly_sales.length > 0
      ? stats.chart_data.hourly_sales
      : [
          { hour: '09:00', turnover: 0, orders: 0 },
          { hour: '11:00', turnover: 0, orders: 0 },
          { hour: '13:00', turnover: 0, orders: 0 },
          { hour: '15:00', turnover: 0, orders: 0 },
          { hour: '17:00', turnover: 0, orders: 0 },
          { hour: '19:00', turnover: 0, orders: 0 },
          { hour: '21:00', turnover: 0, orders: 0 },
          { hour: '23:00', turnover: 0, orders: 0 }
        ];

  const maxHourTurnover = Math.max(1000, ...hourlyPoints.map(p => p.turnover || 0));
  const yAxisSteps = [1, 0.83, 0.66, 0.5, 0.33, 0.16, 0].map(r => Math.round(maxHourTurnover * r));

  const svgCoords = hourlyPoints.map((pt, idx) => {
    const x = hourlyPoints.length > 1 ? Math.round((idx / (hourlyPoints.length - 1)) * 1000) : 500;
    const y = Math.round(190 - ((pt.turnover || 0) / maxHourTurnover) * 165);
    return { x, y, ...pt };
  });

  const linePath = svgCoords.length > 0
    ? svgCoords.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ')
    : 'M 0 190 L 1000 190';
  const areaPath = `${linePath} L 1000 200 L 0 200 Z`;
  const peakPoint = svgCoords.reduce((best, cur) => (cur.turnover >= best.turnover ? cur : best), svgCoords[0] || { x: 500, y: 190, turnover: 0, hour: '' });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 space-y-6 select-none animate-fadeIn transition-colors duration-200">
      {/* Live Operational Day & Time Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">
                {liveFullDateStr}
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Canlı Çalışma Günü</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Tüm cirolar, saatlik satışlar ve masa istatistikleri canlı Türkiye saatine (UTC+3) göre anlık güncellenir.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:border-l sm:pl-4 border-slate-200 dark:border-slate-800">
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Canlı Sistem Saati</div>
            <div className="font-mono text-base font-black text-slate-900 dark:text-white tracking-wider">
              {liveTimeStr}
            </div>
          </div>
          <button
            onClick={() => { sound.beep(); loadDashboardData(); }}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
            title="Verileri Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-red-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* 4 Top KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Bugünkü toplam satış tutarı */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:shadow transition">
          <div className="w-12 h-12 rounded-xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-orange-500/20">
            <Layers className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold truncate">Toplam satış tutarı (Ciro)</div>
            <div className="text-xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
              ₺{liveTurnover.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{stats?.total_orders ?? 0} Adet Adisyon</div>
          </div>
        </div>

        {/* 2. Bugünkü adisyon sayısı */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:shadow transition">
          <div className="w-12 h-12 rounded-xl bg-sky-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-sky-500/20">
            <Users className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold truncate">Toplam adisyon sayısı</div>
            <div className="text-xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
              {stats?.total_orders ?? 0}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{activeTableCount} Aktif Masa</div>
          </div>
        </div>

        {/* 3. Bugün açık sipariş toplamı */}
        <div 
          onClick={onNavigateToTables}
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4 cursor-pointer hover:border-emerald-400 hover:shadow transition"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/20">
            <BarChart2 className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold truncate">Açık masa sipariş toplamı</div>
            <div className="text-xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
              ₺{totalOpenOrders.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-bold flex items-center gap-0.5">
              <span>Masalara git ({occupiedCount} Dolu)</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </div>
        </div>

        {/* 4. Bugünkü toplam gider tutarı */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:shadow transition">
          <div className="w-12 h-12 rounded-xl bg-rose-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-rose-600/20">
            <ArrowLeftRight className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold truncate">Bugünkü toplam gider tutarı</div>
            <div className="text-xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
              ₺{expensesTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Kasa harcamaları</div>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <button
          onClick={() => { sound.beep(); onNavigateTab ? onNavigateTab('tables') : onNavigateToTables(); }}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500 shadow-xs hover:shadow transition text-left flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-bold group-hover:scale-105 transition">
            <Utensils className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">Masalar / Salon</div>
            <div className="text-[10px] text-slate-400">Canlı Kat Planı</div>
          </div>
        </button>

        <button
          onClick={() => { sound.beep(); onNavigateTab?.('cashier'); }}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-sky-500 shadow-xs hover:shadow transition text-left flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 flex items-center justify-center font-bold group-hover:scale-105 transition">
            <Wallet className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">Kasa & Ödemeler</div>
            <div className="text-[10px] text-slate-400">Tahsilat & Çekmece</div>
          </div>
        </button>

        <button
          onClick={() => { sound.beep(); onNavigateTab?.('kds'); }}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-amber-500 shadow-xs hover:shadow transition text-left flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center font-bold group-hover:scale-105 transition">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">Mutfak (KDS)</div>
            <div className="text-[10px] text-slate-400">Sipariş Ekranı</div>
          </div>
        </button>

        <button
          onClick={() => { sound.beep(); onNavigateTab?.('product_sales_report'); }}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-purple-500 shadow-xs hover:shadow transition text-left flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center font-bold group-hover:scale-105 transition">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">Ürün Satış Raporu</div>
            <div className="text-[10px] text-purple-600 font-bold">Porsiyon & Ciro</div>
          </div>
        </button>

        <button
          onClick={() => { sound.beep(); onNavigateTab?.('day_end_report'); }}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-red-500 shadow-xs hover:shadow transition text-left flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-600 flex items-center justify-center font-bold group-hover:scale-105 transition">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">Gün Sonu (Z)</div>
            <div className="text-[10px] text-red-600 font-bold">Mali Kapanış</div>
          </div>
        </button>
      </div>

      {/* Main Chart: Günlük Satış Miktarları (Real Hourly Breakdown) */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">Saatlik Satış Dağılımı (Canlı Veritabanı Akışı)</h3>
          <button
            onClick={() => { sound.beep(); loadDashboardData(); }}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
        </div>
        
        {/* Visual SVG Curve Chart */}
        <div className="w-full h-56 relative pt-4 pb-2">
          {/* Grid lines & values */}
          <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-slate-400 pointer-events-none pr-4">
            {yAxisSteps.map((val, i) => (
              <div key={i} className="border-b border-slate-100 dark:border-slate-800 flex justify-between">
                <span>₺{val.toLocaleString('tr-TR')}</span>
              </div>
            ))}
          </div>

          {/* Dynamic SVG from real hourly_sales */}
          <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#curveGradient)" />
            <path d={linePath} fill="none" stroke="#10b981" strokeWidth="3.5" />
            {svgCoords.map((pt, i) =>
              pt.turnover > 0 ? (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={pt.hour === peakPoint.hour ? 6 : 4}
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              ) : null
            )}
          </svg>
        </div>

        {/* X Axis Time Labels */}
        <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1 overflow-x-auto">
          {hourlyPoints.map((pt, i) => (
            <span
              key={i}
              className={pt.turnover > 0 && pt.hour === peakPoint.hour ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''}
            >
              {pt.hour}
            </span>
          ))}
        </div>
      </div>


      {/* Bottom Grid: Bugün Yapılan Ödemeler (Left) + Masa Yoğunluğu (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Bugün Yapılan Ödemeler Bar Chart */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">Bugün Yapılan Ödemeler</h3>
            <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">
              Toplam: ₺{liveTurnover.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          
          <div className="h-48 flex items-end justify-center gap-6 border-b border-slate-200 dark:border-slate-700 pb-2">
            {stats?.daily_turnover?.payment_breakdown ? (
              Object.entries(stats.daily_turnover.payment_breakdown).map(([k, p]: [string, any]) => {
                const heightPercent = liveTurnover > 0 ? Math.min(100, Math.max(15, (p.amount / liveTurnover) * 100)) : 20;
                return (
                  <div key={k} className="flex flex-col items-center gap-1.5 flex-1 max-w-[80px]">
                    <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">₺{p.amount.toFixed(0)}</span>
                    <div 
                      style={{ height: `${heightPercent}%` }} 
                      className={`w-full rounded-t-lg shadow-sm transition-all duration-500 ${
                        k === 'cash' ? 'bg-sky-500' : k === 'credit_card' ? 'bg-indigo-500' : 'bg-emerald-500'
                      }`}
                    />
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate w-full text-center">
                      {p.name || k}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-32 bg-sky-500 rounded-t-lg h-32 flex items-center justify-center shadow-sm">
                  <span className="text-white font-mono font-bold text-xs">₺{liveTurnover.toFixed(2)}</span>
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-2">Nakit & Kart</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Masa Yoğunluğu Donut Chart */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">Masa Yoğunluğu (%)</h3>

          <div className="h-48 flex items-center justify-center relative">
            <svg className="w-36 h-36 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#10e78c"
                strokeWidth="16"
              />
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#0284c7"
                strokeWidth="16"
                strokeDasharray={`${parseFloat(occupancyPercent) * 2.38} 238`}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-xs font-black text-slate-900 dark:text-white font-mono">%{occupancyPercent}</span>
              <span className="text-[9px] text-slate-400 uppercase font-bold">Dolu</span>
            </div>
          </div>

          <div className="flex justify-center items-center gap-6 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-sky-600" />
              <span>Dolu (%{occupancyPercent})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
              <span>Boş (%{emptyPercent})</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
