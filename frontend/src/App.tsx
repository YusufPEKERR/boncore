import React, { useState, useEffect } from 'react';
import { Grid, FileText, ChefHat, Wallet, Menu, Shield } from 'lucide-react';
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
import { KitchenGroupsDefinitions } from './components/kds/KitchenGroupsDefinitions';
import { CashierManagement } from './components/cashier/CashierManagement';
import { CheckoutModal } from './components/cashier/CheckoutModal';
import { DeliveryHub } from './components/delivery/DeliveryHub';
import { InventoryManagement } from './components/inventory/InventoryManagement';
import { QrMenuSimulator } from './components/qr/QrMenuSimulator';
import { FiscalModal } from './components/fiscal/FiscalModal';
import { AuditLogViewer } from './components/audit/AuditLogViewer';
import { BuzzerListModal } from './components/tables/TableActionModals';
import { BroadcastAnnouncementModal, ActiveAnnouncement } from './components/notifications/BroadcastAnnouncementModal';
import { KitchenAlertsModal, KitchenReadyAlertItem } from './components/tables/KitchenAlertsModal';

// New Video 3 Screen Components
import { ProductDefinitions } from './components/products/ProductDefinitions';
import { TableAreaDefinitions } from './components/tables/TableAreaDefinitions';
import { RightsManagement } from './components/permissions/RightsManagement';
import { UsersManagement } from './components/users/UsersManagement';
import { RestaurantStatistics } from './components/reports/RestaurantStatistics';
import { ClosedBillsReport } from './components/reports/ClosedBillsReport';
import { ProductSalesReport } from './components/reports/ProductSalesReport';
import { DayEndReport } from './components/reports/DayEndReport';
import { AppStore } from './components/appstore/AppStore';
import { MenuIntegrationOperations } from './components/integrations/MenuIntegrationOperations';
import { CustomersLoyaltyView } from './components/modules/CustomersLoyaltyView';
import { ReservationsView } from './components/modules/ReservationsView';
import { CostProfitWizardView } from './components/modules/CostProfitWizardView';
import { HotelFolioView } from './components/modules/HotelFolioView';
import { KioskCfdView } from './components/modules/KioskCfdView';
import { LandingPage } from './components/landing/LandingPage';
import { MasterAdminLayout } from './components/master_admin/MasterAdminLayout';
import { MasterLoginView } from './components/master_admin/MasterLoginView';
import { TabErrorBoundary } from './components/common/TabErrorBoundary';

import { Area, Category, Table, StaffUser } from './types';
import { api } from './services/api';
import { sound } from './services/sound';
import { useWebSocket } from './services/websocket';
import { useTheme } from './context/ThemeContext';
import { syncOfflineQueue } from './services/offlineDb';
import { useRolePermissions, broadcastPermissionsUpdate, mergeWithInitialPermissions } from './services/permissions';
import { fetchLiveTenantFeatures, saveLocalFeatures, normalizeFeaturesPayload, isTabLicensed } from './services/licensedFeatures';
import { sendNativeNotification, requestNotificationPermission } from './services/nativeNotifications';

