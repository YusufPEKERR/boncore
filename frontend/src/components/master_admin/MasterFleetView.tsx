import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, RefreshCw, Search, Tablet, Smartphone, 
  Tv, Monitor, DollarSign, ShoppingBag, Utensils, 
  CheckCircle2, AlertTriangle, Radio, Wifi, WifiOff, Clock
} from 'lucide-react';
import { sound } from '../../services/sound';

export interface FleetDeviceMetrics {
  total: number;
  tablets: number;
  handhelds: number;
  kds: number;
  pos: number;
}

export interface FleetLiveMetrics {
  live_revenue: number;
  active_orders: number;
  active_tables: number;
  today_orders: number;
}

export interface FleetTenantItem {
  id: number;
  code: string;
  name: string;
  city: string;
  plan: string;
  plan_code?: string;
  status: string;
  read_only_mode: boolean;
  is_online: boolean;
  last_seen_at: string;
  health_status: 'healthy' | 'warning' | 'offline';
  devices: FleetDeviceMetrics;
  metrics: FleetLiveMetrics;
}

export const MasterFleetView: React.FC = () => {
  const [fleet, setFleet] = useState<FleetTenantItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'warning'>('all');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const timerRef = useRef<any>(null);

  const fetchFleetData = async (isManual = false) => {
    if (isManual) {
      sound.beep();
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/master/fleet?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setFleet(Array.isArray(data) ? data : []);
        setLastRefreshedAt(new Date());
      }
    } catch (err) {
      console.warn('Fleet fetch warning:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFleetData();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        fetchFleetData(false);
      }, 10000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh]);

  // Relative time helper
  const formatTimeAgo = (dateStr: string): string => {
    if (!dateStr || dateStr.startsWith('0001')) return 'Bilinmiyor';
    const past = new Date(dateStr).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - past) / 1000);

    if (diffSec < 0 || isNaN(diffSec)) return 'Az önce';
    if (diffSec < 45) return `${Math.max(1, diffSec)} sn önce`;
    if (diffSec < 90) return '1 dk önce';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} dk önce`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} sa önce`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} gün önce`;
  };

  // Filtered fleet list
  const filteredFleet = useMemo(() => {
    return fleet.filter((item) => {
      const matchesSearch = 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.city && item.city.toLowerCase().includes(searchTerm.toLowerCase()));

      let matchesStatus = true;
      if (statusFilter === 'online') matchesStatus = item.is_online;
      else if (statusFilter === 'offline') matchesStatus = !item.is_online;
      else if (statusFilter === 'warning') matchesStatus = item.health_status === 'warning' || item.read_only_mode;

      return matchesSearch && matchesStatus;
    });
  }, [fleet, searchTerm, statusFilter]);

  // Aggregate stats
  const totalTenants = fleet.length;
  const onlineTenants = fleet.filter(f => f.is_online).length;
  const totalActiveDevices = fleet.reduce((acc, f) => acc + (f.devices?.total || 0), 0);
  const totalLiveRevenue = fleet.reduce((acc, f) => acc + (f.metrics?.live_revenue || 0), 0);
  const totalActiveOrders = fleet.reduce((acc, f) => acc + (f.metrics?.active_orders || 0), 0);

  return (
    <div className="space-y-6">
      
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Canlı Filo & Radar Takibi
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold uppercase">
                  Canlı Telemetri
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Tüm bağlı restoranların anlık online durumu, el terminalleri, tabletler, mutfak KDS ve canlı ciro nabzı.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
              autoRefresh 
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50' 
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title="Otomatik 10 saniyelik yenilemeyi aç/kapat"
          >
            <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span>Oto-Yenileme: {autoRefresh ? 'Açık (10s)' : 'Kapalı'}</span>
          </button>

          <button
            onClick={() => fetchFleetData(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : 'text-slate-400'}`} />
            <span>Yenile</span>
          </button>
        </div>
      </div>

      {/* Top KPI Pulse Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Toplam Restoran</span>
            <Wifi className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-black text-white">{totalTenants}</div>
          <div className="text-[11px] text-slate-500 mt-1">Platformdaki kayıtlı şubeler</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Çevrimiçi Filo</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-emerald-400">
            {onlineTenants} <span className="text-xs font-bold text-slate-400">/ {totalTenants}</span>
          </div>
          <div className="text-[11px] text-emerald-400/80 mt-1">
            %{totalTenants > 0 ? Math.round((onlineTenants / totalTenants) * 100) : 0} Anlık Uptime
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Bağlı Terminal Cihazları</span>
            <Smartphone className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-blue-400">{totalActiveDevices}</div>
          <div className="text-[11px] text-slate-500 mt-1">Tablet, El Terminali & KDS</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Bugünkü Canlı Ciro</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">
            ₺{totalLiveRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Anlık tamamlanan tahsilatlar</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Aktif Açık Masa / Sipariş</span>
            <Utensils className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400">{totalActiveOrders}</div>
          <div className="text-[11px] text-slate-500 mt-1">İşlemde olan adisyonlar</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-900 p-3 rounded-2xl border border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Restoran adı, kod veya şehir ara..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
              statusFilter === 'all'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Tümü ({fleet.length})
          </button>
          <button
            onClick={() => setStatusFilter('online')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 shrink-0 ${
              statusFilter === 'online'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Çevrimiçi ({onlineTenants})
          </button>
          <button
            onClick={() => setStatusFilter('offline')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 shrink-0 ${
              statusFilter === 'offline'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            Çevrimdışı ({fleet.filter(f => !f.is_online).length})
          </button>
          <button
            onClick={() => setStatusFilter('warning')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 shrink-0 ${
              statusFilter === 'warning'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Uyarı ({fleet.filter(f => f.health_status === 'warning' || f.read_only_mode).length})
          </button>
        </div>
      </div>

      {/* Fleet Radar Grid */}
      {filteredFleet.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 rounded-3xl border border-slate-800">
          <WifiOff className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">Eşleşen Restoran Bulunamadı</h3>
          <p className="text-xs text-slate-500 mt-1">Arama kriterlerinize uyan aktif veya pasif bir terminal kaydı yok.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredFleet.map((tenant) => {
            const isOnline = tenant.is_online;
            const devices = tenant.devices || { total: 0, tablets: 0, handhelds: 0, kds: 0, pos: 0 };
            const metrics = tenant.metrics || { live_revenue: 0, active_orders: 0, active_tables: 0, today_orders: 0 };

            return (
              <div 
                key={tenant.id}
                className={`p-5 rounded-3xl border transition-all duration-200 relative overflow-hidden ${
                  isOnline 
                    ? 'bg-slate-900 border-slate-700/80 hover:border-emerald-500/50 shadow-lg shadow-black/20' 
                    : 'bg-slate-900/60 border-slate-800 opacity-80 hover:opacity-100'
                }`}
              >
                {/* Status indicator bar */}
                <div className={`h-1.5 w-full absolute top-0 left-0 ${
                  tenant.health_status === 'warning' || tenant.read_only_mode
                    ? 'bg-amber-500'
                    : isOnline 
                      ? 'bg-emerald-500' 
                      : 'bg-slate-700'
                }`} />

                {/* Card Top: Title, Code, Online Pulse */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-white text-base leading-tight truncate max-w-[200px]">
                        {tenant.name}
                      </h3>
                      {isOnline ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-800">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Çevrimiçi
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                          Çevrimdışı
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span className="font-mono text-[11px] text-slate-300">@{tenant.code}</span>
                      <span>•</span>
                      <span>{tenant.city || 'Şehir Belirtilmedi'}</span>
                      <span>•</span>
                      <span className="uppercase text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                        {tenant.plan || 'pro'}
                      </span>
                    </div>
                  </div>

                  {tenant.read_only_mode && (
                    <span className="px-2 py-1 rounded-xl bg-amber-950/60 text-amber-400 border border-amber-800/60 text-[10px] font-black uppercase tracking-wider">
                      Salt Okunur
                    </span>
                  )}
                </div>

                {/* Device breakdown pills */}
                <div className="mb-4 p-3 rounded-2xl bg-slate-850 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                    <span>Bağlı Aktif Donanım</span>
                    <span className="font-black text-white">{devices.total} Cihaz</span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-750">
                      <Tablet className="w-3.5 h-3.5 text-blue-400 mx-auto mb-1" />
                      <div className="text-xs font-black text-white">{devices.tablets}</div>
                      <div className="text-[9px] text-slate-400">Tablet</div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-750">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
                      <div className="text-xs font-black text-white">{devices.handhelds}</div>
                      <div className="text-[9px] text-slate-400">El POS</div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-750">
                      <Tv className="w-3.5 h-3.5 text-orange-400 mx-auto mb-1" />
                      <div className="text-xs font-black text-white">{devices.kds}</div>
                      <div className="text-[9px] text-slate-400">KDS</div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-750">
                      <Monitor className="w-3.5 h-3.5 text-purple-400 mx-auto mb-1" />
                      <div className="text-xs font-black text-white">{devices.pos}</div>
                      <div className="text-[9px] text-slate-400">Ana POS</div>
                    </div>
                  </div>
                </div>

                {/* Live pulse operational metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-emerald-400" />
                      <span>Bugünkü Ciro</span>
                    </div>
                    <div className="font-black text-emerald-400 text-sm mt-0.5">
                      ₺{Number(metrics.live_revenue || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3 text-amber-400" />
                      <span>Açık Adisyon / Masa</span>
                    </div>
                    <div className="font-black text-white text-sm mt-0.5">
                      {metrics.active_orders} Sipariş ({metrics.active_tables} Masa)
                    </div>
                  </div>
                </div>

                {/* Footer: Last heartbeat timestamp */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Son Sinyal: <strong className="text-slate-300">{formatTimeAgo(tenant.last_seen_at)}</strong></span>
                  </div>
                  {isOnline && (
                    <span className="text-emerald-500 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Telemetri Aktif
                    </span>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Auto-refresh info footer */}
      <div className="text-center text-xs text-slate-500 pt-2">
        Son veri güncellemesi: {lastRefreshedAt.toLocaleTimeString('tr-TR')} • 
        {autoRefresh ? ' Otomatik telemetri döngüsü devrede (10s).' : ' Otomatik yenileme duraklatıldı.'}
      </div>

    </div>
  );
};
