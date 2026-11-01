import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, CreditCard, Sparkles, LayoutDashboard, 
  KeyRound, ShieldCheck, LogOut, Globe, Utensils, 
  Menu, X, Phone, DollarSign, ArrowRight 
} from 'lucide-react';
import { MasterDashboardView } from './MasterDashboardView';
import { MasterTenantsView } from './MasterTenantsView';
import { MasterTenantUsersView } from './MasterTenantUsersView';
import { MasterLeadsView } from './MasterLeadsView';
import { MasterBillingView } from './MasterBillingView';
import { sound } from '../../services/sound';

interface MasterAdminLayoutProps {
  onLogout: () => void;
  onGoToLanding: () => void;
  onGoToPos: () => void;
}

export const MasterAdminLayout: React.FC<MasterAdminLayoutProps> = ({
  onLogout,
  onGoToLanding,
  onGoToPos
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tenants' | 'users' | 'leads' | 'billing'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Master Data
  const [stats, setStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Cross-view selection state
  const [selectedTenantIdForUsers, setSelectedTenantIdForUsers] = useState<number | null>(null);

  useEffect(() => {
    loadAllMasterData();
  }, []);

  const loadAllMasterData = async () => {
    setLoading(true);
    try {
      const t = Date.now();
      const [statsRes, tenantsRes, leadsRes, invRes] = await Promise.all([
        fetch(`/api/master/stats?_t=${t}`, { cache: 'no-store' }),
        fetch(`/api/master/tenants?_t=${t}`, { cache: 'no-store' }),
        fetch(`/api/master/leads?_t=${t}`, { cache: 'no-store' }),
        fetch(`/api/master/invoices?_t=${t}`, { cache: 'no-store' })
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (tenantsRes.ok) setTenants(await tenantsRes.json());
      if (leadsRes.ok) setLeads(await leadsRes.json());
      if (invRes.ok) setInvoices(await invRes.json());
    } catch (e) {
      console.warn('Master data load warning:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTenantUsers = (tenantId: number) => {
    setSelectedTenantIdForUsers(tenantId);
    setActiveTab('users');
  };

  const handleImpersonateTenant = (tenant: any) => {
    sound.cashDrawer();
    alert(`"${tenant.name}" restoranının POS paneline geçiliyor...`);
    onGoToPos();
  };

  const navItems = [
    { id: 'dashboard', label: 'Genel Bakış & Gelirler', icon: LayoutDashboard },
    { id: 'tenants', label: 'Tüm Restoranlar', icon: Building2, badge: tenants.length },
    { id: 'users', label: 'Restoran Kullanıcıları & Şifre', icon: KeyRound },
    { id: 'leads', label: 'Gelen Müşteri Talepleri', icon: Sparkles, badge: leads.filter(l => l.status === 'yeni').length || undefined },
    { id: 'billing', label: 'SaaS Finans & Abonelikler', icon: CreditCard }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      
      {/* Top Master Navbar */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 font-black">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-white text-sm sm:text-base tracking-tight">
                  BonCore <span className="text-emerald-400">Master Admin</span>
                </span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  SaaS Backoffice
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-bold hidden sm:block">
                Merkezi Restoran Ağı & Müşteri Yönetim Platformu
              </p>
            </div>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => { sound.beep(); onGoToLanding(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
            title="Tanıtım Web Sitesine Git"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Web Sitesi</span>
          </button>

          <button
            onClick={() => { sound.beep(); onGoToPos(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 text-xs font-bold transition cursor-pointer"
            title="Restoran POS Paneline Geç"
          >
            <Utensils className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Restoran POS</span>
          </button>

          <button
            onClick={() => { sound.beep(); onLogout(); }}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
            title="Master Admin Oturumunu Kapat"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Çıkış</span>
          </button>
        </div>
      </header>

      {/* Main Body with Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar */}
        <aside
          className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-slate-900/95 lg:bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-between transition-transform duration-200 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="space-y-1.5">
            <div className="text-[11px] font-black uppercase text-slate-500 tracking-wider px-3 mb-2">
              SaaS Yönetim Menüsü
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    sound.beep();
                    setActiveTab(item.id as any);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-black transition cursor-pointer select-none ${
                    isActive
                      ? 'bg-gradient-to-r from-brand-600 to-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Bottom Live System Stats Pill */}
          <div className="p-3.5 rounded-2xl bg-slate-850 border border-slate-800 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>SaaS API Motoru Aktif</span>
            </div>
            <div className="text-[11px] text-slate-500">
              {tenants.length} Restoran • ₺{Number(stats?.total_mrr || 0).toLocaleString('tr-TR')}/ay
            </div>
          </div>
        </aside>

        {/* Backdrop for mobile sidebar */}
        {isSidebarOpen && (
          <div 
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          />
        )}

        {/* Right Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {activeTab === 'dashboard' && (
            <MasterDashboardView
              stats={stats}
              leads={leads}
              tenants={tenants}
              onNavigateTab={(tab) => { sound.beep(); setActiveTab(tab as any); }}
              onRefresh={loadAllMasterData}
            />
          )}

          {activeTab === 'tenants' && (
            <MasterTenantsView
              tenants={tenants}
              onRefresh={loadAllMasterData}
              onSelectTenantUsers={handleSelectTenantUsers}
              onImpersonateTenant={handleImpersonateTenant}
            />
          )}

          {activeTab === 'users' && (
            <MasterTenantUsersView
              tenants={tenants}
              selectedTenantId={selectedTenantIdForUsers}
              onSelectTenant={(id) => setSelectedTenantIdForUsers(id)}
              onRefresh={loadAllMasterData}
            />
          )}

          {activeTab === 'leads' && (
            <MasterLeadsView
              leads={leads}
              onRefresh={loadAllMasterData}
            />
          )}

          {activeTab === 'billing' && (
            <MasterBillingView
              stats={stats}
              tenants={tenants}
              invoices={invoices}
              onRefresh={loadAllMasterData}
            />
          )}
        </main>

      </div>

    </div>
  );
};