export const App: React.FC = () => {
  // Global Theme Hook (Dark / Light)
  const { theme, toggleTheme } = useTheme();

  const VALID_TABS = [
    'dashboard', 'tables', 'pos', 'kds', 'kitchen_groups', 'product_definition', 'table_definition',
    'integration_menu', 'users', 'rights', 'restaurant_statistics', 'closed_bills_report', 'product_sales_report', 'day_end_report', 'app_store',
    'settings', 'profile', 'cashier', 'delivery', 'inventory', 'qr', 'audit',
    'customers', 'reservations', 'cost_profit', 'hotel', 'kiosk'
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

  // Authentication State (Require valid token or explicit login)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const token = localStorage.getItem('boncore_token');
    const cached = localStorage.getItem('boncore_auth');
    return Boolean(token && cached === 'true');
  });

  // View Mode: 'landing', 'login', 'app', 'master_login', 'master_admin'
  type ViewMode = 'landing' | 'login' | 'app' | 'master_login' | 'master_admin';

  const [isMasterAuth, setIsMasterAuth] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('boncore_master_token'));
  });

  const getInitialViewMode = (): ViewMode => {
    const hash = window.location.hash.replace('#', '').trim();
    if (hash === 'master_admin' || hash === 'master' || hash === 'admin' || hash === 'masteradmin' || hash === 'superadmin') {
      const masterToken = localStorage.getItem('boncore_master_token');
      return masterToken ? 'master_admin' : 'master_login';
    }
    if (hash === 'master_login') return 'master_login';
    if (hash === 'login') return 'login';
    if (hash === 'landing') return 'landing';

    const token = localStorage.getItem('boncore_token');
    const cached = localStorage.getItem('boncore_auth');
    const rememberDevice = localStorage.getItem('boncore_remember_device') === 'true';
    const isStandalone = typeof window !== 'undefined' && (
      (window.navigator as any).standalone === true || 
      window.matchMedia('(display-mode: standalone)').matches
    );

    if (VALID_TABS.includes(hash)) {
      if (token && cached === 'true') {
        return 'app';
      }
      return 'login';
    }

    // Kullanıcı giriş yaptıysa ve cihazı hatırla seçildiyse VEYA ana ekrandan PWA olarak açıldıysa:
    // Standart olarak doğrudan Masalar / POS sipariş ekranı ('app', 'tables') açılsın!
    if (token && cached === 'true' && (rememberDevice || isStandalone)) {
      if (!hash) {
        window.location.hash = 'tables';
      }
      return 'app';
    }

    // Ana ekrana eklenmiş (PWA) ama henüz giriş yapılmamışsa doğrudan Login ekranı açılsın
    if (isStandalone) {
      return 'login';
    }

    // Web sitesine normal tarayıcıdan ilk girildiğinde pazarlama anasayfası karşılar
    return 'landing';
  };

  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(() => {
    const cached = localStorage.getItem('boncore_user');
    if (cached) {
      try { return JSON.parse(cached); } catch {}
    }
    return null;
  });
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [restaurantTitle, setRestaurantTitle] = useState<string>(() => {
    return localStorage.getItem('boncore_active_restaurant_name') || 'BONCORE RESTORAN';
  });

  const { canTab } = useRolePermissions(currentUser);

  // Verify token on startup if authenticated
  useEffect(() => {
    const token = localStorage.getItem('boncore_token');
    if (!token) {
      setIsAuthenticated(false);
      return;
    }
    api.getMe()
      .then((user) => {
        if (user) {
          setCurrentUser(user);
          setIsAuthenticated(true);
          localStorage.setItem('boncore_user', JSON.stringify(user));
        }
      })
      .catch(() => {
        // Token expired or invalid
        localStorage.removeItem('boncore_token');
        localStorage.removeItem('boncore_auth');
        localStorage.removeItem('boncore_user');
        setIsAuthenticated(false);
        setCurrentUser(null);
      });
  }, []);

  // Navigation (persistent across F5 reload via hash and localStorage)
  const [activeTab, setActiveTab] = useState<string>(getInitialTab);
  const [floorSection, setFloorSection] = useState<'tables' | 'orders'>(() => {
    return (localStorage.getItem('boncore_floor_section') as 'tables' | 'orders') || 'tables';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isQrallModalOpen, setIsQrallModalOpen] = useState<boolean>(false);
  const [isOkcModalOpen, setIsOkcModalOpen] = useState<boolean>(false);

  // Sync activeTab to localStorage and URL hash (only when in POS app mode)
  useEffect(() => {
    localStorage.setItem('boncore_active_tab', activeTab);
    if (viewMode === 'app') {
      const currentHash = window.location.hash.replace('#', '');
      if (currentHash !== activeTab) {
        window.history.replaceState(null, '', '#' + activeTab);
      }
    }
  }, [activeTab, viewMode]);

  // Listen to browser back/forward or hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').trim();
      if (hash === 'master_admin' || hash === 'master' || hash === 'admin' || hash === 'masteradmin' || hash === 'superadmin') {
        const masterToken = localStorage.getItem('boncore_master_token');
        if (masterToken) {
          setIsMasterAuth(true);
          setViewMode('master_admin');
        } else {
          setIsMasterAuth(false);
          setViewMode('master_login');
        }
      } else if (hash === 'master_login') {
        setViewMode('master_login');
      } else if (hash === 'landing') {
        setViewMode('landing');
      } else if (hash === '') {
        const token = localStorage.getItem('boncore_token');
        const authFlag = localStorage.getItem('boncore_auth');
        const rememberDevice = localStorage.getItem('boncore_remember_device') === 'true';
        const isStandalone = typeof window !== 'undefined' && (
          (window.navigator as any).standalone === true || 
          window.matchMedia('(display-mode: standalone)').matches
        );
        const isAuthed = (token && authFlag === 'true') || isAuthenticated;
        if (isAuthed && (rememberDevice || isStandalone)) {
          setIsAuthenticated(true);
          setViewMode('app');
          setActiveTab('tables');
          window.location.hash = 'tables';
        } else if (isStandalone) {
          setViewMode('login');
        } else {
          setViewMode('landing');
        }
      } else if (hash === 'login') {
        setViewMode('login');
      } else if (VALID_TABS.includes(hash)) {
        const token = localStorage.getItem('boncore_token');
        const authFlag = localStorage.getItem('boncore_auth');
        const isAuthed = (token && authFlag === 'true') || isAuthenticated;
        if (isAuthed) {
          setIsAuthenticated(true);
          setViewMode('app');
          if (hash !== activeTab) {
            setActiveTab(hash);
          }
        } else {
          setViewMode('login');
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab, isAuthenticated]);

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

  // Kitchen Ready Alerts
  const [kitchenAlerts, setKitchenAlerts] = useState<KitchenReadyAlertItem[]>([]);
  const [isKitchenAlertsOpen, setIsKitchenAlertsOpen] = useState<boolean>(false);

  // Live Toast Notifications
  const [toasts, setToasts] = useState<{ id: number; message: string; type?: string }[]>([]);

  // Master Broadcast Announcements
  const [activeAnnouncement, setActiveAnnouncement] = useState<ActiveAnnouncement | null>(null);

  const addToast = (message: string, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  // Listen to system-wide custom toast events from API interceptor and services
  useEffect(() => {
    const handleCustomToast = (e: Event) => {
      const ce = e as CustomEvent<{ message: string; type?: string }>;
      if (ce.detail?.message) {
        addToast(ce.detail.message, ce.detail.type || 'info');
      }
    };
    window.addEventListener('boncore_toast', handleCustomToast);
    return () => window.removeEventListener('boncore_toast', handleCustomToast);
  }, []);

  // Auto-sync offline transactions when network is online or on application start
  useEffect(() => {
    const runOfflineSync = async () => {
      try {
        const { syncedOrders, syncedPayments } = await syncOfflineQueue();
        if (syncedOrders > 0 || syncedPayments > 0) {
          addToast(`🔄 Çevrimdışı kuyruktan ${syncedOrders} sipariş ve ${syncedPayments} tahsilat sunucuya aktarıldı.`, 'success');
          sound.cashDrawer();
          loadAreas();
        }
      } catch (e) {
        console.warn('Sync failed', e);
      }
    };

    runOfflineSync();
    window.addEventListener('online', runOfflineSync);
    return () => window.removeEventListener('online', runOfflineSync);
  }, []);

  const loadCategories = async () => {
    try {
      const catsData = await api.getCategories();
      if (catsData && Array.isArray(catsData)) {
        setCategories(catsData);
      }
    } catch (e) {
      console.warn('Failed to refresh categories', e);
    }
  };

  // Auto-request native web notification permissions when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      requestNotificationPermission().catch(() => {});
    }
  }, [isAuthenticated]);

  // Real-time WebSocket connection
  const { isConnected } = useWebSocket('all', (type, data) => {
    if (type === 'WAITER_CALL_ALERT') {
      addToast(`🔔 ${data.table_name}: ${data.reason}!`, 'warning');
      sendNativeNotification({
        title: `🔔 Garson Çağrısı: ${data.table_name || 'Masa'}`,
        body: `${data.reason || 'Masadan servis veya hesap çağrısı geldi!'}`,
        tag: `waiter-call-${data.table_id || Date.now()}`,
        requireInteraction: true
      });
      loadAreas();
    } else if (type === 'KITCHEN_ORDER_READY_ALERT') {
      sound.kitchenBell();
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
      } catch {}

      const newAlert: KitchenReadyAlertItem = {
        id: `${data.order_id || Date.now()}-${Date.now()}-${Math.random()}`,
        order_id: data.order_id || 0,
        order_no: data.order_no,
        table_id: data.table_id,
        table_name: data.table_name || 'Masa',
        waiter_name: data.waiter_name,
        items_summary: data.items_summary || data.product_name || 'Sipariş hazır',
        message: data.message || `Masa ${data.table_name}: Sipariş servise hazır!`,
        ready_at: data.ready_at || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
      };

      setKitchenAlerts(prev => [newAlert, ...prev.filter(a => a.id !== newAlert.id).slice(0, 19)]);
      
      // Native Cihaz / Web Push Bildirimi (Uygulama içi yeşil toast yerine doğrudan sistem bildirimi)
      sendNativeNotification({
        title: `🍽️ Mutfak Siparişi Hazır! (${data.table_name || 'Masa'})`,
        body: data.message || `${data.table_name || 'Masa'} siparişi servise hazır! ${data.items_summary ? `(${data.items_summary})` : ''}`,
        tag: `kitchen-ready-${data.order_id || Date.now()}`
      });
      loadAreas();
    } else if (type === 'ONLINE_ORDER_INCOMING') {
      addToast(`🛵 ${(data.platform || 'ONLINE').toUpperCase()}: Yeni Sipariş (₺${data.total})`, 'info');
      sendNativeNotification({
        title: `🛵 ${(data.platform || 'ONLINE').toUpperCase()} - Yeni Paket Sipariş!`,
        body: `Tutar: ₺${data.total || 0} - Hazırlanmak üzere mutfağa iletildi.`,
        tag: `online-order-${data.order_id || Date.now()}`
      });
      loadAreas();
    } else if (type === 'MENU_UPDATED') {
      loadCategories();
    } else if (type === 'SETTINGS_UPDATED') {
      if (data && data.restaurant_name) {
        setRestaurantTitle(String(data.restaurant_name));
      }
      if (data && Array.isArray(data.role_permissions)) {
        broadcastPermissionsUpdate(mergeWithInitialPermissions(data.role_permissions));
      }
    } else if (type === 'ORDER_PAID') {
      if (data && data.order_id) {
        setKitchenAlerts(prev => prev.filter(a => a.order_id !== data.order_id));
      }
      loadAreas();
      loadCategories();
    } else if (type === 'ORDER_CREATED' || type === 'ORDER_UPDATED' || type === 'AREAS_UPDATED' || type === 'TABLE_MOVED' || type === 'TABLE_MERGED' || type === 'TABLE_STATUS_CHANGED') {
      if (data && data.table_id) {
        setKitchenAlerts(prev => prev.filter(a => a.table_id !== data.table_id));
      }
      loadAreas();
      loadCategories();
    } else if (type === 'ANNOUNCEMENT_BROADCAST') {
      if (data) {
        sound.kitchenBell();
        setActiveAnnouncement({
          id: data.id,
          title: data.title,
          content: data.content,
          banner_type: data.banner_type || 'info',
          show_as_popup: data.show_as_popup !== false,
          dismissible: data.dismissible !== false,
          created_at: data.created_at
        });
        addToast(`📢 ${data.title}`, data.banner_type === 'urgent' ? 'error' : data.banner_type === 'warning' ? 'warning' : 'info');
        
        // Native Cihaz / Web Bildirimi
        sendNativeNotification({
          title: `📢 ${data.title}`,
          body: data.content || 'SaaS Yönetiminden yeni duyuru yayınlandı.',
          tag: `announcement-${data.id}`,
          requireInteraction: data.banner_type === 'urgent'
        });
      }
    } else if (type === 'SUPPORT_TICKET_REPLIED') {
      sound.kitchenBell();
      const replyBody = `${data.sender_name || 'Destek Ekibi'}: "${data.message}"`;
      addToast(`🎫 Destek Talebiniz Yanıtlandı (#${data.ticket_number}): ${replyBody}`, 'info');
      sendNativeNotification({
        title: `🎫 Destek Talebi Yanıtlandı (#${data.ticket_number})`,
        body: replyBody,
        tag: `ticket-reply-${data.ticket_number || Date.now()}`
      });
    } else if (type === 'SUPPORT_TICKET_STATUS_CHANGED') {
      sound.kitchenBell();
      const statusText = data.status === 'resolved' ? 'Çözüldü' : data.status === 'in_review' ? 'İnceleniyor' : data.status === 'closed' ? 'Kapatıldı' : data.status;
      addToast(`🎫 Destek Talebi Güncellendi (#${data.ticket_number}): Durum: ${statusText}`, 'success');
      sendNativeNotification({
        title: `🎫 Destek Talebi Güncellendi (#${data.ticket_number})`,
        body: `Talep durumu "${statusText}" olarak güncellendi.`,
        tag: `ticket-status-${data.ticket_number || Date.now()}`
      });
    } else if (type === 'FEATURES_UPDATED') {
      if (data) {
        const updated = normalizeFeaturesPayload(data);
        saveLocalFeatures(updated);
        addToast('🔔 Restoran modül lisanslarınız güncellendi.', 'info');
        sendNativeNotification({
          title: '🔔 Modül Lisansları Güncellendi',
          body: 'Restoranınızın aktif modülleri ve lisansları güncellendi.',
          tag: 'features-updated'
        });
      }
    } else if (type === 'ANNOUNCEMENT_DEACTIVATED') {
      if (data && data.id) {
        setActiveAnnouncement(prev => (prev && prev.id === data.id ? null : prev));
      }
    }
  });

  const loadActiveAnnouncements = async () => {
    try {
      const res = await fetch(`/api/announcements/active?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setActiveAnnouncement(data[0]);
        }
      }
    } catch (e) {
      console.warn('Failed to load active announcements', e);
    }
  };

  const handleDismissAnnouncement = async (id: number) => {
    try {
      await fetch(`/api/announcements/${id}/dismiss`, { method: 'POST' }).catch(() => null);
    } catch {}
    setActiveAnnouncement(null);
  };

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
    loadActiveAnnouncements();
    fetchLiveTenantFeatures();
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

    await loadCategories();

    try {
      const settingsData = await api.getSettings();
      if (settingsData && settingsData.restaurant_name) {
        setRestaurantTitle(String(settingsData.restaurant_name));
      }
    } catch (e) {
      // Ignore settings load error on startup
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

  const handleOpenKitchenReadyTable = (tableId?: number | null, tableName?: string) => {
    sound.beep();
    const tablesList = (areas || []).flatMap(a => (a && a.tables) || []).filter(Boolean);
    if (tableId) {
      const found = tablesList.find(t => t.id === tableId);
      if (found) {
        setSelectedTable(found);
        setActiveTab('pos');
        return;
      }
    }
    if (tableName) {
      const found = tablesList.find(t => t.name.toLowerCase() === tableName.toLowerCase());
      if (found) {
        setSelectedTable(found);
        setActiveTab('pos');
        return;
      }
    }
    setActiveTab('tables');
  };

  const handleLoginSuccess = (user: StaffUser, token?: string, restaurant?: any) => {
    localStorage.setItem('boncore_auth', 'true');
    localStorage.setItem('boncore_user', JSON.stringify(user));
    if (token) {
      localStorage.setItem('boncore_token', token);
    }
    if (restaurant && restaurant.code) {
      localStorage.setItem('boncore_restaurant_code', restaurant.code);
      try {
        document.cookie = `boncore_restaurant_code=${restaurant.code}; path=/; max-age=604800; SameSite=Lax`;
      } catch {}
    }
    if (restaurant && restaurant.name) {
      setRestaurantTitle(restaurant.name);
      try {
        localStorage.setItem('boncore_active_restaurant_name', restaurant.name);
      } catch {}
    } else {
      const saved = localStorage.getItem('boncore_active_restaurant_name');
      if (saved) setRestaurantTitle(saved);
    }

    setCurrentUser(user);
    setIsAuthenticated(true);
    setViewMode('app');
    setActiveTab('tables');
    window.location.hash = 'tables';

    loadInitialData();
    loadStaffUsers();
    const restSuffix = restaurant?.name ? ` (${restaurant.name})` : '';
    addToast(`Hoş geldiniz, ${user.name}!${restSuffix}`, 'success');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    api.logout();
    localStorage.removeItem('boncore_token');
    localStorage.removeItem('boncore_auth');
    localStorage.removeItem('boncore_user');
    localStorage.removeItem('boncore_selected_table');
    localStorage.removeItem('boncore_active_restaurant_name');
    const isStandalone = typeof window !== 'undefined' && (
      (window.navigator as any).standalone === true || 
      window.matchMedia('(display-mode: standalone)').matches
    );
    if (isStandalone) {
      setViewMode('login');
      window.location.hash = 'login';
    } else {
      setViewMode('landing');
      window.location.hash = 'landing';
    }
    addToast('Oturum güvenli bir şekilde kapatıldı.', 'info');
  };

  const handleOpenLogin = () => {
    sound.beep();
    if (isAuthenticated) {
      setViewMode('app');
      window.location.hash = activeTab || 'tables';
    } else {
      setViewMode('login');
      window.location.hash = 'login';
    }
  };

  const handleGoToLanding = () => {
    sound.beep();
    setViewMode('landing');
    window.location.hash = 'landing';
  };

  const handleOpenMasterAdmin = () => {
    sound.beep();
    const masterToken = localStorage.getItem('boncore_master_token');
    if (masterToken) {
      setIsMasterAuth(true);
      setViewMode('master_admin');
      window.location.hash = 'master_admin';
    } else {
      setIsMasterAuth(false);
      setViewMode('master_login');
      window.location.hash = 'master_login';
    }
  };

  const handleMasterLoginSuccess = (token: string, user: any) => {
    try {
      localStorage.setItem('boncore_master_token', token);
      localStorage.setItem('boncore_master_user', JSON.stringify(user));
    } catch {}
    setIsMasterAuth(true);
    setViewMode('master_admin');
    window.location.hash = 'master_admin';
    addToast('SaaS Master Admin paneline hoş geldiniz!', 'success');
  };

  const handleMasterLogout = () => {
    sound.beep();
    localStorage.removeItem('boncore_master_token');
    setIsMasterAuth(false);
    setViewMode('landing');
    window.location.hash = 'landing';
    addToast('Master Admin oturumu sonlandırıldı.', 'info');
  };

  const handleQuickDemoLogin = async () => {
    try {
      sound.cashDrawer();
      const res = await api.login('admin', '123456', true);
      handleLoginSuccess(res.user, res.access_token);
    } catch {
      setViewMode('login');
      window.location.hash = 'login';
    }
  };

  // 1. SaaS Master Admin Views (Platform Süper Yönetici Paneli)
  if (viewMode === 'master_admin') {
    if (!isMasterAuth) {
      return (
        <MasterLoginView
          onLoginSuccess={handleMasterLoginSuccess}
          onBackToLanding={handleGoToLanding}
        />
      );
    }
    return (
      <MasterAdminLayout
        onLogout={handleMasterLogout}
        onGoToLanding={handleGoToLanding}
        onGoToPos={() => {
          sound.beep();
          setViewMode('app');
          window.location.hash = activeTab || 'tables';
        }}
      />
    );
  }

  if (viewMode === 'master_login') {
    return (
      <MasterLoginView
        onLoginSuccess={handleMasterLoginSuccess}
        onBackToLanding={handleGoToLanding}
      />
    );
  }

  // 2. Landing Page (Adisyo.com Tarzı Satış & Pazarlama Anasayfası)
  if (viewMode === 'landing') {
    return (
      <LandingPage
        onOpenLogin={handleOpenLogin}
        onOpenMasterAdmin={handleOpenMasterAdmin}
        onGoToApp={() => {
          sound.beep();
          setViewMode('app');
          window.location.hash = activeTab || 'tables';
        }}
        currentUser={currentUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onQuickDemoLogin={handleQuickDemoLogin}
      />
    );
  }

  // 3. Login Screen (Giriş Yap Sayfası)
  const hasAuthToken = localStorage.getItem('boncore_auth') === 'true' || Boolean(localStorage.getItem('boncore_token'));
  if (viewMode === 'login' || (!isAuthenticated && !hasAuthToken)) {
    return (
      <AdisyoLogin
        onLoginSuccess={handleLoginSuccess}
        onMasterLoginSuccess={handleMasterLoginSuccess}
        onBackToLanding={handleGoToLanding}
      />
    );
  }

  // Count active buzzer calls and open tables
  const allTables = (areas || []).flatMap(a => (a && a.tables) || []).filter(Boolean);
  const callingTables = allTables.filter(t => t && (t.waiter_call_reason || t.status === 'waiter_call' || t.status === 'bill_requested'));
  const openTablesCount = allTables.filter(t => t && (t.status === 'occupied' || t.status === 'bill_printed' || t.status === 'bill_requested' || t.status === 'waiter_call' || (t.active_order && (t.active_order.grand_total || 0) > 0))).length;

  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Top Header (BonCore POS v2.0 Bar) */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        currentUser={currentUser}
        onOpenPinModal={() => setIsPinModalOpen(true)}
        onLogout={handleLogout}
        isConnected={isConnected}
        buzzerCount={callingTables.length}
        onOpenBuzzerList={() => setIsBuzzerListOpen(true)}
        kitchenReadyCount={kitchenAlerts.length}
        onOpenKitchenAlerts={() => setIsKitchenAlertsOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        restaurantTitle={restaurantTitle}
        onRefreshData={loadAreas}
        onOpenLanding={handleGoToLanding}
      />

      {/* Slide-out Left Navigation Drawer */}
      <AdisyoSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        restaurantTitle={restaurantTitle}
        onOpenQrallModal={() => setIsQrallModalOpen(true)}
        onOpenOkcModal={() => setIsOkcModalOpen(true)}
        onLogout={handleLogout}
        onOpenLanding={handleGoToLanding}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative min-h-0 w-full">
        <TabErrorBoundary activeTab={activeTab} onResetTab={() => setActiveTab('tables')}>
        {!canTab(activeTab) ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-slate-950 select-none">
            <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
                <Shield className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {!isTabLicensed(activeTab) 
                    ? 'Bu Modül Restoran Lisans Kapsamında Değildir' 
                    : 'Bu Ekrana Erişim Yetkiniz Bulunmamaktadır'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {!isTabLicensed(activeTab)
                    ? 'Bu modül restoranınızın mevcut SaaS abonelik lisansında devre dışı bırakılmıştır. Kullanmak için SaaS Master panelinden ilgili restoranın modül lisansını açınız.'
                    : <><strong>{currentUser?.name || 'Kullanıcı'}</strong> ({currentUser?.role || 'Garson'}) rolü için bu ekranın yetkisi <strong>Yetki / İzin Ekranı</strong> üzerinden kapatılmıştır.</>}
                </p>
              </div>
              <button
                onClick={() => {
                  sound.beep();
                  setActiveTab('tables');
                }}
                className="w-full py-3 rounded-2xl bg-[#338d35] hover:bg-[#28702a] text-white font-black text-xs shadow-md transition cursor-pointer"
              >
                Masalar (Sipariş) Ekranına Dön
              </button>
            </div>
          </div>
        ) : (
        <>
        {activeTab === 'dashboard' && (
          <AdisyoDashboard
            areas={areas}
            onNavigateToTables={() => setActiveTab('tables')}
            onNavigateTab={(tab) => setActiveTab(tab)}
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
            floorSection={floorSection}
            onFloorSectionChange={setFloorSection}
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

        {activeTab === 'kds' && <KdsScreen onNavigateTab={setActiveTab} />}

        {activeTab === 'kitchen_groups' && (
          <KitchenGroupsDefinitions
            categories={categories}
            onRefreshData={loadCategories}
            onNavigateTab={setActiveTab}
          />
        )}

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
            onRefreshData={loadCategories}
          />
        )}

        {activeTab === 'users' && (
          <UsersManagement
            currentUser={currentUser}
            onStaffUpdated={loadStaffUsers}
          />
        )}

        {activeTab === 'rights' && <RightsManagement currentUser={currentUser} />}

        {activeTab === 'restaurant_statistics' && <RestaurantStatistics onNavigateTab={(tab) => setActiveTab(tab)} />}

        {activeTab === 'closed_bills_report' && (
          <ClosedBillsReport
            currentUser={currentUser}
            onOpenFiscalModal={(id) => setActiveFiscalOrderId(id)}
            onRefreshGlobalData={loadInitialData}
            onNavigateToTable={async (tableId) => {
              await loadAreas();
              const freshAreas = await api.getAreas();
              setAreas(freshAreas);
              if (tableId) {
                for (const area of freshAreas) {
                  const found = (area.tables || []).find((t: Table) => t.id === tableId);
                  if (found) {
                    handleSelectTable(found);
                    return;
                  }
                }
              }
              setActiveTab('tables');
            }}
          />
        )}

        {activeTab === 'product_sales_report' && <ProductSalesReport />}

        {activeTab === 'day_end_report' && <DayEndReport />}

        {activeTab === 'app_store' && <AppStore onNavigateTab={setActiveTab} />}

        {activeTab === 'settings' && (
          <AdisyoSettings
            onSettingsUpdated={(name) => setRestaurantTitle(name)}
          />
        )}

        {activeTab === 'profile' && (
          <AdisyoProfile
            currentUser={currentUser}
            onUserUpdated={(u) => setCurrentUser(u)}
          />
        )}

        {activeTab === 'cashier' && <CashierManagement currentUser={currentUser} onNavigateTab={(tab) => setActiveTab(tab)} />}

        {activeTab === 'delivery' && <DeliveryHub categories={categories} />}

        {activeTab === 'inventory' && <InventoryManagement />}

        {activeTab === 'qr' && (
          <QrMenuSimulator
            areas={areas}
            onBuzzerSent={() => loadAreas()}
          />
        )}

        {activeTab === 'audit' && <AuditLogViewer />}

        {activeTab === 'customers' && <CustomersLoyaltyView />}

        {activeTab === 'reservations' && <ReservationsView />}

        {activeTab === 'cost_profit' && <CostProfitWizardView />}

        {activeTab === 'hotel' && <HotelFolioView />}

        {activeTab === 'kiosk' && <KioskCfdView categories={categories} />}
        </>
        )}
        </TabErrorBoundary>
      </main>

      {/* Mobile Bottom Navigation Bar (Visible on phones < md) */}
      <nav className="md:hidden h-14 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-1 shrink-0 z-30 select-none">
        {canTab('tables') && (
          <>
            <button
              onClick={() => { sound.beep(); setActiveTab('tables'); setFloorSection('tables'); }}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer ${
                activeTab === 'tables' && floorSection === 'tables'
                  ? 'text-[#338d35] dark:text-emerald-400 font-black'
                  : 'text-slate-500 dark:text-slate-400 font-semibold'
              }`}
            >
              <Grid className="w-4 h-4 mb-0.5" />
              <span className="text-[10px]">Masalar</span>
            </button>
            <button
              onClick={() => { sound.beep(); setActiveTab('tables'); setFloorSection('orders'); }}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer relative ${
                activeTab === 'tables' && floorSection === 'orders'
                  ? 'text-[#338d35] dark:text-emerald-400 font-black'
                  : 'text-slate-500 dark:text-slate-400 font-semibold'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <FileText className="w-4 h-4 mb-0.5" />
                {openTablesCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-emerald-600 text-white text-[9px] font-black px-1 rounded-full leading-tight min-w-[14px] text-center shadow-xs">
                    {openTablesCount}
                  </span>
                )}
              </div>
              <span className="text-[10px]">Siparişler</span>
            </button>
          </>
        )}
        {canTab('kds') && (
          <button
            onClick={() => { sound.beep(); setActiveTab('kds'); }}
            className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer ${
              activeTab === 'kds'
                ? 'text-[#338d35] dark:text-emerald-400 font-black'
                : 'text-slate-500 dark:text-slate-400 font-semibold'
            }`}
          >
            <ChefHat className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Mutfak</span>
          </button>
        )}
        {canTab('cashier') && (
          <button
            onClick={() => { sound.beep(); setActiveTab('cashier'); }}
            className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer ${
              activeTab === 'cashier'
                ? 'text-[#338d35] dark:text-emerald-400 font-black'
                : 'text-slate-500 dark:text-slate-400 font-semibold'
            }`}
          >
            <Wallet className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Kasa</span>
          </button>
        )}
        <button
          onClick={() => { sound.beep(); setIsSidebarOpen(true); }}
          className="flex-1 flex flex-col items-center justify-center py-1 rounded-xl text-slate-500 dark:text-slate-400 font-semibold transition cursor-pointer"
        >
          <Menu className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">Menü</span>
        </button>
      </nav>

      {/* Toast Notifications (Top-right on mobile, bottom-right on desktop, tap to dismiss) */}
      <div className="fixed top-16 md:top-auto md:bottom-4 right-3 md:right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
            className={`px-3.5 py-2 rounded-2xl shadow-xl border text-xs font-black flex items-center gap-2 pointer-events-auto cursor-pointer transition-all animate-fadeIn ${
              t.type === 'warning'
                ? 'bg-purple-900 border-purple-400 text-purple-100'
                : t.type === 'success'
                ? 'bg-[#107c41] border-emerald-500 text-white'
                : t.type === 'error'
                ? 'bg-rose-900 border-rose-500 text-rose-100'
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
          try {
            localStorage.setItem('boncore_user', JSON.stringify(user));
          } catch {}
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
            // Tahsilat tamamlandı: Masayı kapat, seçimi sıfırla ve masalar ekranına dön
            setSelectedTable(null);
            try {
              localStorage.removeItem('boncore_selected_table');
            } catch {}
            setActiveTab('tables');
            loadAreas();
            addToast('Tahsilat başarıyla tamamlandı, masa kapatıldı.', 'success');
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

      {/* Kitchen Ready Orders List Modal */}
      <KitchenAlertsModal
        isOpen={isKitchenAlertsOpen}
        onClose={() => setIsKitchenAlertsOpen(false)}
        alerts={kitchenAlerts}
        onDismiss={(id) => setKitchenAlerts(prev => prev.filter(a => a.id !== id))}
        onDismissAll={() => setKitchenAlerts([])}
        onOpenTablePos={handleOpenKitchenReadyTable}
      />

      {/* Central Broadcast Announcement Modal */}
      <BroadcastAnnouncementModal
        announcement={activeAnnouncement}
        onDismiss={handleDismissAnnouncement}
      />
    </div>
  );
};
