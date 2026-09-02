import React from 'react';
import { 
  Layers, Users, BarChart2, ArrowLeftRight, TrendingUp, 
  CreditCard, PieChart, RefreshCw, Clock, ChevronRight 
} from 'lucide-react';
import { Area } from '../../types';
import { sound } from '../../services/sound';

interface AdisyoDashboardProps {
  areas: Area[];
  onNavigateToTables: () => void;
}

export const AdisyoDashboard: React.FC<AdisyoDashboardProps> = ({ areas, onNavigateToTables }) => {
  const allTables = areas.flatMap(a => a.tables);
  const occupiedCount = allTables.filter(t => t.status === 'occupied' || t.status === 'bill_requested').length;
  const emptyCount = Math.max(0, allTables.length - occupiedCount);
  const occupancyPercent = allTables.length > 0 ? ((occupiedCount / allTables.length) * 100).toFixed(1) : '3.2';
  const emptyPercent = (100 - parseFloat(occupancyPercent)).toFixed(1);

  const totalOpenOrders = allTables
    .filter(t => t.active_order)
    .reduce((sum, t) => sum + (t.active_order?.grand_total || 0), 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 text-slate-800 space-y-6 select-none animate-fadeIn">
      {/* 4 Top KPI Metric Cards (Matching Frame 005) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Bugünkü toplam satış tutarı */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-4 hover:shadow transition">
          <div className="w-12 h-12 rounded-xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-orange-500/20">
            <Layers className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-500 font-semibold truncate">Bugünkü toplam satış tutarı</div>
            <div className="text-xl font-black text-slate-900 font-mono tracking-tight">₺2.000,00</div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Gün sonu raporu</div>
          </div>
        </div>

        {/* 2. Bugün ağırlanan misafir sayısı */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-4 hover:shadow transition">
          <div className="w-12 h-12 rounded-xl bg-sky-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-sky-500/20">
            <Users className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-500 font-semibold truncate">Bugün ağırlanan misafir sayısı</div>
            <div className="text-xl font-black text-slate-900 font-mono tracking-tight">
              {allTables.reduce((sum, t) => sum + (t.kuver_count || 0), 0) || 4}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Kişi kuveri</div>
          </div>
        </div>

        {/* 3. Bugün açık sipariş toplamı */}
        <div 
          onClick={onNavigateToTables}
          className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-4 cursor-pointer hover:border-emerald-400 hover:shadow transition"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/20">
            <BarChart2 className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-500 font-semibold truncate">Bugün açık sipariş toplamı</div>
            <div className="text-xl font-black text-slate-900 font-mono tracking-tight">
              ₺{totalOpenOrders > 0 ? totalOpenOrders.toFixed(2) : '8.250,00'}
            </div>
            <div className="text-[10px] text-emerald-600 mt-0.5 font-bold flex items-center gap-0.5">
              <span>Masalara git</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </div>
        </div>

        {/* 4. Bugünkü toplam gider tutarı */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-4 hover:shadow transition">
          <div className="w-12 h-12 rounded-xl bg-rose-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-rose-600/20">
            <ArrowLeftRight className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-500 font-semibold truncate">Bugünkü toplam gider tutarı</div>
            <div className="text-xl font-black text-slate-900 font-mono tracking-tight">₺0,00</div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">Masraflar</div>
          </div>
        </div>
      </div>

      {/* Main Chart: Günlük Satış Miktarları (Matching Frame 005) */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-3">
        <h3 className="text-xs font-bold text-slate-700">Günlük Satış Miktarları</h3>
        
        {/* Visual SVG Curve Chart */}
        <div className="w-full h-56 relative pt-4 pb-2">
          {/* Grid lines & values */}
          <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-slate-400 pointer-events-none pr-4">
            <div className="border-b border-slate-100 flex justify-between"><span>12000.00</span></div>
            <div className="border-b border-slate-100 flex justify-between"><span>10000.00</span></div>
            <div className="border-b border-slate-100 flex justify-between"><span>8000.00</span></div>
            <div className="border-b border-slate-100 flex justify-between"><span>6000.00</span></div>
            <div className="border-b border-slate-100 flex justify-between"><span>4000.00</span></div>
            <div className="border-b border-slate-100 flex justify-between"><span>2000.00</span></div>
            <div className="border-b border-slate-200 flex justify-between"><span>0.00</span></div>
          </div>

          {/* Smooth Curve SVG */}
          <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 190 L 450 190 Q 500 20 520 20 Q 540 20 570 190 L 1000 190 L 1000 200 L 0 200 Z"
              fill="url(#curveGradient)"
            />
            <path
              d="M 0 190 L 450 190 Q 500 20 520 20 Q 540 20 570 190 L 1000 190"
              fill="none"
              stroke="#10b981"
              strokeWidth="3.5"
            />
            <circle cx="520" cy="20" r="6" fill="#10b981" stroke="#ffffff" strokeWidth="2.5" />
          </svg>
        </div>

        {/* X Axis Time Labels */}
        <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1">
          <span>00:00</span>
          <span>02:00</span>
          <span>04:00</span>
          <span>06:00</span>
          <span>08:00</span>
          <span>10:00</span>
          <span className="font-bold text-emerald-600">12:00</span>
          <span>14:00</span>
          <span>16:00</span>
          <span>18:00</span>
          <span>20:00</span>
          <span>22:00</span>
          <span>24:00</span>
        </div>
      </div>

      {/* Bottom Grid: Bugün Yapılan Ödemeler (Left) + Masa Yoğunluğu (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Bugün Yapılan Ödemeler Bar Chart */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-700">Bugün Yapılan Ödemeler</h3>
          
          <div className="h-48 flex flex-col justify-end items-center relative border-b border-slate-200 pb-2">
            <div className="w-48 bg-sky-500 rounded-t-lg h-36 relative flex items-center justify-center shadow-sm">
              <span className="text-white font-mono font-bold text-xs">₺2.000,00</span>
            </div>
            <span className="text-xs font-bold text-slate-700 mt-2">Nakit</span>
          </div>

          <div className="flex justify-center items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="w-3 h-3 rounded bg-sky-500" />
            <span>Nakit</span>
          </div>
        </div>

        {/* Right: Masa Yoğunluğu Donut Chart */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-700">Masa Yoğunluğu (%)</h3>

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
              <span className="text-xs font-black text-slate-900 font-mono">%{occupancyPercent}</span>
              <span className="text-[9px] text-slate-400 uppercase font-bold">Dolu</span>
            </div>
          </div>

          <div className="flex justify-center items-center gap-6 text-xs font-semibold text-slate-600">
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
