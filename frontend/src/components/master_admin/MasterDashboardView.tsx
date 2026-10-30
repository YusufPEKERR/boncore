import React from 'react';
import { 
  Building2, TrendingUp, Users, DollarSign, Phone, 
  ArrowUpRight, AlertCircle, CheckCircle2, Clock, 
  Sparkles, ShieldCheck, ChevronRight, MessageSquare 
} from 'lucide-react';
import { sound } from '../../services/sound';

interface MasterDashboardViewProps {
  stats: any;
  leads: any[];
  tenants: any[];
  onNavigateTab: (tab: string) => void;
  onRefresh: () => void;
}

export const MasterDashboardView: React.FC<MasterDashboardViewProps> = ({
  stats,
  leads,
  tenants,
  onNavigateTab,
  onRefresh
}) => {
  const newLeads = leads.filter(l => l.status === 'yeni');

  return (
    <div className="space-y-6">
      
      {/* Top Welcome & Quick Refresh Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <span>SaaS Platform Genel Bakış & Performans</span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-800">
              CANLI
            </span>
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Tüm restoran ağınızın toplam ciro, aktif abonelik, müşteri talepleri ve finansal metrikleri.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.beep(); onRefresh(); }}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition cursor-pointer shadow-xs"
          >
            🔄 Verileri Yenile
          </button>
          <button
            onClick={() => { sound.beep(); onNavigateTab('tenants'); }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 hover:from-brand-500 hover:to-emerald-500 text-white text-xs font-black transition cursor-pointer shadow-md flex items-center gap-1.5"
          >
            <span>+ Yeni Restoran Ekle</span>
          </button>
        </div>
      </div>

      {/* Main SaaS KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Toplam Restoran */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold text-slate-400">Kayıtlı Restoranlar</div>
              <div className="text-2xl sm:text-3xl font-black text-white mt-1">
                {stats?.total_tenants || tenants.length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <Building2 className="w-5 h-5" />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs pt-2 border-t border-slate-800/80">
            <span className="text-emerald-400 font-bold">● {stats?.active_tenants || 0} Aktif</span>
            <span className="text-slate-600">•</span>
            <span className="text-blue-400 font-bold">● {stats?.trial_tenants || 0} Deneme</span>
            <span className="text-slate-600">•</span>
            <span className="text-red-400 font-bold">● {stats?.suspended_tenants || 0} Askıda</span>
          </div>
        </div>

        {/* KPI 2: MRR (Aylık Düzenli Gelir) */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold text-slate-400">Aylık Düzenli Gelir (MRR)</div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">
                ₺{Number(stats?.total_mrr || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>

          <div className="text-xs text-slate-400 font-medium pt-2 border-t border-slate-800/80">
            Yıllık Koşu Hızı (ARR): <b className="text-white">₺{Number(stats?.total_arr || 0).toLocaleString('tr-TR')}</b>
          </div>
        </div>

        {/* KPI 3: Gelen Müşteri Talepleri */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold text-slate-400">Gelen Demo Talepleri</div>
              <div className="text-2xl sm:text-3xl font-black text-amber-400 mt-1">
                {stats?.total_leads || leads.length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <Phone className="w-5 h-5" />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80">
            <span className="text-amber-400 font-bold">{newLeads.length} Yeni Arama Bekleyen</span>
            <button
              onClick={() => onNavigateTab('leads')}
              className="text-xs text-brand-400 hover:text-white font-bold cursor-pointer"
            >
              Talepleri Aç →
            </button>
          </div>
        </div>

        {/* KPI 4: Tahsilat Durumu */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold text-slate-400">Bu Ay Tahsil Edilen</div>
              <div className="text-2xl sm:text-3xl font-black text-white mt-1">
                ₺{Number(stats?.paid_invoices_sum || 0).toLocaleString('tr-TR')}
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="text-xs text-slate-400 font-medium pt-2 border-t border-slate-800/80">
            Geciken / Bekleyen: <b className="text-amber-400">₺{Number(stats?.pending_invoices_sum || 0).toLocaleString('tr-TR')}</b>
          </div>
        </div>

      </div>

      {/* Two Column Grid: Leads Action Box & Plan Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (7 cols): Gelen Müşteri Talepleri & Hızlı Arama */}
        <div className="lg:col-span-7 bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Web Sitesinden Gelen Yeni Müşteri & Demo Talepleri
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('leads')}
              className="text-xs font-bold text-brand-400 hover:text-emerald-300 transition cursor-pointer"
            >
              Tümünü Gör ({leads.length}) →
            </button>
          </div>

          {newLeads.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Bekleyen yeni talep bulunmuyor. Tüm adaylarla iletişim kuruldu.
            </div>
          ) : (
            <div className="space-y-3">
              {newLeads.slice(0, 3).map((lead) => (
                <div
                  key={lead.id}
                  className="p-4 rounded-2xl bg-slate-850 border border-slate-800 hover:border-slate-700 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-white">{lead.company_name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                        {lead.business_type?.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-medium mt-1">
                      Yetkili: <b className="text-slate-200">{lead.full_name}</b> • {lead.city} • Tel: <b className="text-emerald-400">{lead.phone}</b>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`tel:${lead.phone}`}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Ara</span>
                    </a>
                    <a
                      href={`https://wa.me/90${lead.phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column (5 cols): Plan Dağılımı & Sistem Durumu */}
        <div className="lg:col-span-5 bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-sm space-y-4">
          <div className="pb-3 border-b border-slate-800">
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Abonelik Paket Dağılımı
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Hangi plandan kaç restoran hizmet alıyor?
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-slate-850 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-black text-white">Başlangıç Paketi (₺790/ay)</div>
                <div className="text-[11px] text-slate-400">Küçük işletmeler & take-away</div>
              </div>
              <span className="text-lg font-black text-emerald-400">
                {stats?.plan_counts?.starter || 0} Restoran
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-850 border border-emerald-500/40 flex items-center justify-between shadow-xs">
              <div>
                <div className="text-xs font-black text-emerald-300">Profesyonel Paket (₺1.490/ay) ★</div>
                <div className="text-[11px] text-slate-400">Tam restoran, masa & KDS</div>
              </div>
              <span className="text-lg font-black text-emerald-400">
                {stats?.plan_counts?.pro || 0} Restoran
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-850 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-black text-white">Kurumsal & Zincir (₺2.990/ay)</div>
                <div className="text-[11px] text-slate-400">Çok şubeli & otel entegrasyonu</div>
              </div>
              <span className="text-lg font-black text-emerald-400">
                {stats?.plan_counts?.enterprise || 0} Restoran
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-[11px] font-bold text-emerald-300 text-center">
            🚀 Toplam Yıllık SaaS Değeri: ₺{Number((stats?.total_mrr || 0) * 12).toLocaleString('tr-TR')}
          </div>
        </div>

      </div>

    </div>
  );
};
