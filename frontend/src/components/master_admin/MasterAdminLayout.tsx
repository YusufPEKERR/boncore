import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, CreditCard, Sparkles, LayoutDashboard, 
  KeyRound, ShieldCheck, LogOut, Globe, Utensils, 
  Menu, X, Phone, DollarSign, ArrowRight, Activity, 
  GitBranch, Megaphone, LifeBuoy, HardDrive, Sun, Moon
} from 'lucide-react';
import { MasterDashboardView } from './MasterDashboardView';
import { MasterTenantsView } from './MasterTenantsView';
import { MasterTenantUsersView } from './MasterTenantUsersView';
import { MasterLeadsView } from './MasterLeadsView';
import { MasterBillingView } from './MasterBillingView';
import { MasterFleetView } from './MasterFleetView';
import { MasterFranchiseView } from './MasterFranchiseView';
import { MasterBroadcastView } from './MasterBroadcastView';
import { MasterTicketsView } from './MasterTicketsView';
import { MasterBackupQuotaView } from './MasterBackupQuotaView';
import { sound } from '../../services/sound';
import { useTheme } from '../../context/ThemeContext';
import { useWebSocket } from '../../services/websocket';
import { sendNativeNotification } from '../../services/nativeNotifications';

interface MasterAdminLayoutProps {
  onLogout: () => void;
  onGoToLanding: () => void;
  onGoToPos: () => void;
}

export type MasterAdminTab = 
  | 'dashboard' 
  | 'fleet' 
  | 'tenants' 
  | 'franchise' 
  | 'billing' 
  | 'broadcast' 
  | 'tickets' 
  | 'backups' 
  | 'users' 
  | 'leads';

