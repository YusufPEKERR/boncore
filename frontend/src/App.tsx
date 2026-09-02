import React, { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { AdisyoSidebar } from './components/layout/AdisyoSidebar';
import { AdisyoDashboard } from './components/dashboard/AdisyoDashboard';
import { AdisyoSettings } from './components/settings/AdisyoSettings';
import { AdisyoProfile } from './components/profile/AdisyoProfile';
import { AdisyoLogin } from './components/auth/AdisyoLogin';
import { QrallPosModal } from './components/qr/QrallPosModal';
import { OkcIntegrationModal } from './components/fiscal/OkcIntegrationModal';
import { PinModal } from './components/layout/PinModal';
import { FloorView } from './components/tables/FloorView';
import { PosTerminal } from './components/pos/PosTerminal';
import { KdsScreen } from './components/kds/KdsScreen';
import { CashierManagement } from './components/cashier/CashierManagement';
import { CheckoutModal } from './components/cashier/CheckoutModal';
import { DeliveryHub } from './components/delivery/DeliveryHub';
import { InventoryManagement } from './components/inventory/InventoryManagement';
import { QrMenuSimulator } from './components/qr/QrMenuSimulator';
import { FiscalModal } from './components/fiscal/FiscalModal';
import { AuditLogViewer } from './components/audit/AuditLogViewer';
import { BuzzerListModal } from './components/tables/TableActionModals';

// New Video 3 Screen Components
import { ProductDefinitions } from './components/products/ProductDefinitions';
import { TableAreaDefinitions } from './components/tables/TableAreaDefinitions';
import { RightsManagement } from './components/permissions/RightsManagement';
import { UsersManagement } from './components/users/UsersManagement';
import { RestaurantStatistics } from './components/reports/RestaurantStatistics';
import { AppStore } from './components/appstore/AppStore';
import { MenuIntegrationOperations } from './components/integrations/MenuIntegrationOperations';

import { Area, Category, Table, StaffUser } from './types';
import { api } from './services/api';
import { sound } from './services/sound';
import { useWebSocket } from './services/websocket';
import { useTheme } from './context/ThemeContext';

export const App: React.FC = () => {
  // Global Theme Hook (Dark / Light)
  const { theme, toggleTheme } = useTheme();

  const VALID_TABS = [
    'dashboard', 'tables', 'pos', 'kds', 'product_definition', 'table_definition',
    'integration_menu', 'users', 'rights', 'restaurant_statistics', 'app_store',
    'settings', 'profile', 'cashier', 'delivery', 'inventory', 'qr', 'audit'
  ];

  // Helper to get initial tab from URL hash or localStorage
  const getInitialTab = (): string => {
    const hash = window.location.hash.replace('#', '').trim();
    if (hash && VALID_TABS.includes(hash)) {
      return hash;
    }
    const saved = localStorage.getItem('boncore_active_tab');
    if (saved && VALID_TABS.includes(saved)) {
      return saved;
    }
    return 'tables';
  };

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const cached = localStorage.getItem('boncore_auth');
    return cached !== null ? cached === 'true' : true;
  });
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(() => {
    const cached = localStorage.getItem('boncore_user');
    if (cached) {
      try { return JSON.parse(cached); } catch {}
    }
    return {
      id: 1,
      name: '37799 - fatih',
      role: 'manager',
      is_active: true
    };
  });
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);

  // Navigation (persistent across F5 reload via hash and localStorage)
  const [activeTab, setActiveTab] = useState<string>(getInitialTab);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isQrallModalOpen, setIsQrallModalOpen] = useState<boolean>(false);
  const [isOkcModalOpen, setIsOkcModalOpen] = useState<boolean>(false);

  // Sync activeTab to localStorage and URL hash
  useEffect(() => {
    localStorage.setItem('boncore_active_tab', activeTab);
    const currentHash = window.location.hash.replace('#', '');
    if (currentHash !== activeTab) {
      window.history.replaceState(null, '', '#' + activeTab);
    }
  }, [activeTab]);

  // Listen to browser back/forward or hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').trim();
      if (hash && VALID_TABS.includes(hash) && hash !== activeTab) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  // App Master Data
  const [areas, setAreas] = useState<Area[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loadingAreas, setLoadingAreas] = useState<boolean>(true);
  const [selectedTable, setSelectedTable] = useState<Table | null>(() => {
    try {
      const cached = localStorage.getItem('boncore_selected_table');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [activeCheckoutOrderId, setActiveCheckoutOrderId] = useState<number | null>(null);
  const [activeFiscalOrderId, setActiveFiscalOrderId] = useState<number | null>(null);

  // Buzzer Modal
  const [isBuzzerListOpen, setIsBuzzerListOpen] = useState<boolean>(false);

  // Live Toast Notifications
  const [toasts, setToasts] = useState<{ id: number; message: string; type?: string }[]>([
    { id: 1, message: '✓ Bağlantı başarılı...', type: 'success' }
  ]);

  const addToast = (message: string, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // Real-time WebSocket connection
  const { isConnected } = useWebSocket('all', (type, data) => {
    if (type === 'WAITER_CALL_ALERT') {
      addToast(`🔔 ${data.table_name}: ${data.reason}!`, 'warning');
      loadAreas();
    } else if (type === 'KITCHEN_ORDER_READY_ALERT') {
      addToast(`🍽️ ${data.message}`, 'success');
      loadAreas();
    } else if (type === 'ONLINE_ORDER_INCOMING') {
      addToast(`🛵 ${data.platform.toUpperCase()}: Yeni Sipariş (₺${data.total})`, 'info');
      loadAreas();
    } else if (type === 'ORDER_CREATED' || type === 'ORDER_UPDATED' || type === 'ORDER_PAID' || type === 'TABLE_MOVED' || type === 'TABLE_MERGED') {
      loadAreas();
    }
  });

  const loadStaffUsers = async () => {
    try {
      const data = await api.getStaffList();
      if (data && data.length > 0) {
        setStaffUsers(data);
      }
    } catch (e) {
      console.warn('Failed to load staff list in App', e);
    }
  };

  useEffect(() => {
    loadInitialData();
    loadStaffUsers();
  }, []);

  const loadInitialData = async () => {
    setLoadingAreas(true);
    try {
      const areasData = await api.getAreas();
      if (areasData && Array.isArray(areasData) && areasData.length > 0) {
        setAreas(areasData);
      } else {
        throw new Error('Empty areas returned');
      }
    } catch (e) {
      console.warn('Initial areas load error, retrying in 1.5s...', e);
      setTimeout(async () => {
        try {
          const retryAreas = await api.getAreas();
          if (retryAreas && Array.isArray(retryAreas)) {
            setAreas(retryAreas);
          }
        } catch (err) {
          console.warn('Retry areas failed:', err);
        } finally {
          setLoadingAreas(false);
        }
      }, 1500);
    } finally {
      setLoadingAreas(false);
    }

    try {
      const catsData = await api.getCategories();
      if (catsData && Array.isArray(catsData)) {
        setCategories(catsData);
      }
    } catch (e) {
      console.warn('Initial categories load error', e);
    }
  };

  const loadAreas = async () => {
    setLoadingAreas(true);
    try {
      const areasData = await api.getAreas();
      if (areasData && Array.isArray(areasData)) {
        setAreas(areasData);
      }
    } catch (e) {
      console.warn('Failed to refresh areas', e);
    } finally {
      setLoadingAreas(false);
    }
  };

  const handleSelectTable = (table: Table) => {
    setSelectedTable(table);
    try {
      localStorage.setItem('boncore_selected_table', JSON.stringify(table));
    } catch {}
    setActiveTab('pos');
  };

  const handleBackToTables = () => {
    sound.beep();
    setSelectedTable(null);
    localStorage.removeItem('boncore_selected_table');
    setActiveTab('tables');
  };

  const handleOpenCheckout = (orderId: number, table: Table | null) => {
    setActiveCheckoutOrderId(orderId);
  };

  const handleClearBuzzer = async (tableId: number) => {
    try {
      await api.clearWaiterCall(tableId);
      await loadAreas();
    } catch (e) {
      console.warn(e);
    }
  };

  const handleLoginSuccess = (user: StaffUser) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    localStorage.setItem('boncore_auth', 'true');
    localStorage.setItem('boncore_user', JSON.stringify(user));
    addToast(`Giriş yapıldı: ${user.name}`, 'success');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem('boncore_auth');
    localStorage.removeItem('boncore_user');
    localStorage.removeItem('boncore_selected_table');
    addToast('Oturum kapatıldı.', 'info');
  };

  // If not authenticated, render full Adisyo Login page
  if (!isAuthenticated) {
    return <AdisyoLogin onLoginSuccess={handleLoginSuccess} staffList={staffUsers} />;
  }

  // Count active buzzer calls
  const allTables = areas.flatMap(a => a.tables);
  const callingTables = allTables.filter(t => t.waiter_call_reason || t.status === 'waiter_call' || t.status === 'bill_requested');

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Top Header (Adisyo 3.0 Bar) */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        currentUser={currentUser}
        onOpenPinModal={() => setIsPinModalOpen(true)}
        isConnected={isConnected}
        buzzerCount={callingTables.length}
        onOpenBuzzerList={() => setIsBuzzerListOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        restaurantTitle="FATİH ÇİFTLİĞİ"
        onRefreshData={loadAreas}
      />

      {/* Slide-out Left Navigation Drawer */}
      <AdisyoSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        restaurantTitle="FATİH ÇİFTLİĞİ - 37799"
        onOpenQrallModal={() => setIsQrallModalOpen(true)}
        onOpenOkcModal={() => setIsOkcModalOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 flex overflow-hidden relative">
        {activeTab === 'dashboard' && (
          <AdisyoDashboard
            areas={areas}
            onNavigateToTables={() => setActiveTab('tables')}
          />
        )}

        {activeTab === 'tables' && (
          <FloorView
            areas={areas}
            onSelectTable={handleSelectTable}
            currentUser={currentUser}
            onRefreshAreas={loadAreas}
            onClearBuzzer={handleClearBuzzer}
            loading={loadingAreas}
          />
        )}

        {activeTab === 'pos' && (
          <PosTerminal
            categories={categories}
            activeTable={selectedTable}
            onBackToTables={handleBackToTables}
            currentUser={currentUser}
            onOpenCheckout={handleOpenCheckout}
            onOpenFiscalModal={(id) => setActiveFiscalOrderId(id)}
            onRefreshData={loadAreas}
          />
        )}

        {activeTab === 'kds' && <KdsScreen />}

        {/* New Video 3 Screens */}
        {activeTab === 'product_definition' && (
          <ProductDefinitions
            categories={categories}
            onRefreshData={loadInitialData}
          />
        )}

        {activeTab === 'table_definition' && (
          <TableAreaDefinitions
            areas={areas}
            onRefreshAreas={loadAreas}
          />
        )}

        {activeTab === 'integration_menu' && (
          <MenuIntegrationOperations
            categories={categories}
          />
        )}

        {activeTab === 'users' && (
          <UsersManagement
            currentUser={currentUser}
            onStaffUpdated={loadStaffUsers}
          />
        )}

        {activeTab === 'rights' && <RightsManagement />}

        {activeTab === 'restaurant_statistics' && <RestaurantStatistics />}

        {activeTab === 'app_store' && <AppStore />}

        {activeTab === 'settings' && <AdisyoSettings />}

        {activeTab === 'profile' && <AdisyoProfile currentUser={currentUser} />}

        {activeTab === 'cashier' && <CashierManagement currentUser={currentUser} />}

        {activeTab === 'delivery' && <DeliveryHub />}

        {activeTab === 'inventory' && <InventoryManagement />}

        {activeTab === 'qr' && (
          <QrMenuSimulator
            areas={areas}
            onBuzzerSent={() => loadAreas()}
          />
        )}

        {activeTab === 'audit' && <AuditLogViewer />}
      </main>

      {/* Bottom-right Toast Badge (Frame 040 / Frame 220: ✓ Bağlantı başarılı...) */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-2xl shadow-2xl border text-xs font-black flex items-center gap-2 pointer-events-auto transition-all animate-fadeIn ${
              t.type === 'warning'
                ? 'bg-purple-900 border-purple-400 text-purple-100'
                : t.type === 'success' || t.message.includes('Bağlantı')
                ? 'bg-[#107c41] border-emerald-500 text-white'
                : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Modals */}
      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        staffList={staffUsers}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          addToast(`Giriş yapıldı: ${user.name}`, 'success');
        }}
        onLogout={handleLogout}
      />

      <QrallPosModal
        isOpen={isQrallModalOpen}
        onClose={() => setIsQrallModalOpen(false)}
        onSuccessToast={(msg) => addToast(msg, 'success')}
      />

      <OkcIntegrationModal
        isOpen={isOkcModalOpen}
        onClose={() => setIsOkcModalOpen(false)}
        onSuccessToast={(msg) => addToast(msg, 'success')}
      />

      {activeCheckoutOrderId && (
        <CheckoutModal
          isOpen={!!activeCheckoutOrderId}
          onClose={() => setActiveCheckoutOrderId(null)}
          orderId={activeCheckoutOrderId}
          table={selectedTable}
          cashierName={currentUser?.name || 'Kasiyer'}
          onPaymentCompleted={() => {
            loadAreas();
            addToast('Tahsilat başarıyla tamamlandı!', 'success');
          }}
          onViewFiscal={(id) => setActiveFiscalOrderId(id)}
        />
      )}

      {activeFiscalOrderId && (
        <FiscalModal
          isOpen={!!activeFiscalOrderId}
          onClose={() => setActiveFiscalOrderId(null)}
          orderId={activeFiscalOrderId}
        />
      )}

      <BuzzerListModal
        isOpen={isBuzzerListOpen}
        onClose={() => setIsBuzzerListOpen(false)}
        areas={areas}
        onClearCall={handleClearBuzzer}
        onOpenTablePos={(t) => {
          setSelectedTable(t);
          setActiveTab('pos');
        }}
      />
    </div>
  );
};