export const MasterAdminLayout: React.FC<MasterAdminLayoutProps> = ({
  onLogout,
  onGoToLanding,
  onGoToPos
}) => {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<MasterAdminTab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Master Data
  const [stats, setStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [fleetList, setFleetList] = useState<any[]>([]);
  const [ticketList, setTicketList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Cross-view selection state
  const [selectedTenantIdForUsers, setSelectedTenantIdForUsers] = useState<number | null>(null);

  useEffect(() => {
    loadAllMasterData();
  }, []);

  useWebSocket('all', (type, data) => {
    if (type === 'SUPPORT_TICKET_CREATED') {
      sound.kitchenBell();
      sendNativeNotification({
        title: '🎫 Yeni Destek Talebi Geldi!',
        body: `${data.tenant_name || 'Restoran'}: ${data.subject || 'Destek talebi oluşturuldu.'}`,
        tag: `master-ticket-${data.id || Date.now()}`
      });
      loadAllMasterData();
    } else if (type === 'SUPPORT_TICKET_REPLIED' && data && data.sender_type !== 'master_admin') {
      sound.kitchenBell();
      sendNativeNotification({
        title: `💬 Restorandan Yanıt Geldi (#${data.ticket_number || ''})`,
        body: `${data.sender_name || 'Restoran'}: "${data.message || ''}"`,
        tag: `master-ticket-reply-${data.ticket_id || Date.now()}`
      });
      loadAllMasterData();
    } else if (type === 'LEAD_SUBMITTED') {
      sound.cashDrawer();
      sendNativeNotification({
        title: '✨ Yeni Müşteri / Demo Talebi!',
        body: `${data.full_name || 'Ziyaretçi'} (${data.company_name || 'İşletme'}) demo talep etti.`,
        tag: `master-lead-${Date.now()}`
      });
      loadAllMasterData();
    }
  });

  const loadAllMasterData = async () => {
    setLoading(true);
    try {
      const t = Date.now();
      const [statsRes, tenantsRes, leadsRes, invRes, fleetRes, ticketsRes] = await Promise.all([
        fetch(`/api/master/stats?_t=${t}`, { cache: 'no-store' }),
        fetch(`/api/master/tenants?_t=${t}`, { cache: 'no-store' }),
        fetch(`/api/master/leads?_t=${t}`, { cache: 'no-store' }),
        fetch(`/api/master/invoices?_t=${t}`, { cache: 'no-store' }),
        fetch(`/api/master/fleet?_t=${t}`, { cache: 'no-store' }).catch(() => null),
        fetch(`/api/master/tickets?_t=${t}`, { cache: 'no-store' }).catch(() => null)
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (tenantsRes.ok) {
        const d = await tenantsRes.json();
        setTenants(Array.isArray(d) ? d : (d?.tenants || []));
      }
      if (leadsRes.ok) {
        const d = await leadsRes.json();
        setLeads(Array.isArray(d) ? d : (d?.leads || []));
      }
      if (invRes.ok) {
        const d = await invRes.json();
        setInvoices(Array.isArray(d) ? d : (d?.invoices || []));
      }
      if (fleetRes && fleetRes.ok) {
        const d = await fleetRes.json();
        setFleetList(Array.isArray(d) ? d : []);
      }
      if (ticketsRes && ticketsRes.ok) {
        const d = await ticketsRes.json();
        setTicketList(Array.isArray(d) ? d : []);
      }
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

  const onlineFleetCount = fleetList.filter(f => f.is_online).length;
  const newTicketsCount = ticketList.filter(t => t.status === 'new').length;

  const navItems = [
    { id: 'dashboard', label: 'Genel Bakış & Gelirler', icon: LayoutDashboard },
    { id: 'fleet', label: 'Canlı Filo & Radar', icon: Activity, badge: onlineFleetCount > 0 ? `${onlineFleetCount} Aktif` : undefined },
    { id: 'tenants', label: 'Tüm Restoranlar & Modüller', icon: Building2, badge: tenants.length || undefined },
    { id: 'franchise', label: 'Şube & Franchise Yönetimi', icon: GitBranch },
    { id: 'billing', label: 'SaaS Finans & Sanal POS', icon: CreditCard },
    { id: 'broadcast', label: 'Duyuru & Bildirim Merkezi', icon: Megaphone },
    { id: 'tickets', label: 'Destek & Talep Yönetimi', icon: LifeBuoy, badge: newTicketsCount > 0 ? newTicketsCount : undefined },
    { id: 'backups', label: 'Yedekleme & Veri Kotası', icon: HardDrive },
    { id: 'users', label: 'Restoran Kullanıcıları & Şifre', icon: KeyRound },
    { id: 'leads', label: 'Gelen Müşteri Talepleri', icon: Sparkles, badge: leads.filter(l => l.status === 'yeni').length || undefined }
  ];

  return (
    <div className={`master-admin-root ${theme === 'light' ? 'saas-white-theme bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'} min-h-screen flex flex-col font-sans select-none transition-colors duration-200`}>
      
      {/* Top Master Navbar */}
      <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 font-black">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-900 dark:text-white text-sm sm:text-base tracking-tight">
                  BonCore <span className="text-emerald-600 dark:text-emerald-400">Master Admin</span>
                </span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
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
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Theme Switcher Button */}
          <button
            onClick={() => { sound.beep(); toggleTheme(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 text-xs font-bold transition cursor-pointer shadow-2xs"
            title={theme === 'dark' ? 'Beyaz Temaya Geç' : 'Koyu Temaya Geç'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Beyaz Tema</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline">Koyu Tema</span>
              </>
            )}
          </button>

          <button
            onClick={() => { sound.beep(); onGoToLanding(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-bold transition cursor-pointer shadow-2xs"
            title="Tanıtım Web Sitesine Git"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Web Sitesi</span>
          </button>

          <button
            onClick={() => { sound.beep(); onGoToPos(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold transition cursor-pointer shadow-2xs"
            title="Restoran POS Paneline Geç"
          >
            <Utensils className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Restoran POS</span>
          </button>

          <button
            onClick={() => { sound.beep(); onLogout(); }}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
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
          className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between transition-transform duration-200 overflow-y-auto ${
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
                    setActiveTab(item.id as MasterAdminTab);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-black transition cursor-pointer select-none ${
                    isActive
                      ? 'bg-gradient-to-r from-brand-600 to-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Bottom Live System Stats Pill */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-1 text-xs mt-4">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
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

        {/* Right Main Content Area with Smooth Scrolling & Bottom Margin */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-32 min-h-0">
          {activeTab === 'dashboard' && (
            <MasterDashboardView
              stats={stats}
              leads={leads}
              tenants={tenants}
              onNavigateTab={(tab) => { sound.beep(); setActiveTab(tab as any); }}
              onRefresh={loadAllMasterData}
            />
          )}

          {activeTab === 'fleet' && (
            <MasterFleetView />
          )}

          {activeTab === 'tenants' && (
            <MasterTenantsView
              tenants={tenants}
              onRefresh={loadAllMasterData}
              onSelectTenantUsers={handleSelectTenantUsers}
              onImpersonateTenant={handleImpersonateTenant}
            />
          )}

          {activeTab === 'franchise' && (
            <MasterFranchiseView
              tenants={tenants}
              onRefreshMasterData={loadAllMasterData}
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

          {activeTab === 'broadcast' && (
            <MasterBroadcastView
              tenants={tenants}
            />
          )}

          {activeTab === 'tickets' && (
            <MasterTicketsView />
          )}

          {activeTab === 'backups' && (
            <MasterBackupQuotaView
              tenants={tenants}
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
        </main>

      </div>

    </div>
  );
};
