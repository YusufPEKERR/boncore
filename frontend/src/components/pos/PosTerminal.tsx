import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  ArrowLeft, Search, Trash2, Edit3, Printer, 
  Tag, Zap, RefreshCw, 
  ChevronUp, AlertCircle, FileText, 
  Utensils, DollarSign, X, CheckCircle2, CreditCard, Banknote, Scale,
  ArrowDownAZ, ArrowUpZA, Clock, User, ArrowRightLeft 
} from 'lucide-react';
import { Category, Product, OrderItem, Table, Order, StaffUser, Area } from '../../types';
import { sound } from '../../services/sound';
import { api } from '../../services/api';
import { localHardware } from '../../services/localHardware';
import { useWebSocket } from '../../services/websocket';
import { ProductModifierModal } from './ProductModifierModal';
import { MoveTableModal } from '../tables/TableActionModals';
import { printThermalReceipt } from '../fiscal/FiscalModal';
import { initialPermissions, mergeWithInitialPermissions, PermissionItem } from '../permissions/RightsManagement';
import { broadcastPermissionsUpdate } from '../../services/permissions';

interface PosTerminalProps {
  categories: Category[];
  areas?: Area[];
  activeTable: Table | null;
  onSelectTable?: (table: Table) => void;
  onBackToTables: () => void;
  currentUser: StaffUser | null;
  onOpenCheckout: (orderId: number, table: Table | null) => void;
  onOpenFiscalModal: (orderId: number) => void;
  onRefreshData: () => void;
}

export const PosTerminal: React.FC<PosTerminalProps> = ({
  categories,
  areas = [],
  activeTable,
  onSelectTable,
  onBackToTables,
  currentUser,
  onOpenCheckout,
  onOpenFiscalModal,
  onRefreshData
}) => {
  const visibleCategories = useMemo(() => {
    return categories
      .filter(c => (c.show_in_pos ?? true) !== false)
      .map(c => ({
        ...c,
        products: (c.products || []).filter(p => (p.show_in_pos ?? true) !== false)
      }));
  }, [categories]);

  const allOrderableProducts = useMemo(() => {
    const map = new Map<number, Product>();
    visibleCategories.forEach(c => {
      (c.products || []).forEach(p => {
        if (!map.has(p.id) && (p.show_in_pos ?? true) !== false) {
          map.set(p.id, p);
        }
      });
    });
    return Array.from(map.values());
  }, [visibleCategories]);

  const [activeCategoryId, setActiveCategoryId] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[] | null>(null);
  const [posSortMode, setPosSortMode] = useState<'custom' | 'az' | 'za'>('custom');

  useEffect(() => {
    if (activeCategoryId !== 'ALL' && visibleCategories.length > 0 && !visibleCategories.some(c => c.id === activeCategoryId)) {
      setActiveCategoryId('ALL');
    }
  }, [visibleCategories, activeCategoryId]);

  // Cart & Order state
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const activeOrderIdRef = useRef<number | null>(null);
  useEffect(() => {
    activeOrderIdRef.current = activeOrderId;
  }, [activeOrderId]);
  const [existingOrder, setExistingOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Kg / Gramaj Giriş Modalı State
  const [weightModalProduct, setWeightModalProduct] = useState<Product | null>(null);
  const [weightKgInput, setWeightKgInput] = useState<string>('');
  const [weightGramInput, setWeightGramInput] = useState<string>('');
  const [weightActiveField, setWeightActiveField] = useState<'kg' | 'gram'>('kg');
  // CAS CL-3000 Terazi State
  const [scaleReading, setScaleReading] = useState<boolean>(false);
  const [scaleStatus, setScaleStatus] = useState<{ is_stable?: boolean; simulated?: boolean; message?: string } | null>(null);
  // Çoklu Kasa & Terazi İstasyonu State'i
  const [scaleTerminals, setScaleTerminals] = useState<Array<{ id: string; name: string; is_online: boolean; is_default: boolean }>>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>(() => localStorage.getItem('boncore_pos_terminal_id') || '');

  // Live Timer for table elapsed time
  const [posNow, setPosNow] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setPosNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getTableElapsedFormatted = (openedAt?: string) => {
    if (!openedAt) return '';
    const normalized = /[Zz]|[+-]\d{2}:\d{2}$/.test(openedAt) ? openedAt : `${openedAt}Z`;
    const start = new Date(normalized).getTime();
    if (isNaN(start)) return '';
    const diffSec = Math.max(0, Math.floor((posNow - start) / 1000));
    const days = Math.floor(diffSec / 86400);
    const hours = Math.floor((diffSec % 86400) / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;

    const parts: string[] = [];
    if (days > 0) {
      parts.push(`${days} gün`);
      parts.push(`${hours} saat`);
    } else if (hours > 0) {
      parts.push(`${hours} saat`);
    }
    parts.push(`${mins} dk`);
    parts.push(`${String(secs).padStart(2, '0')} sn`);

    return parts.join(' ');
  };

  useEffect(() => {
    localHardware.getTerminals().then(res => {
      if (res?.terminals && res.terminals.length > 0) {
        setScaleTerminals(res.terminals);
        const saved = localStorage.getItem('boncore_pos_terminal_id');
        if (!saved || !res.terminals.some(t => t.id === saved)) {
          const def = res.terminals.find(t => t.is_default) || res.terminals[0];
          setSelectedTerminalId(def.id);
          localStorage.setItem('boncore_pos_terminal_id', def.id);
        }
      }
    }).catch(() => {});
  }, []);

  // Quick Action Modals
  const [isFastPayModalOpen, setIsFastPayModalOpen] = useState<boolean>(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState<boolean>(false);
  const [isPrinterSelectModalOpen, setIsPrinterSelectModalOpen] = useState<boolean>(false);
  const [isMoveTableModalOpen, setIsMoveTableModalOpen] = useState<boolean>(false);
  const [currentAreas, setCurrentAreas] = useState<Area[]>(areas || []);

  useEffect(() => {
    if (areas && areas.length > 0) {
      setCurrentAreas(areas);
    } else {
      api.getAreas().then(res => {
        if (res && res.length > 0) setCurrentAreas(res);
      }).catch(() => {});
    }
  }, [areas]);

  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [orderNote, setOrderNote] = useState<string>('');
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState<boolean>(false);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [isTreatModalOpen, setIsTreatModalOpen] = useState<boolean>(false);
  const [treatReason, setTreatReason] = useState<string>('Müessese İkramı');
  const [treatSelectedItems, setTreatSelectedItems] = useState<number[]>([]);
  const [treatManagerPin, setTreatManagerPin] = useState<string>('9999');

  // Void Item Modal
  const [isVoidModalOpen, setIsVoidModalOpen] = useState<boolean>(false);
  const [selectedItemForVoid, setSelectedItemForVoid] = useState<OrderItem | null>(null);
  const [voidReasonCode, setVoidReasonCode] = useState<string>('MUSTERI_VAZGECTI');
  const [voidReasonText, setVoidReasonText] = useState<string>('Müşteri vazgeçti');
  const [voidManagerPin, setVoidManagerPin] = useState<string>('9999');

  // Cancel Entire Order Modal
  const [isCancelOrderModalOpen, setIsCancelOrderModalOpen] = useState<boolean>(false);
  const [cancelOrderReasonCode, setCancelOrderReasonCode] = useState<string>('MUSTERI_VAZGECTI');
  const [cancelOrderReasonText, setCancelOrderReasonText] = useState<string>('Müşteri vazgeçti');

  // Reçete (BOM) Stoğu Biten Ürün Uyarı Modalı
  const [bomStockWarningModal, setBomStockWarningModal] = useState<{
    productName: string;
    missingIngredients: Array<{
      ingredient_name: string;
      current_stock: number;
      required_amount: number;
      unit: string;
    }>;
  } | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Map all products by ID to quickly check unit ('Kg' vs 'Adet')
  const allProductsMap = useMemo(() => {
    const map = new Map<number, Product>();
    categories.forEach(c => (c.products || []).forEach(p => map.set(p.id, p)));
    return map;
  }, [categories]);

  const isWeightProduct = (product?: Product | null): boolean => {
    if (!product) return false;
    const u = (product.unit || '').trim().toUpperCase();
    return u === 'KG' || u === 'GR' || u === 'GRAM' || u === 'KİLO' || u === 'KILO';
  };

  const isCartItemWeight = (item: OrderItem): boolean => {
    const prod = allProductsMap.get(item.product_id);
    if (isWeightProduct(prod)) return true;
    return !Number.isInteger(Number(item.quantity));
  };

  const formatCartQuantityLabel = (qty: number, isWeight: boolean): string => {
    const rounded = Number(Number(qty).toFixed(3));
    if (isWeight || !Number.isInteger(rounded)) {
      const grams = Math.round(rounded * 1000);
      if (rounded < 1) {
        return `${rounded} Kg (${grams} gr)`;
      }
      if (!Number.isInteger(rounded)) {
        return `${rounded} Kg (${grams} gr)`;
      }
      return `${rounded} Kg`;
    }
    return `${rounded}x`;
  };

  const formatCardQuantityBadge = (qty: number, isWeight: boolean): string => {
    const rounded = Number(Number(qty).toFixed(3));
    if (isWeight || !Number.isInteger(rounded)) {
      return `${rounded}`;
    }
    return `${rounded}`;
  };

  const defaultPosDiscounts = [
    { id: 1, name: '%10 Sadakat İndirimi', type: 'percent' as const, value: 10, is_active: true },
    { id: 2, name: '%15 Personel İndirimi', type: 'percent' as const, value: 15, is_active: true },
    { id: 3, name: '%20 VIP İndirimi', type: 'percent' as const, value: 20, is_active: true },
    { id: 4, name: '%50 Yönetici / İkram İndirimi', type: 'percent' as const, value: 50, is_active: true }
  ];

  // Settings state (Kuver is disabled completely)
  const [settings, setSettings] = useState<{
    isServiceEnabled: boolean;
    serviceRate: number;
    discounts: Array<{ id?: number; name: string; type: 'percent' | 'fixed'; value: number; is_active?: boolean }>;
  }>({
    isServiceEnabled: false,
    serviceRate: 10.0,
    discounts: defaultPosDiscounts,
  });

  const [rolePermissions, setRolePermissions] = useState<PermissionItem[]>(() => {
    try {
      const saved = localStorage.getItem('boncore_role_permissions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return mergeWithInitialPermissions(parsed);
        }
      }
    } catch {}
    return initialPermissions;
  });

  useEffect(() => {
    const syncPerms = () => {
      try {
        const saved = localStorage.getItem('boncore_role_permissions');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setRolePermissions(mergeWithInitialPermissions(parsed));
          }
        }
      } catch {}
    };
    window.addEventListener('boncore_permissions_updated', syncPerms);
    window.addEventListener('storage', syncPerms);
    return () => {
      window.removeEventListener('boncore_permissions_updated', syncPerms);
      window.removeEventListener('storage', syncPerms);
    };
  }, []);

  const userRoleKey = useMemo(() => {
    const raw = (currentUser?.role || 'waiter').toLowerCase();
    if (raw === 'admin' || raw === 'müdür' || raw === 'mudur') return 'manager';
    if (raw === 'garson') return 'waiter';
    if (raw === 'kasa' || raw === 'kasiyer') return 'cashier';
    if (raw === 'mutfak') return 'kitchen';
    if (raw === 'kurye') return 'courier';
    return raw as keyof PermissionItem['roles'];
  }, [currentUser?.role]);

  const hasPerm = useCallback((permId: string, fallback = true): boolean => {
    if (userRoleKey === 'manager') return true;
    const perm = rolePermissions.find(p => p.id === permId);
    if (!perm) return fallback;
    return perm.roles[userRoleKey as keyof PermissionItem['roles']] ?? fallback;
  }, [rolePermissions, userRoleKey]);

  const canOrderGeneral = useMemo(() => hasPerm('order_general', true), [hasPerm]);
  const canShowPayButton = useMemo(() => hasPerm('order_take_payment', true), [hasPerm]);
  const canShowFastPayButton = useMemo(() => hasPerm('order_fast_pay', true), [hasPerm]);
  const canCancelOrder = useMemo(() => hasPerm('order_cancel', false) || hasPerm('order_remove_item', false), [hasPerm]);
  const canEditItemQty = useMemo(() => hasPerm('order_edit_item_qty', true), [hasPerm]);
  const canDiscount = useMemo(() => hasPerm('order_discount', false), [hasPerm]);
  const predefinedDiscountOnly = useMemo(() => hasPerm('order_predefined_discount_only', false), [hasPerm]);
  const canTreatItem = useMemo(() => hasPerm('order_item_treat', false), [hasPerm]);
  const canCloseComplimentary = useMemo(() => hasPerm('order_close_complimentary', false), [hasPerm]);
  const canTreat = useMemo(() => canTreatItem || canCloseComplimentary, [canTreatItem, canCloseComplimentary]);
  const canViewStock = useMemo(() => hasPerm('def_stock_view', true), [hasPerm]);
  const canPrintBill = useMemo(() => hasPerm('order_manual_print', true), [hasPerm]);
  const canMoveTable = useMemo(() => hasPerm('order_table_move_merge', true), [hasPerm]);

  // Load existing order
  useEffect(() => {
    setActiveCategoryId('ALL');
    setSearchQuery('');
    setSearchResults(null);
    setDiscountPercent(0);
    if (activeTable?.active_order?.id && activeTable.status !== 'empty') {
      loadOrder(activeTable.active_order.id);
    } else {
      setActiveOrderId(null);
      setExistingOrder(null);
      setCartItems([]);
    }
  }, [activeTable]);

  // Fetch settings from API on mount
  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.getSettings();
      const loadedDiscounts = (data.discounts && Array.isArray(data.discounts) && data.discounts.length > 0)
        ? data.discounts
        : defaultPosDiscounts;
      const newSettings = {
        isServiceEnabled: data.is_service_charge_enabled ?? false,
        serviceRate: data.service_charge_rate ?? 10.0,
        discounts: loadedDiscounts,
      };
      setSettings(newSettings);
      localStorage.setItem('boncore_service_enabled', String(newSettings.isServiceEnabled));
      localStorage.setItem('boncore_service_rate', String(newSettings.serviceRate));
      localStorage.setItem('boncore_discounts', JSON.stringify(loadedDiscounts));
      if (data.role_permissions && Array.isArray(data.role_permissions)) {
        const mergedPerms = mergeWithInitialPermissions(data.role_permissions);
        setRolePermissions(mergedPerms);
        broadcastPermissionsUpdate(mergedPerms);
      }
    } catch (err) {
      let cachedDiscounts = defaultPosDiscounts;
      try {
        const raw = localStorage.getItem('boncore_discounts');
        if (raw) cachedDiscounts = JSON.parse(raw);
      } catch {}
      setSettings({
        isServiceEnabled: localStorage.getItem('boncore_service_enabled') === 'true',
        serviceRate: parseFloat(localStorage.getItem('boncore_service_rate') || '10.00'),
        discounts: cachedDiscounts,
      });
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const loadOrder = async (orderId: number) => {
    try {
      const ord = await api.getOrder(orderId);
      if (ord.status === 'paid' || ord.remaining_total <= 0.05) {
        setActiveOrderId(null);
        setExistingOrder(null);
        setCartItems([]);
        return;
      }
      setExistingOrder(ord);
      setActiveOrderId(ord.id);
      setCartItems(ord.items || []);
      if (ord.notes) setOrderNote(ord.notes);
    } catch (e) {
      console.warn('Failed to load order', e);
    }
  };

  // Filter products (only those marked as visible in POS)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const q = searchQuery.toLowerCase().trim();
    const allProducts = (visibleCategories || []).flatMap(c => (c && c.products) || []).filter(Boolean);
    const matched = allProducts.filter(p => 
      p && (
        p.name.toLowerCase().includes(q) || 
        (p.plu_code && p.plu_code.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      )
    );
    setSearchResults(matched);
  }, [searchQuery, visibleCategories]);

  const currentCategory = activeCategoryId === 'ALL'
    ? null
    : (visibleCategories.find(c => c.id === activeCategoryId) || visibleCategories[0]);

  const displayedProducts = useMemo(() => {
    let baseList: Product[];
    if (searchResults !== null) {
      baseList = searchResults;
    } else if (activeCategoryId === 'ALL') {
      baseList = allOrderableProducts;
    } else {
      baseList = currentCategory?.products || [];
    }

    if (posSortMode === 'az') {
      return [...baseList].sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
    }
    if (posSortMode === 'za') {
      return [...baseList].sort((a, b) => b.name.localeCompare(a.name, 'tr', { sensitivity: 'base' }));
    }
    return baseList;
  }, [searchResults, activeCategoryId, allOrderableProducts, currentCategory, posSortMode]);

  // Helper to count quantity of product in cart
  const getProductQuantityInCart = (productId: number) => {
    const total = cartItems
      .filter(i => i.product_id === productId && !i.is_voided)
      .reduce((sum, i) => sum + Number(i.quantity), 0);
    return Number(total.toFixed(3));
  };

  // Check if any recipe (BOM) ingredient is out of stock before adding to order
  const checkBomStockBeforeAdd = (product: Product, requestedQty: number = 1, mode: 'add' | 'set' = 'add'): boolean => {
    if (!product.has_recipe || !product.recipe_items || product.recipe_items.length === 0) {
      return true;
    }
    const unsavedInCart = cartItems
      .filter(i => !i.id && !i.is_voided && i.product_id === product.id)
      .reduce((sum, i) => sum + Number(i.quantity), 0);
    const totalTargetQty = mode === 'set' ? requestedQty : Number((unsavedInCart + requestedQty).toFixed(3));

    const missing = product.recipe_items
      .filter(r => {
        const avail = Number(r.current_stock ?? 0);
        const needed = Number((Number(r.amount || 0) * totalTargetQty).toFixed(3));
        return avail <= 0 || avail + 1e-9 < needed;
      })
      .map(r => ({
        ingredient_name: r.ingredient_name,
        current_stock: Number(r.current_stock ?? 0),
        required_amount: Number((Number(r.amount || 0) * totalTargetQty).toFixed(3)),
        unit: r.unit || 'Adet'
      }));

    if (missing.length > 0) {
      sound.warning();
      setBomStockWarningModal({
        productName: product.name,
        missingIngredients: missing
      });
      const names = missing.map(m => `${m.ingredient_name} (Stok: ${m.current_stock} ${m.unit})`).join(', ');
      showToast(
        `⚠️ "${product.name}" reçetesindeki [${names}] stoğu bitti! Lütfen stoğu güncelleyin veya reçeteden kaldırın.`,
        'error'
      );
      return false;
    }
    return true;
  };

  // Read weight from CAS CL-3000 Ethernet Scale
  const handleReadFromScale = async () => {
    try {
      setScaleReading(true);
      setScaleStatus(null);
      const res = await localHardware.getWeight(undefined, undefined, selectedTerminalId || undefined);
      if (res.success && res.weight !== undefined && res.weight > 0) {
        sound.beep();
        const cleanKg = Number(Number(res.weight).toFixed(3));
        setWeightKgInput(String(cleanKg));
        setWeightGramInput(String(Math.round(cleanKg * 1000)));
        setScaleStatus({
          is_stable: res.is_stable,
          simulated: res.simulated,
          message: `${cleanKg.toFixed(3)} Kg okundu${res.is_stable ? ' (Dengeli Tartım)' : ' (Dengesiz)'}`
        });
        showToast(`⚖️ CAS CL-3000'den tartım alındı: ${cleanKg} Kg (${Math.round(cleanKg * 1000)} gr)`, 'success');
      } else if (res.success && res.weight === 0) {
        sound.warning();
        setScaleStatus({
          message: 'Kefede ağırlık yok (0.000 Kg)'
        });
        showToast('Terazi kefesi boş (0.000 Kg). Lütfen tartılacak eti terazinin üzerine koyun.', 'error');
      } else {
        sound.warning();
        setScaleStatus({
          message: res.error || 'Teraziye ulaşılamadı'
        });
        showToast(res.error || 'CAS CL-3000 teraziden ağırlık okunamadı.', 'error');
      }
    } catch (err: any) {
      sound.warning();
      setScaleStatus({ message: 'Ağ bağlantı hatası' });
      showToast(`Terazi bağlantı hatası: ${err.message || 'Sokete ulaşılamadı'}`, 'error');
    } finally {
      setScaleReading(false);
    }
  };

  // Open Weight (Kg / Gramaj) Modal for a Kg product
  const openWeightModal = (product: Product) => {
    setScaleStatus(null);
    setScaleReading(false);
    const existingUnsaved = cartItems.find(i => !i.id && i.product_id === product.id);
    if (existingUnsaved && existingUnsaved.quantity > 0) {
      const kgVal = Number(Number(existingUnsaved.quantity).toFixed(3));
      setWeightKgInput(String(kgVal));
      setWeightGramInput(String(Math.round(kgVal * 1000)));
    } else {
      setWeightKgInput('');
      setWeightGramInput('');
    }
    setWeightActiveField('kg');
    setWeightModalProduct(product);
  };

  const handleWeightKgChange = (rawVal: string) => {
    const normalized = rawVal.replace(',', '.');
    setWeightKgInput(normalized);
    setWeightActiveField('kg');
    const num = parseFloat(normalized);
    if (!isNaN(num) && num >= 0) {
      setWeightGramInput(String(Math.round(num * 1000)));
    } else {
      setWeightGramInput('');
    }
  };

  const handleWeightGramChange = (rawVal: string) => {
    const digitsOnly = rawVal.replace(/[^0-9.]/g, '');
    setWeightGramInput(digitsOnly);
    setWeightActiveField('gram');
    const gr = parseFloat(digitsOnly);
    if (!isNaN(gr) && gr >= 0) {
      const kg = Number((gr / 1000).toFixed(3));
      setWeightKgInput(String(kg));
    } else {
      setWeightKgInput('');
    }
  };

  const handleSelectPresetKg = (kgValue: number) => {
    sound.beep();
    const cleanKg = Number(kgValue.toFixed(3));
    setWeightKgInput(String(cleanKg));
    setWeightGramInput(String(Math.round(cleanKg * 1000)));
  };

  const handleWeightNumpad = (key: string) => {
    sound.beep();
    if (key === 'C') {
      setWeightKgInput('');
      setWeightGramInput('');
      return;
    }
    if (weightActiveField === 'kg') {
      if (key === '⌫') {
        const next = weightKgInput.slice(0, -1);
        handleWeightKgChange(next);
        return;
      }
      if (key === '.') {
        if (weightKgInput.includes('.')) return;
        const next = (weightKgInput === '' ? '0' : weightKgInput) + '.';
        handleWeightKgChange(next);
        return;
      }
      const next = weightKgInput + key;
      handleWeightKgChange(next);
    } else {
      if (key === '⌫') {
        const next = weightGramInput.slice(0, -1);
        handleWeightGramChange(next);
        return;
      }
      if (key === '.') return;
      const next = weightGramInput + key;
      handleWeightGramChange(next);
    }
  };

  const handleConfirmWeightModal = (mode: 'set' | 'add' = 'set') => {
    if (!weightModalProduct) return;
    const parsedKg = parseFloat(weightKgInput.replace(',', '.'));
    if (isNaN(parsedKg) || parsedKg <= 0) {
      sound.warning();
      showToast('Lütfen geçerli bir Kg veya Gram miktarı giriniz (Örn: 0.250 Kg / 250 gr).', 'error');
      return;
    }
    const cleanKg = Number(parsedKg.toFixed(3));
    if (!checkBomStockBeforeAdd(weightModalProduct, cleanKg, mode)) {
      return;
    }
    sound.beep();

    const existingIndex = cartItems.findIndex(
      i => !i.id && i.product_id === weightModalProduct.id && (!i.selected_modifiers || i.selected_modifiers.length === 0)
    );

    if (existingIndex > -1) {
      setCartItems(prev => prev.map((item, idx) => {
        if (idx === existingIndex) {
          const finalQty = mode === 'add'
            ? Number((Number(item.quantity) + cleanKg).toFixed(3))
            : cleanKg;
          const finalTotal = Number((finalQty * item.unit_price).toFixed(2));
          return { ...item, quantity: finalQty, total_price: finalTotal };
        }
        return item;
      }));
    } else {
      const newItem: OrderItem = {
        product_id: weightModalProduct.id,
        product_name: weightModalProduct.name,
        unit_price: weightModalProduct.base_price,
        quantity: cleanKg,
        total_price: Number((cleanKg * weightModalProduct.base_price).toFixed(2)),
        selected_modifiers: [],
        negative_modifiers: [],
        course_stage: 1,
        is_hold: false,
        added_by: currentUser?.name || 'Garson'
      };
      setCartItems(prev => [...prev, newItem]);
    }
    setWeightModalProduct(null);
  };

  const handleProductClick = (product: Product) => {
    if (!canOrderGeneral) {
      sound.warning();
      showToast('Genel sipariş alma yetkiniz kapalıdır.', 'error');
      return;
    }

    // Eğer hesap yazdırıldıktan sonra yeni sipariş girilirse yazdırıldı işaretini kaldır
    if (activeTable && activeTable.status === 'bill_printed') {
      activeTable.status = 'occupied';
      api.clearBillPrinted(activeTable.id).catch(() => {});
    }
    if (product.is_available === false) {
      sound.warning();
      showToast(`"${product.name}" şu anda satışa kapalıdır (Pasif).`, 'error');
      return;
    }

    // Reçetesinde (BOM) stoğu biten malzeme varsa sipariş girişini engelle ve uyar
    if (!isWeightProduct(product) && !checkBomStockBeforeAdd(product, 1, 'add')) {
      return;
    }
    if (isWeightProduct(product) && product.missing_ingredients && product.missing_ingredients.length > 0) {
      checkBomStockBeforeAdd(product, 1, 'add');
      return;
    }

    sound.beep();

    // Kg / Gramaj ile satılan ürünlerde direkt Kg/Gramaj modalını aç
    if (isWeightProduct(product)) {
      openWeightModal(product);
      return;
    }

    if ((product.variants && product.variants.length > 0) || (product.modifier_groups && product.modifier_groups.length > 0)) {
      setSelectedProductForModal(product);
      return;
    }
    // Add or increment simple piece item
    const existingIndex = cartItems.findIndex(i => !i.id && i.product_id === product.id && (!i.selected_modifiers || i.selected_modifiers.length === 0));
    if (existingIndex > -1) {
      if (!canEditItemQty) {
        sound.warning();
        showToast('Ürün adedi düzenleme yetkiniz bulunmamaktadır.', 'error');
        return;
      }
      setCartItems(prev => prev.map((item, idx) => {
        if (idx === existingIndex) {
          const newQty = Number((item.quantity + 1).toFixed(3));
          return { ...item, quantity: newQty, total_price: Number((newQty * item.unit_price).toFixed(2)) };
        }
        return item;
      }));
    } else {
      const newItem: OrderItem = {
        product_id: product.id,
        product_name: product.name,
        unit_price: product.base_price,
        quantity: 1,
        total_price: product.base_price,
        selected_modifiers: [],
        negative_modifiers: [],
        course_stage: 1,
        is_hold: false,
        added_by: currentUser?.name || 'Garson'
      };
      setCartItems(prev => [...prev, newItem]);
    }
  };

  const handleInlineIncrease = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    sound.beep();
    if (isWeightProduct(product)) {
      openWeightModal(product);
      return;
    }
    handleProductClick(product);
  };

  const handleInlineDecrease = (e: React.MouseEvent, productId: number) => {
    e.stopPropagation();
    sound.beep();
    const product = allProductsMap.get(productId);
    const existingIndex = cartItems.findIndex(i => !i.id && i.product_id === productId);
    if (existingIndex > -1) {
      // Kg ürünlerinde eksiye basıldığında eğer sepette varsa kaldır veya modal aç
      if (isWeightProduct(product)) {
        setCartItems(prev => prev.filter((_, idx) => idx !== existingIndex));
        return;
      }
      setCartItems(prev => {
        const item = prev[existingIndex];
        if (item.quantity > 1) {
          const nextQty = Number((item.quantity - 1).toFixed(3));
          return prev.map((it, idx) => idx === existingIndex ? { ...it, quantity: nextQty, total_price: Number((nextQty * it.unit_price).toFixed(2)) } : it);
        } else {
          return prev.filter((_, idx) => idx !== existingIndex);
        }
      });
    } else {
      // Saved item: trigger void modal only if user has cancel permission
      const savedItem = cartItems.find(i => i.id && !i.is_voided && i.product_id === productId);
      if (savedItem) {
        if (!canCancelOrder) {
          sound.warning();
          showToast('Sipariş / ürün iptal yetkiniz bulunmamaktadır.', 'error');
          return;
        }
        sound.beep();
        setSelectedItemForVoid(savedItem);
        setIsVoidModalOpen(true);
      }
    }
  };

  const handleAddModifiedItem = (item: OrderItem) => {
    const prod = allProductsMap.get(item.product_id);
    if (prod && !checkBomStockBeforeAdd(prod, Number(item.quantity || 1), 'add')) {
      return;
    }
    sound.beep();
    setCartItems(prev => [...prev, { ...item, added_by: currentUser?.name || 'Garson' }]);
    setSelectedProductForModal(null);
  };

  const handleSaveOrderNote = async () => {
    sound.beep();
    if (activeOrderId) {
      try {
        await api.updateOrderNotes(activeOrderId, orderNote);
      } catch (err: any) {
        console.warn('Order note update failed:', err);
      }
    }
    setIsNoteModalOpen(false);
  };

  const handleConfirmVoid = async () => {
    if (!selectedItemForVoid?.id) return;
    sound.beep();
    setLoading(true);
    try {
      await api.voidItem(
        selectedItemForVoid.id,
        voidReasonCode,
        voidReasonText,
        currentUser?.name || 'Garson',
        canCancelOrder ? '9999' : voidManagerPin
      );
      sound.warning();
      setIsVoidModalOpen(false);
      setSelectedItemForVoid(null);
      if (activeOrderId) {
        await loadOrder(activeOrderId);
      }
      onRefreshData();
    } catch (err: any) {
      showToast(err.message || 'Ürün iptal edilemedi.', 'error');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCancelOrder = async () => {
    if (!activeOrderId) return;
    sound.beep();
    setLoading(true);
    try {
      await api.cancelOrder(
        activeOrderId,
        cancelOrderReasonCode,
        cancelOrderReasonText,
        currentUser?.name || 'Garson',
        canCancelOrder ? '9999' : voidManagerPin
      );
      sound.warning();
      setIsCancelOrderModalOpen(false);
      setActiveOrderId(null);
      setExistingOrder(null);
      setCartItems([]);
      showToast('Sipariş iptal edildi.', 'success');
      onRefreshData();
      onBackToTables();
    } catch (err: any) {
      showToast(err.message || 'Sipariş iptal edilemedi.', 'error');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOrSendOrder = async () => {
    if (!canOrderGeneral) {
      sound.warning();
      showToast('Genel sipariş alma yetkiniz kapalıdır.', 'error');
      return;
    }

    // Eğer hesap yazdırıldıktan sonra yeni sipariş girilirse yazdırıldı işaretini kaldır
    if (activeTable && activeTable.status === 'bill_printed') {
      activeTable.status = 'occupied';
      api.clearBillPrinted(activeTable.id).catch(() => {});
    }
    const unsavedItems = cartItems.filter(i => !i.id);
    if (unsavedItems.length === 0 && activeOrderId) {
      onRefreshData();
      onBackToTables();
      return;
    }
    setLoading(true);
    try {
      if (activeOrderId) {
        const promises: Promise<any>[] = [
          api.addItemsToOrder(activeOrderId, unsavedItems, currentUser?.name || 'MEHMETABİ')
        ];
        if (orderNote) {
          promises.push(api.updateOrderNotes(activeOrderId, orderNote));
        }
        await Promise.all(promises);
      } else {
        const payload = {
          table_id: activeTable?.id || null,
          order_type: activeTable ? 'dine_in' : 'takeaway',
          items: unsavedItems,
          waiter_name: currentUser?.name || 'MEHMETABİ',
          notes: orderNote || null,
          kuver_count: 0
        };
        await api.createOrder(payload);
      }
      sound.kitchenBell();
      onRefreshData();
      onBackToTables();
    } catch (err: any) {
      showToast(err.message || 'Sipariş kaydedilemedi.', 'error');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleOpenMoveTableModal = async () => {
    if (!activeTable) {
      sound.warning();
      showToast('Taşınacak aktif bir masa seçili değil.', 'error');
      return;
    }
    if (!canMoveTable) {
      sound.warning();
      showToast('Masa taşıma yetkiniz bulunmamaktadır.', 'error');
      return;
    }

    try {
      const freshAreas = await api.getAreas();
      if (freshAreas && freshAreas.length > 0) {
        setCurrentAreas(freshAreas);
      }
    } catch {}

    sound.beep();
    setIsMoveTableModalOpen(true);
  };

  const handleTableMoveSuccess = async (targetTable?: Table) => {
    setIsMoveTableModalOpen(false);
    onRefreshData();

    if (targetTable) {
      showToast(`"${activeTable?.name}" masası "${targetTable.name}" masasına başarıyla taşındı.`, 'success');
      if (onSelectTable) {
        onSelectTable(targetTable);
      }
    } else {
      showToast(`Masa "${activeTable?.name}" başarıyla taşındı.`, 'success');
    }
  };

  const formatPrinterLabel = (p: string) => {
    if (!p) return { name: 'Termal Yazıcı', ip: '' };
    if (p.includes('::')) {
      const parts = p.split('::');
      return {
        name: parts[1] || parts[0],
        ip: parts[0]
      };
    }
    return {
      name: p,
      ip: ''
    };
  };

  const getPrinterStatus = (prKey: string): { isOnline: boolean; reason: string } => {
    const label = formatPrinterLabel(prKey);
    const targetPr = label.name.toLowerCase().trim();
    const targetIp = label.ip?.trim();

    if (!scaleTerminals || scaleTerminals.length === 0) {
      return { isOnline: false, reason: 'Donanım Ajanı Çevrimdışı' };
    }

    if (targetIp) {
      const matchTerm = scaleTerminals.find(t => 
        (t as any).local_ip === targetIp || t.id.includes(targetIp.replace(/\./g, '_'))
      );
      if (!matchTerm) {
        return { isOnline: false, reason: `Terminal Bulunamadı (${targetIp})` };
      }
      if (!matchTerm.is_online) {
        return { isOnline: false, reason: 'Bağlantı Yok • Terminal Çevrimdışı' };
      }
      const termPrinters = ((matchTerm as any).printers || []).map((p: string) => p.toLowerCase().trim());
      if (termPrinters.length > 0 && !termPrinters.some((p: string) => p.includes(targetPr) || targetPr.includes(p))) {
        return { isOnline: false, reason: 'Yazıcı Hazır Değil / Algılanamadı' };
      }
      return { isOnline: true, reason: 'Bağlı & Hazır' };
    }

    const matchingOnlineTerm = scaleTerminals.find(t => {
      if (!t.is_online) return false;
      const termPrinters = ((t as any).printers || []).map((p: string) => p.toLowerCase().trim());
      return termPrinters.some((p: string) => p.includes(targetPr) || targetPr.includes(p));
    });

    if (matchingOnlineTerm) {
      return { isOnline: true, reason: `Bağlı & Hazır (${matchingOnlineTerm.name})` };
    }

    const anyOnline = scaleTerminals.some(t => t.is_online);
    if (!anyOnline) {
      return { isOnline: false, reason: 'Bağlantı Yok • Ajan Çevrimdışı' };
    }

    return { isOnline: false, reason: 'Bağlantı Yok • Yazıcı Algılanamadı' };
  };

  // Yazıcı modalı açıkken terminallerin anlık online/offline durumlarını takip et
  useEffect(() => {
    if (!isPrinterSelectModalOpen) return;
    const interval = setInterval(() => {
      localHardware.getTerminals().then(res => {
        if (res?.terminals) setScaleTerminals(res.terminals as any);
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [isPrinterSelectModalOpen]);

  const handlePrintBill = async () => {
    if (!canOrderGeneral && !canPrintBill) {
      sound.warning();
      showToast('Adisyon fişi yazdırma yetkiniz kapalıdır.', 'error');
      return;
    }

    if (cartItems.length === 0 && !existingOrder && !activeOrderId) {
      sound.warning();
      showToast('Yazdırılacak ürün veya adisyon bulunamadı.', 'error');
      return;
    }

    // 1. Aktif seçili yazıcıları kontrol et
    const activePrinters = localHardware.getSelectedPrinters();
    if (!activePrinters || activePrinters.length === 0) {
      sound.warning();
      showToast('Aktif seçili yazıcı bulunamadı! Lütfen Ayarlar > Yazıcılar menüsünden en az bir yazıcı seçin veya tanımlayın.', 'error');
      return;
    }

    // Terminalleri anında tazeleyelim ki online/offline durumları tam güncel olsun
    try {
      const res = await localHardware.getTerminals();
      if (res?.terminals) {
        setScaleTerminals(res.terminals as any);
      }
    } catch {}

    // 2. Garsona seçili yazıcılardan hangisinde yazdıracağını seçtirmek için modalı aç
    setAvailablePrinters(activePrinters);
    setIsPrinterSelectModalOpen(true);
  };

  const executePrintBill = async (printersToUse: string[]) => {
    setIsPrinterSelectModalOpen(false);
    if (!printersToUse || printersToUse.length === 0) {
      sound.warning();
      showToast('Lütfen yazdırılacak en az bir yazıcı seçin.', 'error');
      return;
    }

    setLoading(true);
    try {
      let targetOrderId = activeOrderId || existingOrder?.id;
      const unsavedItems = cartItems.filter(i => !i.id);

      // Masada henüz kaydedilmemiş yeni ürünler varsa önce siparişi kaydet ki adisyona tüm kalemler yansısın
      if (unsavedItems.length > 0 || !targetOrderId) {
        if (!targetOrderId) {
          const payload = {
            table_id: activeTable?.id || null,
            order_type: activeTable ? 'dine_in' : 'takeaway',
            items: unsavedItems,
            waiter_name: currentUser?.name || 'Garson',
            notes: orderNote || null,
            kuver_count: 0
          };
          const orderRes = await api.createOrder(payload);
          targetOrderId = orderRes.order_id || orderRes.id;
        } else {
          await api.addItemsToOrder(targetOrderId, unsavedItems, currentUser?.name || 'Garson');
          if (orderNote) {
            await api.updateOrderNotes(targetOrderId, orderNote);
          }
        }
      }

      if (!targetOrderId) {
        showToast('Yazdırılacak adisyon bulunamadı.', 'error');
        return;
      }

      sound.cashDrawer();

      // 1. Backend üzerinden adisyonu yazdırıldı olarak işaretle ve ESC/POS fişini al
      await api.printTableBill(targetOrderId, currentUser?.name);

      // 2. Seçilen yazıcı(lar) üzerinden çıktıyı tetikle
      try {
        const fiscalDoc = await api.getEAdisyon(targetOrderId);
        if (fiscalDoc) {
          await printThermalReceipt(fiscalDoc, printersToUse);
        }
      } catch (printErr) {
        console.warn('Adisyon fiş yazdırma önizleme uyarısı:', printErr);
      }

      // 3. Masayı yerel state'de yazdırıldı durumuna al
      if (activeTable) {
        activeTable.status = 'bill_printed';
      }

      const labelText = printersToUse.length === 1
        ? formatPrinterLabel(printersToUse[0]).name
        : `${printersToUse.length} Yazıcıya`;
      showToast(`Adisyon "${labelText}" yazıcısına başarıyla gönderildi. Masalar ekranında "Yazdırıldı" işareti görüntülenecektir.`, 'success');
      onRefreshData();
      onBackToTables();
    } catch (err: any) {
      showToast(err.message || 'Adisyon yazdırılırken bir hata oluştu.', 'error');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleFastPayment = async (method: 'cash' | 'credit_card') => {
    if (!canShowFastPayButton) {
      sound.warning();
      showToast('Hızlı ödeme yetkiniz bulunmamaktadır.', 'error');
      return;
    }
    sound.beep();
    setLoading(true);
    try {
      let targetOrderId = activeOrderId;
      const unsavedItems = cartItems.filter(i => !i.id);
      if (!targetOrderId && unsavedItems.length > 0) {
        const payload = {
          table_id: activeTable?.id || null,
          order_type: activeTable ? 'dine_in' : 'takeaway',
          items: unsavedItems,
          waiter_name: currentUser?.name || 'Garson',
          kuver_count: 0
        };
        const orderRes = await api.createOrder(payload);
        targetOrderId = orderRes.order_id;
      } else if (activeOrderId && unsavedItems.length > 0) {
        await api.addItemsToOrder(activeOrderId, unsavedItems, currentUser?.name || 'Garson');
      }

      if (targetOrderId) {
        const payAmount = (existingOrder && unsavedItems.length === 0 && existingOrder.remaining_total > 0)
          ? existingOrder.remaining_total
          : grandTotal;
        await api.settlePayment({
          order_id: targetOrderId,
          payments: [{ method, amount: payAmount }],
          cashier_name: currentUser?.name || 'Garson',
          close_table: true
        });
        setIsFastPayModalOpen(false);
        sound.cashDrawer();
        onRefreshData();
        onBackToTables();
      }
    } catch (err: any) {
      showToast(err.message || 'Hızlı ödeme işlemi başarısız.', 'error');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTreatSubmit = async (wholeOrder: boolean = false) => {
    if (wholeOrder && !canCloseComplimentary && !canTreatItem) {
      sound.warning();
      showToast('İkram uygulama yetkiniz bulunmamaktadır.', 'error');
      return;
    }
    if (!wholeOrder && !canTreatItem) {
      sound.warning();
      showToast('Kalem bazlı ikram yetkiniz bulunmamaktadır.', 'error');
      return;
    }
    if (!activeOrderId) {
      showToast('İkram uygulamak için önce adisyonu kaydediniz.', 'error');
      return;
    }
    setLoading(true);
    try {
      await api.applyTreat(
        activeOrderId,
        wholeOrder ? null : treatSelectedItems,
        treatReason || 'Müessese İkramı',
        currentUser?.name || 'Yetkili',
        canTreat ? '9999' : treatManagerPin
      );
      sound.cashDrawer();
      await loadOrder(activeOrderId);
      setIsTreatModalOpen(false);
      showToast('İkram başarıyla uygulandı.', 'success');
      onRefreshData();
    } catch (err: any) {
      showToast(err.message || 'İkram uygulanamadı.', 'error');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleApplyDiscountSubmit = async (val: number, name: string, type: 'percent' | 'fixed' = 'percent') => {
    if (!canDiscount) {
      sound.warning();
      showToast('İndirim uygulama yetkiniz bulunmamaktadır.', 'error');
      return;
    }
    sound.beep();
    if (type === 'percent') {
      setDiscountPercent(val);
    }
    if (activeOrderId) {
      setLoading(true);
      try {
        await api.applyDiscount(
          activeOrderId,
          type === 'fixed' ? 'fixed' : 'percentage',
          val,
          name,
          currentUser?.name || 'Yetkili',
          '9999'
        );
        sound.cashDrawer();
        await loadOrder(activeOrderId);
        setIsDiscountModalOpen(false);
        showToast('İndirim başarıyla uygulandı.', 'success');
        onRefreshData();
      } catch (err: any) {
        showToast(err.message || 'İndirim uygulanamadı.', 'error');
        sound.warning();
      } finally {
        setLoading(false);
      }
    } else {
      setIsDiscountModalOpen(false);
    }
  };

  const [showBreakdown, setShowBreakdown] = useState<boolean>(false);
  const [mobilePosView, setMobilePosView] = useState<'menu' | 'cart'>('menu');

  // Listen to WebSocket events (settings, KDS kitchen statuses, order updates)
  useWebSocket('pos', (type, data) => {
    if (type === 'SETTINGS_UPDATED' && data) {
      const updatedDiscounts = (data.discounts && Array.isArray(data.discounts) && data.discounts.length > 0)
        ? data.discounts
        : settings.discounts;
      const newSettings = {
        isServiceEnabled: data.is_service_charge_enabled ?? settings.isServiceEnabled,
        serviceRate: data.service_charge_rate ?? settings.serviceRate,
        discounts: updatedDiscounts,
      };
      setSettings(newSettings);
      localStorage.setItem('boncore_service_enabled', String(newSettings.isServiceEnabled));
      localStorage.setItem('boncore_service_rate', String(newSettings.serviceRate));
      localStorage.setItem('boncore_discounts', JSON.stringify(updatedDiscounts));
      if (data.role_permissions && Array.isArray(data.role_permissions)) {
        const mergedPerms = mergeWithInitialPermissions(data.role_permissions);
        setRolePermissions(mergedPerms);
        broadcastPermissionsUpdate(mergedPerms);
      }
    }

    // Real-time kitchen & order status events
    if (type === 'KDS_STATUS_CHANGED' || type === 'ORDER_ITEM_STATUS') {
      const itemId = data?.item_id;
      const newStatus = data?.new_status || data?.status;
      if (itemId && newStatus) {
        setCartItems(prev => prev.map(item => item.id === itemId ? { ...item, status: newStatus } : item));
      }
      const curOrderId = activeOrderIdRef.current;
      if (curOrderId && (!data?.order_id || data.order_id === curOrderId)) {
        loadOrder(curOrderId);
      }
    }

    if (type === 'KDS_ORDER_READY_ALL') {
      const curOrderId = activeOrderIdRef.current;
      if (curOrderId && (!data?.order_id || data.order_id === curOrderId)) {
        setCartItems(prev => prev.map(item => item.id ? { ...item, status: 'ready' } : item));
        loadOrder(curOrderId);
      }
    }

    if (type === 'KITCHEN_ORDER_READY_ALERT' || type === 'ORDER_UPDATED') {
      const curOrderId = activeOrderIdRef.current;
      if (curOrderId && (!data?.order_id || data.order_id === curOrderId)) {
        loadOrder(curOrderId);
      }
    }
  });

  const isServiceEnabled = settings.isServiceEnabled;
  const serviceRate = isServiceEnabled ? settings.serviceRate : 0.00;

  // Calculate totals (No kuver)
  const subtotal = cartItems.filter(i => !i.is_voided).reduce((sum, i) => sum + i.total_price, 0);
  const serviceChargeTotal = (subtotal * serviceRate) / 100;
  const discountTotal = (existingOrder && existingOrder.discount_amount > 0)
    ? existingOrder.discount_amount 
    : (discountPercent > 0 ? (subtotal * discountPercent) / 100 : 0);
  const treatTotal = existingOrder?.treat_amount || 0;
  const grandTotal = Math.max(0, subtotal + serviceChargeTotal - discountTotal - treatTotal);
  const vatAmount = ((grandTotal) * 10) / 110; // %10 KDV Dahil tutarı
  const activeCartCount = cartItems.filter(i => !i.is_voided).length;

  // Live preview values for the Weight Modal
  const parsedModalKg = useMemo(() => {
    const val = parseFloat(weightKgInput.replace(',', '.'));
    return !isNaN(val) && val > 0 ? Number(val.toFixed(3)) : 0;
  }, [weightKgInput]);

  const existingUnsavedWeightItem = useMemo(() => {
    if (!weightModalProduct) return null;
    return cartItems.find(i => !i.id && i.product_id === weightModalProduct.id) || null;
  }, [weightModalProduct, cartItems]);

  return (
    <div className="relative flex-1 flex flex-col lg:flex-row h-full min-h-0 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden font-sans transition-colors duration-200">
      {/* Toast Notification */}
      {toast && (
        <div className={`absolute top-4 right-4 z-50 p-4 rounded-2xl flex items-center gap-3 text-sm font-bold shadow-2xl transition-all animate-slideDown ${
          toast.type === 'success' 
            ? 'bg-emerald-600/95 text-white border border-emerald-500' 
            : 'bg-brand-600/95 text-white border border-brand-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Mobile Top Bar: Table Info + [Menü & Ürünler] / [Adisyon] Switcher (< lg) */}
      <div className="lg:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={onBackToTables}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="truncate">
            <div className="font-extrabold text-xs text-slate-900 dark:text-white truncate flex items-center gap-1.5">
              <span>{activeTable ? activeTable.name : 'Hızlı Satış'}</span>
              {activeTable && (activeTable.active_order?.created_at || activeTable.opened_at) && (
                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                  <span>{getTableElapsedFormatted(activeTable.active_order?.created_at || activeTable.opened_at)}</span>
                </span>
              )}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
              {activeOrderId ? `Adisyon #${existingOrder?.order_no || activeOrderId}` : 'Yeni Sipariş'}
            </div>
          </div>
        </div>

        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
          <button
            onClick={() => { sound.beep(); setMobilePosView('menu'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
              mobilePosView === 'menu'
                ? 'bg-[#338d35] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            🍽️ Ürünler
          </button>
          <button
            onClick={() => { sound.beep(); setMobilePosView('cart'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer ${
              mobilePosView === 'cart'
                ? 'bg-[#338d35] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <span>🧾 Adisyon</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              mobilePosView === 'cart' ? 'bg-white/20 text-white' : 'bg-emerald-500/15 text-[#338d35] dark:text-emerald-400'
            }`}>
              {activeCartCount}
            </span>
          </button>
        </div>
      </div>

      {/* Left Panel: Adisyon & Cart - ~380px on desktop, full width when active on mobile */}
      <div className={`${mobilePosView === 'cart' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[380px] flex-1 lg:flex-none flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-lg z-10 min-h-0`}>
        {/* Ticket Top Header: ← Masa + Action Icons */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToTables}
              className="hidden lg:inline-flex p-1 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-white">
                {activeTable ? activeTable.name : 'Hızlı Satış'}
              </h2>
              {activeTable && canMoveTable && (
                <button
                  type="button"
                  onClick={handleOpenMoveTableModal}
                  className="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/70 dark:hover:bg-blue-900/70 border border-blue-200 dark:border-blue-800/80 text-blue-700 dark:text-blue-300 font-extrabold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-xs active:scale-95"
                  title="Masayı Başka Masaya Taşı"
                >
                  <ArrowRightLeft className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  <span>Masa Taşı</span>
                </button>
              )}
              {activeTable && (activeTable.active_order?.created_at || activeTable.opened_at) && (
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg flex items-center gap-1.5" title="Masa Açılış Süresi">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{getTableElapsedFormatted(activeTable.active_order?.created_at || activeTable.opened_at)}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {activeTable && canMoveTable && (
              <button 
                type="button"
                onClick={handleOpenMoveTableModal}
                className="p-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/60 transition cursor-pointer"
                title="Masayı Başka Masaya Taşı"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={() => setIsNoteModalOpen(true)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/50"
              title="Not Ekle"
            >
              <FileText className="w-4 h-4" />
            </button>
            {canDiscount && (
              <button 
                onClick={() => setIsDiscountModalOpen(true)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/50"
                title="İndirim / İkram"
              >
                <DollarSign className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={() => {
                const hasUnsaved = cartItems.some(i => !i.id);
                if (hasUnsaved) {
                  if (confirm('Adisyondaki kaydedilmemiş ürünleri temizlemek istiyor musunuz?')) {
                    sound.warning();
                    setCartItems(prev => prev.filter(i => !!i.id));
                  }
                } else if (activeOrderId && canCancelOrder) {
                  sound.beep();
                  setIsCancelOrderModalOpen(true);
                } else if (activeOrderId && !canCancelOrder) {
                  sound.warning();
                  showToast('Sipariş iptal yetkiniz bulunmamaktadır.', 'error');
                }
              }}
              className={`p-1.5 rounded-lg hover:bg-slate-200/50 ${
                activeOrderId && !canCancelOrder && !cartItems.some(i => !i.id)
                  ? 'hidden'
                  : 'text-slate-400 hover:text-brand-600'
              }`}
              title={activeOrderId && !cartItems.some(i => !i.id) ? 'Siparişi İptal Et' : 'Temizle'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Adisyon No & Status Banner */}
        <div className="px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-600 dark:text-slate-400">
            Adisyon: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{existingOrder?.order_no || '---'}</span>
          </span>
          <div className="flex items-center gap-2">
            {activeOrderId && canCancelOrder && (
              <button
                type="button"
                onClick={() => {
                  sound.beep();
                  setIsCancelOrderModalOpen(true);
                }}
                className="px-2 py-0.5 rounded-md bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-extrabold text-[10px] flex items-center gap-1 transition cursor-pointer"
                title="Açık siparişi tamamen iptal et"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>Siparişi İptal Et</span>
              </button>
            )}
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {activeOrderId ? 'Açık Hesap' : 'Yeni Sipariş'}
            </span>
          </div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-3 divide-y divide-slate-100 dark:divide-slate-800/80">
          {cartItems.map((item, idx) => {
            const isSaved = !!item.id;
            const isWeight = isCartItemWeight(item);
            const productObj = allProductsMap.get(item.product_id);
            return (
              <div 
                key={idx}
                onClick={() => {
                  if (!isSaved && isWeight && productObj) {
                    sound.beep();
                    openWeightModal(productObj);
                  }
                }}
                className={`py-2.5 px-2 flex items-start justify-between rounded-xl transition ${
                  item.is_voided 
                    ? 'opacity-40 line-through bg-emerald-50/50 dark:bg-emerald-950/20' 
                    : !isSaved && isWeight
                    ? 'hover:bg-amber-50/70 dark:hover:bg-slate-800/70 cursor-pointer'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex-1 pr-2">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className={`font-extrabold text-xs px-1.5 py-0.5 rounded-md ${
                      isWeight
                        ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-mono'
                        : 'text-slate-900 dark:text-white'
                    }`}>
                      {formatCartQuantityLabel(item.quantity, isWeight)}
                    </span>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200 leading-tight">
                      {item.product_name}
                    </span>
                    {item.variant_name && (
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-1 py-0.2 rounded">
                        {item.variant_name}
                      </span>
                    )}
                    <span 
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 shrink-0"
                      title="Siparişi Giren Personel"
                    >
                      <User className="w-2.5 h-2.5 text-slate-400" />
                      <span>{item.added_by || existingOrder?.waiter_name || currentUser?.name || 'Garson'}</span>
                    </span>
                  </div>

                  {/* Modifiers info */}
                  {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                    <div className="text-[10px] text-slate-400 pl-4 space-y-0.5 mt-0.5">
                      {item.selected_modifiers.map((m, mIdx) => (
                        <div key={mIdx}>+ {m.name} {m.price > 0 && `(₺${m.price.toFixed(2)})`}</div>
                      ))}
                    </div>
                  )}

                  {/* Negative modifiers info */}
                  {item.negative_modifiers && item.negative_modifiers.length > 0 && (
                    <div className="text-[10px] text-brand-500 pl-4 space-y-0.5 mt-0.5">
                      {item.negative_modifiers.map((nm, nmIdx) => (
                        <div key={nmIdx}>- {nm}</div>
                      ))}
                    </div>
                  )}

                  {/* Status Indicator */}
                  <div className="flex items-center gap-2 mt-1">
                    {isSaved ? (
                      (item.status === 'ready' || item.status === 'served') ? (
                        <span className="text-[9px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-400 dark:border-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs animate-fadeIn">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Teslim Edildi</span>
                        </span>
                      ) : item.status === 'preparing' ? (
                        <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          <span>Hazırlanıyor</span>
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 text-slate-400" />
                          <span>Mutfağa İletildi</span>
                        </span>
                      )
                    ) : (
                      <>
                        <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                          ● Kaydedilmedi
                        </span>
                        {isWeight && productObj && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sound.beep();
                              openWeightModal(productObj);
                            }}
                            className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded flex items-center gap-0.5 hover:bg-blue-100"
                          >
                            <Scale className="w-2.5 h-2.5" /> Kg/gr Değiştir
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Ürün İndirimi Göstergesi ve İptal Butonu */}
                  {isSaved && Boolean(item.discount_amount && item.discount_amount > 0) && (
                    <div className="flex items-center justify-between mt-1 text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-brand-600 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50">
                      <span className="font-bold flex items-center gap-1">
                        🏷️ İndirim: -₺{(item.discount_amount || 0).toFixed(2)} {item.discount_rate ? `(%${item.discount_rate})` : ''}
                      </span>
                      {item.id && canDiscount && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            sound.beep();
                            try {
                              await api.removeItemDiscount(item.id!);
                              if (activeOrderId) await loadOrder(activeOrderId);
                              showToast(`${item.product_name} indirimi iptal edildi.`, 'success');
                              onRefreshData();
                            } catch (err: any) {
                              showToast(err.message || 'İndirim iptal edilemedi.', 'error');
                              sound.warning();
                            }
                          }}
                          className="font-bold text-brand-700 dark:text-emerald-300 hover:underline px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-900/60 rounded transition"
                          title="Bu ürünün indirimini iptal et"
                        >
                          ✕ İptal
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end justify-between self-stretch">
                  <span className="font-mono text-xs font-black text-slate-900 dark:text-white">
                    ₺{Number(item.total_price || 0).toFixed(2)}
                  </span>

                  {(!isSaved || canCancelOrder) && !item.is_voided && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isSaved) {
                          setCartItems(prev => prev.filter((_, i) => i !== idx));
                        } else if (canCancelOrder) {
                          sound.beep();
                          setSelectedItemForVoid(item);
                          setIsVoidModalOpen(true);
                        }
                      }}
                      className="text-slate-300 hover:text-brand-500 p-1 transition"
                      title={isSaved ? 'Ürünü İptal Et' : 'Sepetten Kaldır'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {cartItems.length === 0 && (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-xs text-center p-4 gap-2">
              <span>Henüz ürün eklenmedi.</span>
              <button
                onClick={() => setMobilePosView('menu')}
                className="lg:hidden px-3 py-1.5 rounded-xl bg-[#338d35] hover:bg-[#28702a] text-white font-bold text-xs"
              >
                Ürün Ekle
              </button>
            </div>
          )}
        </div>

        {/* Bottom Bar: Total Summary + Breakdown Drawer + 3 Action Buttons */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2 shadow-2xl shrink-0">
          {/* Expandable Breakdown Details */}
          {showBreakdown && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-semibold space-y-1.5 animate-fadeIn">
              <div className="flex justify-between text-slate-500">
                <span>Ürünler Ara Toplamı:</span>
                <span className="font-mono text-slate-900 dark:text-white font-bold">₺{subtotal.toFixed(2)}</span>
              </div>
              {serviceChargeTotal > 0 && (
                <div className="flex justify-between text-blue-600 dark:text-blue-400">
                  <span>Servis Bedeli (%{serviceRate}):</span>
                  <span className="font-mono font-bold">+₺{serviceChargeTotal.toFixed(2)}</span>
                </div>
              )}
              {discountTotal > 0 && (
                <div className="flex items-center justify-between text-brand-600 dark:text-emerald-400">
                  <div className="flex items-center gap-1.5">
                    <span>Uygulanan İndirim:</span>
                    {activeOrderId && canDiscount && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          sound.beep();
                          try {
                            await api.removeAllDiscounts(activeOrderId);
                            setDiscountPercent(0);
                            await loadOrder(activeOrderId);
                            showToast('Tüm indirimler sıfırlandı.', 'success');
                            onRefreshData();
                          } catch (err: any) {
                            showToast(err.message || 'İndirimler sıfırlanamadı.', 'error');
                            sound.warning();
                          }
                        }}
                        className="text-[9px] bg-emerald-100 dark:bg-emerald-900/60 text-brand-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold hover:underline"
                        title="Tüm indirimleri kaldır"
                      >
                        ✕ Sıfırla
                      </button>
                    )}
                  </div>
                  <span className="font-mono font-bold">-₺{discountTotal.toFixed(2)}</span>
                </div>
              )}
              {treatTotal > 0 && (
                <div className="flex justify-between text-purple-600 dark:text-purple-400">
                  <span>İkram Tutarı:</span>
                  <span className="font-mono font-bold">-₺{treatTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                <span>Hesaplanan KDV (%10 Dahil):</span>
                <span className="font-mono">₺{vatAmount.toFixed(2)}</span>
              </div>
              {existingOrder && (existingOrder.paid_total || 0) > 0 && (
                <div className="pt-1.5 border-t border-dashed border-amber-300 dark:border-amber-800/80 space-y-1">
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>✓ Yapılan Ara Tahsilat:</span>
                    <span className="font-mono font-black">₺{(existingOrder.paid_total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-brand-600 dark:text-emerald-400 font-black">
                    <span>Kalan Borç Tutar:</span>
                    <span className="font-mono">₺{((existingOrder.remaining_total !== undefined ? existingOrder.remaining_total : Math.max(0, grandTotal - (existingOrder.paid_total || 0)))).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Top Total Row (Clickable to expand breakdown) - Ara Tahsilat Uyumlu: Toplam Tutar / Ödenen */}
          <div 
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="flex items-center justify-between text-xs font-bold px-2 py-1.5 rounded-xl border border-transparent hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Hesap dökümünü göster/gizle"
          >
            <div className="flex flex-col">
              <span className="text-slate-600 dark:text-slate-400 font-bold">
                {existingOrder && (existingOrder.paid_total || 0) > 0 ? 'Toplam / Ödenen:' : 'Toplam Tutar'}
              </span>
              {existingOrder && (existingOrder.paid_total || 0) > 0 && (
                <span className="text-[10px] text-brand-600 dark:text-emerald-400 font-black font-mono mt-0.5">
                  Kalan: ₺{((existingOrder.remaining_total !== undefined ? existingOrder.remaining_total : Math.max(0, grandTotal - (existingOrder.paid_total || 0)))).toFixed(2)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {existingOrder && (existingOrder.paid_total || 0) > 0 ? (
                <div className="flex flex-col items-end">
                  <div className="text-sm sm:text-base font-black font-mono tracking-tight">
                    <span className="text-slate-900 dark:text-white" title="Genel Toplam">
                      ₺{grandTotal.toFixed(2)}
                    </span>
                    <span className="text-slate-400 font-normal mx-1">/</span>
                    <span className="text-emerald-600 dark:text-emerald-400" title="Ara Tahsilat İle Ödenen Tutar">
                      ₺{(existingOrder.paid_total || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-base font-black text-slate-950 dark:text-white font-mono">
                  ₺{grandTotal.toFixed(2)}
                </span>
              )}
              <ChevronUp className={`w-4 h-4 text-slate-400 transition-transform ${showBreakdown ? 'rotate-180 text-brand-600' : ''}`} />
            </div>
          </div>
          {/* Action Buttons: ÖDE, HIZLI ÖDE, YAZDIR, KAYDET */}
          <div className="flex items-center gap-1.5 pt-1">
            {canShowPayButton && (
              <button
                onClick={async () => {
                  sound.beep();
                  const unsavedItems = cartItems.filter(i => !i.id);
                  let targetId = activeOrderId;
                  if (unsavedItems.length > 0) {
                    setLoading(true);
                    try {
                      if (targetId) {
                        await api.addItemsToOrder(targetId, unsavedItems, currentUser?.name || 'Garson');
                        await loadOrder(targetId);
                      } else {
                        const res = await api.createOrder({
                          table_id: activeTable?.id || null,
                          order_type: activeTable ? 'dine_in' : 'takeaway',
                          items: unsavedItems,
                          waiter_name: currentUser?.name || 'Garson',
                          notes: orderNote || null,
                          kuver_count: 0
                        });
                        targetId = res.order_id;
                        if (targetId) await loadOrder(targetId);
                      }
                      onRefreshData();
                    } catch (err: any) {
                      showToast(err.message || 'Sipariş kaydedilemedi.', 'error');
                      setLoading(false);
                      return;
                    }
                    setLoading(false);
                  }
                  if (targetId) {
                    onOpenCheckout(targetId, activeTable);
                  }
                }}
                disabled={loading || (cartItems.length === 0 && !activeOrderId)}
                className="flex-1 min-w-0 py-3 px-2 rounded-xl bg-[#27ae60] hover:bg-[#219653] disabled:opacity-50 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">
                  ÖDE ₺{(existingOrder && cartItems.filter(i => !i.id).length === 0 ? existingOrder.remaining_total : grandTotal).toFixed(2)}
                </span>
              </button>
            )}

            {canShowFastPayButton && (
              <button
                onClick={() => {
                  sound.beep();
                  setIsFastPayModalOpen(true);
                }}
                disabled={loading || (cartItems.length === 0 && !existingOrder)}
                className="py-3 px-2.5 rounded-xl bg-[#fff9db] dark:bg-amber-950/40 border border-[#f59f00]/40 text-[#d97706] hover:bg-[#ffec99] disabled:opacity-50 font-black text-[11px] transition flex items-center justify-center gap-1 shrink-0 cursor-pointer"
              >
                <Zap className="w-3 h-3 flex-shrink-0 text-amber-500 fill-amber-500" />
                <span>HIZLI ÖDE</span>
              </button>
            )}

            <button
              onClick={handlePrintBill}
              disabled={loading || (cartItems.length === 0 && !existingOrder && !activeOrderId)}
              className="py-3 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-sky-600/20 transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
              title="Adisyon Hesabını Yazdır"
            >
              <Printer className="w-3.5 h-3.5 flex-shrink-0" />
              <span>YAZDIR</span>
            </button>

            <button
              onClick={handleSaveOrSendOrder}
              disabled={loading || cartItems.length === 0}
              className="py-3 px-3.5 rounded-xl bg-[#338d35] hover:bg-[#28702a] disabled:opacity-50 text-white font-black text-xs shadow transition flex items-center justify-center cursor-pointer shrink-0"
            >
              <span>KAYDET</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel: Search Bar + Toolbar + 2-Row Category Grid + Product Cards */}
      <div className={`${mobilePosView === 'menu' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 min-h-0`}>
        {/* Top Search & Toolbar */}
        <div className="h-12 sm:h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 flex items-center justify-between gap-2 sm:gap-3 shadow-sm shrink-0">
          <div className="relative flex-1 max-w-xl">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ürün veya Barkod Ara..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 sm:py-2 text-xs md:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Action Toolbar Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* A-Z Sort Button */}
            <button
              onClick={() => {
                sound.beep();
                setPosSortMode(prev => (prev === 'az' ? 'custom' : 'az'));
              }}
              className={`px-2 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1 transition cursor-pointer ${
                posSortMode === 'az'
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
              }`}
              title="Ürünleri A'dan Z'ye Sırala"
            >
              <ArrowDownAZ className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">A-Z</span>
            </button>

            {/* Z-A Sort Button */}
            <button
              onClick={() => {
                sound.beep();
                setPosSortMode(prev => (prev === 'za' ? 'custom' : 'za'));
              }}
              className={`px-2 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1 transition cursor-pointer ${
                posSortMode === 'za'
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
              }`}
              title="Ürünleri Z'den A'ya Sırala"
            >
              <ArrowUpZA className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Z-A</span>
            </button>

            {/* Note Button 📄 */}
            <button
              onClick={() => setIsNoteModalOpen(true)}
              className="p-2 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
              title="Adisyon Notu"
            >
              <FileText className="w-4 h-4" />
            </button>

            {/* Treat Button 🍽️ */}
            {canTreat && (
              <button
                onClick={() => { sound.beep(); setIsTreatModalOpen(true); }}
                className="p-2 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                title="İkram Uygula"
              >
                <Utensils className="w-4 h-4" />
              </button>
            )}

            {/* Discount Button 💵 */}
            {canDiscount && (
              <button
                onClick={() => setIsDiscountModalOpen(true)}
                className="p-2 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                title="İndirim Uygula"
              >
                <DollarSign className="w-4 h-4" />
              </button>
            )}

            {/* Table Transfer Button ⇄ */}
            {activeTable && canMoveTable && (
              <button
                type="button"
                onClick={handleOpenMoveTableModal}
                className="px-2.5 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 transition cursor-pointer bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 shadow-xs active:scale-95 shrink-0"
                title="Masayı Başka Masaya Taşı"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">Masa Taşı</span>
              </button>
            )}

            {/* Undo / Refresh Button ↻ */}
            <button
              onClick={() => {
                sound.beep();
                setSearchQuery('');
                setSearchResults(null);
                setActiveCategoryId('ALL');
              }}
              className="p-2 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
              title="Yenile (Tümü)"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2-Row Horizontal Category Grid */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2 sm:p-3 overflow-x-auto shrink-0">
          <div className="flex flex-nowrap sm:flex-wrap gap-1.5 sm:max-h-24 overflow-x-auto sm:overflow-y-auto no-scrollbar">
            {/* TÜMÜ (Tüm Sipariş Verilebilir Ürünler) */}
            <button
              onClick={() => {
                sound.beep();
                setSearchQuery('');
                setSearchResults(null);
                setActiveCategoryId('ALL');
              }}
              className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeCategoryId === 'ALL' && searchResults === null
                  ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white border-b-2 border-brand-600 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900'
              }`}
            >
              <span>TÜMÜ</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                activeCategoryId === 'ALL' && searchResults === null
                  ? 'bg-slate-300 dark:bg-slate-600 text-slate-900 dark:text-white font-black'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold'
              }`}>
                {allOrderableProducts.length}
              </span>
            </button>
            {visibleCategories.map((cat) => {
              const isCatActive = activeCategoryId === cat.id && searchResults === null;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    sound.beep();
                    setSearchQuery('');
                    setSearchResults(null);
                    setActiveCategoryId(cat.id);
                  }}
                  className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-tight transition whitespace-nowrap shrink-0 ${
                    isCatActive
                      ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white border-b-2 border-brand-600'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900'
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Clean White Product Cards Grid with Inline Stepper Overlay */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3.5 content-start">
          {displayedProducts.map((p) => {
            const qty = getProductQuantityInCart(p.id);
            const isPassive = p.is_available === false;
            const isWeight = isWeightProduct(p);
            return (
              <div
                key={p.id}
                onClick={() => handleProductClick(p)}
                className={`h-24 sm:h-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between pos-touch-card shadow-sm hover:shadow-md transition relative group overflow-hidden ${
                  isPassive ? 'opacity-55 grayscale cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <div className={qty > 0 ? 'pr-8' : 'pr-2'}>
                  <h4 className="font-extrabold text-xs md:text-sm text-slate-900 dark:text-white uppercase tracking-tight leading-snug group-hover:text-brand-600 transition line-clamp-2">
                    {p.name}
                  </h4>
                </div>

                <div className={`flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 ${qty > 0 ? 'pr-8' : ''}`}>
                  <span className="font-mono text-xs font-black text-slate-900 dark:text-white">
                    ₺{p.base_price.toFixed(2)}{isWeight ? '/Kg' : ''}
                  </span>
                  {isPassive ? (
                    <span className="text-[9px] font-bold text-brand-600 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded">
                      Pasif
                    </span>
                  ) : canViewStock && p.stock_quantity !== undefined && p.stock_quantity !== null ? (
                    <span className={p.stock_quantity <= 0 ? 'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded truncate text-brand-600 bg-emerald-50 dark:bg-emerald-950/50' : 'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded truncate text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50'}>
                      {Number(Number(p.stock_quantity).toFixed(2))} {p.unit || 'Adet'}
                    </span>
                  ) : p.variants && p.variants.length > 0 ? (
                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded">
                      Seçenek
                    </span>
                  ) : null}
                </div>

                {/* Inline Card Quantity Stepper Overlay */}
                {qty > 0 && (
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-9 bg-[#338d35] text-white flex flex-col items-center justify-between py-1 z-10 shadow-lg rounded-r-2xl animate-fadeIn"
                  >
                    <button
                      onClick={(e) => handleInlineIncrease(e, p)}
                      className="w-full text-center hover:bg-black/20 font-black text-xs active:scale-90"
                      title={isWeight ? 'Kg / Gramaj Değiştir' : 'Arttır'}
                    >
                      {isWeight ? <Scale className="w-3.5 h-3.5 mx-auto" /> : '+'}
                    </button>
                    <span
                      onClick={(e) => {
                        if (isWeight) {
                          e.stopPropagation();
                          openWeightModal(p);
                        }
                      }}
                      className="font-mono font-black text-[10px] leading-tight text-center px-0.5 truncate w-full"
                    >
                      {formatCardQuantityBadge(qty, isWeight)}
                    </span>
                    <button
                      onClick={(e) => handleInlineDecrease(e, p.id)}
                      className="w-full text-center hover:bg-black/20 font-black text-sm active:scale-90"
                      title={isWeight ? 'Kaldır' : 'Azalt'}
                    >
                      -
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {displayedProducts.length === 0 && (
            <div className="col-span-full py-20 text-center text-slate-400">
              <p className="text-sm font-bold">Bu alanda gösterilecek sipariş verilebilir ürün bulunamadı.</p>
            </div>
          )}
        </div>

        {/* Sticky Mobile Bottom Action Bar in Menu View (< lg) */}
        {(cartItems.length > 0 || existingOrder) && (
          <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 flex items-center gap-2 shadow-2xl shrink-0">
            {canShowFastPayButton && (
              <button
                onClick={() => { sound.beep(); setIsFastPayModalOpen(true); }}
                disabled={loading}
                className="py-3 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1 shrink-0 shadow-sm cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>Hızlı Öde</span>
              </button>
            )}
            <button
              onClick={handlePrintBill}
              disabled={loading || (cartItems.length === 0 && !existingOrder && !activeOrderId)}
              className="flex-1 py-3 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 active:scale-95 disabled:opacity-50 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
              title="Adisyon Hesabını Yazdır"
            >
              <Printer className="w-4 h-4" />
              <span>Yazdır</span>
            </button>
            <button
              onClick={handleSaveOrSendOrder}
              disabled={loading || cartItems.length === 0}
              className="flex-1 py-3 px-3.5 rounded-xl bg-[#338d35] hover:bg-[#28702a] active:scale-95 disabled:opacity-50 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <span>Kaydet</span>
            </button>
          </div>
        )}
      </div>

      {/* ================= KG / GRAMAJ GİRİŞ MODALI ================= */}
      {weightModalProduct && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                    {weightModalProduct.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                    Birim Fiyat: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">₺{weightModalProduct.base_price.toFixed(2)} / Kg</span>
                    {weightModalProduct.stock_quantity !== undefined && (
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                        • Stok: {Number(Number(weightModalProduct.stock_quantity).toFixed(2))} Kg
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWeightModalProduct(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* CAS CL-3000 Ethernet Terazi Bağlantı Paneli */}
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 border-2 border-emerald-500/40 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-md shadow-emerald-600/30 shrink-0">
                  <Scale className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-black text-emerald-950 dark:text-emerald-100">CAS CL-3000 (Ethernet)</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                      CANLI AĞ
                    </span>
                    {scaleTerminals.length > 1 && (
                      <select
                        value={selectedTerminalId}
                        onChange={(e) => {
                          setSelectedTerminalId(e.target.value);
                          localStorage.setItem('boncore_pos_terminal_id', e.target.value);
                        }}
                        className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-emerald-500/50 rounded-md text-[11px] font-bold text-emerald-800 dark:text-emerald-200 outline-none"
                      >
                        {scaleTerminals.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.is_online ? '🟢' : '⚪'} {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold truncate mt-0.5">
                    {scaleStatus?.message || "Eti terazinin kefesine koyup butona basın"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReadFromScale}
                disabled={scaleReading}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs shadow-md shadow-emerald-600/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                {scaleReading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Tartılıyor...</span>
                  </>
                ) : (
                  <>
                    <Scale className="w-4 h-4" />
                    <span>⚖️ Teraziden Ağırlığı Al</span>
                  </>
                )}
              </button>
            </div>

            {/* Dual Synchronized Inputs: Kg (Küsuratlı) & Gram (gr) */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setWeightActiveField('kg')}
                className={`p-3 rounded-2xl border-2 transition cursor-pointer ${
                  weightActiveField === 'kg'
                    ? 'border-brand-600 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                }`}
              >
                <label className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                  Kaç Kg? (Küsuratlı)
                </label>
                <div className="flex items-baseline gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={weightKgInput}
                    onFocus={() => setWeightActiveField('kg')}
                    onChange={(e) => handleWeightKgChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConfirmWeightModal('set');
                      }
                    }}
                    placeholder="0.250"
                    className="w-full bg-transparent font-mono text-xl font-black text-slate-900 dark:text-white focus:outline-none"
                  />
                  <span className="text-xs font-extrabold text-slate-500">Kg</span>
                </div>
              </div>

              <div
                onClick={() => setWeightActiveField('gram')}
                className={`p-3 rounded-2xl border-2 transition cursor-pointer ${
                  weightActiveField === 'gram'
                    ? 'border-brand-600 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                }`}
              >
                <label className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                  Gramaj (Gram)
                </label>
                <div className="flex items-baseline gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={weightGramInput}
                    onFocus={() => setWeightActiveField('gram')}
                    onChange={(e) => handleWeightGramChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConfirmWeightModal('set');
                      }
                    }}
                    placeholder="250"
                    className="w-full bg-transparent font-mono text-xl font-black text-slate-900 dark:text-white focus:outline-none"
                  />
                  <span className="text-xs font-extrabold text-slate-500">gr</span>
                </div>
              </div>
            </div>

            {/* Quick Gram / Kg Preset Buttons */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1.5">
                Hızlı Gramaj & Kg Seçimi:
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: '100 gr', sub: '0.1 Kg', kg: 0.1 },
                  { label: '150 gr', sub: '0.15 Kg', kg: 0.15 },
                  { label: '200 gr', sub: '0.2 Kg', kg: 0.2 },
                  { label: '250 gr', sub: '0.25 Kg', kg: 0.25 },
                  { label: '300 gr', sub: '0.3 Kg', kg: 0.3 },
                  { label: '400 gr', sub: '0.4 Kg', kg: 0.4 },
                  { label: '500 gr', sub: '0.5 Kg', kg: 0.5 },
                  { label: '750 gr', sub: '0.75 Kg', kg: 0.75 },
                  { label: '1 Kg', sub: '1000 gr', kg: 1.0 },
                  { label: '1.25 Kg', sub: '1250 gr', kg: 1.25 },
                  { label: '1.5 Kg', sub: '1500 gr', kg: 1.5 },
                  { label: '2 Kg', sub: '2000 gr', kg: 2.0 },
                ].map((preset) => {
                  const isSelected = Math.abs(parsedModalKg - preset.kg) < 0.001;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleSelectPresetKg(preset.kg)}
                      className={`py-2 px-1.5 rounded-xl border text-center transition cursor-pointer ${
                        isSelected
                          ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                          : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="font-extrabold text-xs leading-tight">{preset.label}</div>
                      <div className={`text-[9px] font-mono ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                        {preset.sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Touch Numpad for fast decimal entry */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {['7', '8', '9', '⌫', '4', '5', '6', 'C', '1', '2', '3', '.', '0', '00'].map((key, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleWeightNumpad(key)}
                  className={`py-2.5 rounded-xl font-mono font-black text-sm border transition active:scale-95 cursor-pointer ${
                    key === '00' ? 'col-span-2' : ''
                  } ${
                    key === 'C' || key === '⌫'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-brand-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Live Price Calculation Box */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  Girilen Miktar
                </div>
                <div className="font-mono font-black text-sm text-slate-900 dark:text-white">
                  {parsedModalKg > 0
                    ? `${parsedModalKg} Kg (${Math.round(parsedModalKg * 1000)} gr)`
                    : '0 Kg (0 gr)'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  Hesaplanan Tutar
                </div>
                <div className="font-mono font-black text-lg text-emerald-600 dark:text-emerald-400">
                  ₺{(parsedModalKg * weightModalProduct.base_price).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Submit / Cancel Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setWeightModalProduct(null)}
                className="py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
              >
                Vazgeç
              </button>
              {existingUnsavedWeightItem && (
                <button
                  type="button"
                  onClick={() => handleConfirmWeightModal('add')}
                  className="py-3 px-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs shadow transition cursor-pointer"
                  title="Sepetteki mevcut ağırlığın üzerine ekler"
                >
                  + Üzerine Ekle
                </button>
              )}
              <button
                type="button"
                onClick={() => handleConfirmWeightModal('set')}
                className="flex-1 py-3 px-4 rounded-2xl bg-[#338d35] hover:bg-[#28702a] text-white font-black text-xs shadow-lg transition cursor-pointer"
              >
                {existingUnsavedWeightItem ? 'Miktarı Güncelle' : 'Adisyona Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {isNoteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <h3 className="text-base font-black">Adisyon Notu Ekle</h3>
            <textarea
              rows={3}
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Örn: Müşteri cam kenarı tercih ediyor, hesap ayrı ödenecek..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setIsNoteModalOpen(false)}
                className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs"
              >
                Kapat
              </button>
              <button
                onClick={handleSaveOrderNote}
                className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-black text-xs transition"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <h3 className="text-base font-black">Adisyona İndirim Uygula</h3>

            {/* Defined Quick Templates from Settings */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500">Tanımlı İndirim Şablonları (Restaurant Tanımlamaları):</label>
              <div className="grid grid-cols-2 gap-2">
                {settings.discounts.filter(d => d.is_active !== false).map((d, i) => (
                  <button
                    key={d.id || i}
                    onClick={() => handleApplyDiscountSubmit(d.value, d.name, d.type)}
                    className="p-2.5 bg-slate-50 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 rounded-xl text-left transition flex items-center justify-between gap-1"
                  >
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{d.name}</span>
                    <span className="font-mono font-black text-brand-600 text-xs shrink-0">
                      {d.type === 'fixed' ? `₺${d.value}` : `%${d.value}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Discount Input */}
            {!predefinedDiscountOnly && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <label className="text-[11px] font-bold text-slate-500">Özel Yüzdesel İndirim (%):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="10"
                    value={discountPercent === 0 ? '' : discountPercent}
                    onChange={(e) => setDiscountPercent(Number(e.target.value) || 0)}
                    className="w-24 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-center font-black text-slate-900 dark:text-white"
                  />
                  <button
                    onClick={() => {
                      if (discountPercent > 0) {
                        handleApplyDiscountSubmit(discountPercent, `%${discountPercent} Özel İndirim`);
                      } else {
                        setIsDiscountModalOpen(false);
                      }
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow transition cursor-pointer"
                  >
                    Özel İndirimi Uygula
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setIsDiscountModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Treat Modal (İkram Modalı) */}
      {isTreatModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Utensils className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-black">Adisyona İkram Uygula</h3>
              </div>
              <button onClick={() => setIsTreatModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Reason Chips */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500">İkram Nedeni:</label>
              <div className="flex flex-wrap gap-1.5">
                {['Müessese İkramı', 'Şef İkramı', 'Özel İkram', 'Hizmet Telafisi', 'Yönetim Onayı'].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { sound.beep(); setTreatReason(r); }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      treatReason === r
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Manager PIN Verification (Sadece ikram yetkisi yoksa gösterilir) */}
            {!canTreat && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500">Yetkili / Müdür PIN Kodu:</label>
                <input
                  type="password"
                  maxLength={6}
                  value={treatManagerPin}
                  onChange={(e) => setTreatManagerPin(e.target.value)}
                  placeholder="9999"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-center font-black tracking-widest text-slate-900 dark:text-white"
                />
              </div>
            )}

            {/* Itemized Selection if existing order has saved items */}
            {canTreatItem && existingOrder && existingOrder.items && existingOrder.items.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500">Kalem Bazlı İkram (Opsiyonel):</label>
                <div className="max-h-36 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-800 rounded-2xl p-2">
                  {existingOrder.items.filter(it => !it.is_voided).map(it => {
                    const isSelected = treatSelectedItems.includes(it.id);
                    return (
                      <div
                        key={it.id}
                        onClick={() => {
                          sound.beep();
                          setTreatSelectedItems(prev =>
                            isSelected ? prev.filter(id => id !== it.id) : [...prev, it.id]
                          );
                        }}
                        className={`p-2 rounded-xl text-xs flex items-center justify-between cursor-pointer border transition ${
                          isSelected
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 text-amber-900 dark:text-amber-200 font-bold'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-transparent text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>{formatCartQuantityLabel(it.quantity, isCartItemWeight(it))} {it.product_name}</span>
                        <span className="font-mono">₺{it.total_price.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              {canCloseComplimentary && (
                <button
                  onClick={() => handleApplyTreatSubmit(true)}
                  disabled={loading}
                  className={`${canTreatItem ? '' : 'col-span-2'} py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-1 cursor-pointer`}
                >
                  <span>TÜM ADİSYON İKRAM</span>
                </button>
              )}
              {canTreatItem && (
                <button
                  onClick={() => handleApplyTreatSubmit(false)}
                  disabled={loading || treatSelectedItems.length === 0}
                  className={`${canCloseComplimentary ? '' : 'col-span-2'} py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-1 cursor-pointer`}
                >
                  <span>SEÇİLENLERİ İKRAM ET ({treatSelectedItems.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Void (İptal/İade) Modal */}
      {isVoidModalOpen && selectedItemForVoid && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-brand-600 dark:text-emerald-400">Ürün İptal & İade</h3>
                <p className="text-xs text-slate-500 font-semibold">{selectedItemForVoid.product_name}</p>
              </div>
              <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                ₺{selectedItemForVoid.unit_price.toFixed(2)}
              </span>
            </div>

            <div className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1.5 font-bold">İptal Sebebi:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { code: 'MUSTERI_VAZGECTI', label: 'Müşteri Vazgeçti' },
                    { code: 'YANLIS_SIPARIS', label: 'Yanlış Sipariş Girişi' },
                    { code: 'GECIKME', label: 'Mutfak Gecikmesi' },
                    { code: 'BOZUK_URUN', label: 'Bozuk / Soğuk Ürün' },
                  ].map((r) => (
                    <button
                      key={r.code}
                      type="button"
                      onClick={() => {
                        sound.beep();
                        setVoidReasonCode(r.code);
                        setVoidReasonText(r.label);
                      }}
                      className={`p-2 rounded-xl text-left font-bold transition border ${
                        voidReasonCode === r.code
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-brand-500 text-brand-600 dark:text-emerald-300'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-slate-500 block mb-1 font-bold">Açıklama / Not:</label>
                <input
                  type="text"
                  value={voidReasonText}
                  onChange={(e) => setVoidReasonText(e.target.value)}
                  placeholder="İptal ayrıntısı..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              {!canCancelOrder && (
                <div>
                  <label className="text-slate-500 block mb-1 font-bold">Müdür / Yetkili PIN:</label>
                  <input
                    type="password"
                    value={voidManagerPin}
                    onChange={(e) => setVoidManagerPin(e.target.value)}
                    maxLength={6}
                    placeholder="PIN"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-center tracking-widest text-slate-900 dark:text-white"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsVoidModalOpen(false);
                  setSelectedItemForVoid(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-black text-xs shadow-md transition disabled:opacity-50"
              >
                {loading ? 'İptal Ediliyor...' : 'İptali Onayla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Entire Order Modal (Siparişi İptal Et) */}
      {isCancelOrderModalOpen && activeOrderId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-rose-600 dark:text-rose-400">Siparişi İptal Et</h3>
                <p className="text-xs text-slate-500 font-semibold">
                  {activeTable ? activeTable.name : 'Hızlı Satış'} • #{existingOrder?.order_no || activeOrderId}
                </p>
              </div>
              <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                ₺{grandTotal.toFixed(2)}
              </span>
            </div>

            <div className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1.5 font-bold">Sipariş İptal Sebebi:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { code: 'MUSTERI_VAZGECTI', label: 'Müşteri Vazgeçti' },
                    { code: 'YANLIS_SIPARIS', label: 'Yanlış Masa / Sipariş' },
                    { code: 'GECIKME', label: 'Mutfak Gecikmesi' },
                    { code: 'DIGER', label: 'Diğer Sebep' },
                  ].map((r) => (
                    <button
                      key={r.code}
                      type="button"
                      onClick={() => {
                        sound.beep();
                        setCancelOrderReasonCode(r.code);
                        setCancelOrderReasonText(r.label);
                      }}
                      className={`p-2 rounded-xl text-left font-bold transition border ${
                        cancelOrderReasonCode === r.code
                          ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-700 dark:text-rose-300'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-slate-500 block mb-1 font-bold">Açıklama / Not:</label>
                <input
                  type="text"
                  value={cancelOrderReasonText}
                  onChange={(e) => setCancelOrderReasonText(e.target.value)}
                  placeholder="Sipariş iptal açıklaması..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsCancelOrderModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelOrder}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'İptal Ediliyor...' : 'Siparişi İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hızlı Ödeme Yöntemi Seçim Modalı (Nakit / Kart + Otomatik Fiş) */}
      {isFastPayModalOpen && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center border border-amber-500/30">
                  <Zap className="w-5 h-5 fill-amber-500" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Hızlı Öde & Fiş Yazdır</h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    {activeTable ? activeTable.name : 'Hızlı Satış'} • Tahsilat Yöntemi Seçiniz
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFastPayModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ödenecek Tutar Özeti */}
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Tahsil Edilecek Tutar
              </span>
              <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                ₺{(existingOrder && cartItems.every(i => !!i.id) && existingOrder.remaining_total > 0
                  ? existingOrder.remaining_total
                  : grandTotal
                ).toFixed(2)}
              </span>
            </div>

            {/* Nakit mi Kart mı Seçim Butonları */}
            <div className="grid grid-cols-2 gap-3.5">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleFastPayment('cash')}
                className="p-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white shadow-lg shadow-emerald-600/25 transition flex flex-col items-center justify-center gap-2.5 cursor-pointer border border-emerald-400/30"
              >
                <Banknote className="w-9 h-9" />
                <div className="text-center">
                  <div className="font-black text-sm tracking-wide">NAKİT</div>
                  <div className="text-[10px] font-semibold text-emerald-100 mt-0.5">Nakit Öde & Fiş Yazdır</div>
                </div>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => handleFastPayment('credit_card')}
                className="p-5 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white shadow-lg shadow-blue-600/25 transition flex flex-col items-center justify-center gap-2.5 cursor-pointer border border-blue-400/30"
              >
                <CreditCard className="w-9 h-9" />
                <div className="text-center">
                  <div className="font-black text-sm tracking-wide">KREDİ KARTI</div>
                  <div className="text-[10px] font-semibold text-blue-100 mt-0.5">Kartla Öde & Fiş Yazdır</div>
                </div>
              </button>
            </div>

            {/* Otomatik Fiş Bilgilendirmesi */}
            <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100/80 dark:bg-slate-800/50 py-2 px-3 rounded-xl">
              <Printer className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>Ödeme alındığında Adisyo fişi otomatik olarak yazdırılır.</span>
            </div>

            <button
              type="button"
              onClick={() => setIsFastPayModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {/* Reçete (BOM) Stoğu Biten Ürün Uyarı Modalı */}
      {bomStockWarningModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border-2 border-brand-500 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-[#338d35] dark:text-emerald-400 flex items-center justify-center border border-brand-500/30 shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-brand-600 dark:text-emerald-400 leading-tight">
                    Reçetedeki Malzeme Stoğu Bitti!
                  </h3>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                    {bomStockWarningModal.productName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBomStockWarningModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase block">
                Stoğu Biten / Yetersiz Reçete Malzemeleri:
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {bomStockWarningModal.missingIngredients.map((ing, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-black text-xs sm:text-sm text-brand-700 dark:text-emerald-300">
                        {ing.ingredient_name}
                      </div>
                      <div className="text-[11px] font-semibold text-brand-600/80 dark:text-emerald-400/80">
                        Sipariş İçin Gerekli: <strong className="font-mono">{ing.required_amount} {ing.unit}</strong>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-block px-2.5 py-1 rounded-xl bg-[#338d35] text-white font-mono font-black text-xs">
                        Stok: {ing.current_stock} {ing.unit}
                      </span>
                      <div className="text-[10px] font-extrabold text-brand-600 dark:text-emerald-400 mt-0.5">
                        {ing.current_stock <= 0 ? 'STOK BİTTİ!' : 'YETERSİZ STOK!'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs font-semibold text-amber-900 dark:text-amber-200 leading-relaxed">
              Bu ürünün reçetesinde (BOM) bulunan yukarıdaki malzemenin stoğu tükenmiştir. Sipariş girebilmek için lütfen <strong>Stok / Envanter</strong> ekranından bu malzemenin stoğunu güncelleyin veya <strong>Tanımlamalar &gt; Ürün Reçetesi (BOM)</strong> ekranından malzemeyi reçeteden kaldırın.
            </div>

            <button
              type="button"
              onClick={() => setBomStockWarningModal(null)}
              className="w-full py-3 rounded-2xl bg-[#338d35] hover:bg-[#28702a] text-white font-black text-xs shadow-lg transition cursor-pointer"
            >
              Anlaşıldı
            </button>
          </div>
        </div>
      )}

      {/* Yazıcı Seçimi Modalı */}
      {isPrinterSelectModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
                  <Printer className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                    Yazıcı Seçimi
                  </h3>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                    {activeTable ? `Masa: ${activeTable.name}` : 'Adisyon'} • Toplam: <strong className="font-mono text-emerald-600 dark:text-emerald-400">₺{grandTotal.toFixed(2)}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPrinterSelectModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Prompt */}
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Adisyon fişinin yazdırılacağı yazıcıyı seçiniz:
            </div>

            {/* Printer Options List */}
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-0.5">
              {/* Option to Print to All if multiple printers */}
              {availablePrinters.length > 1 && (() => {
                const onlinePrinters = availablePrinters.filter(pr => getPrinterStatus(pr).isOnline);
                const isAllDisabled = onlinePrinters.length === 0;

                return (
                  <button
                    type="button"
                    disabled={isAllDisabled}
                    onClick={() => {
                      if (isAllDisabled) {
                        sound.warning();
                        showToast('Bağlantı kurulabilen aktif bir yazıcı bulunamadı.', 'error');
                        return;
                      }
                      executePrintBill(onlinePrinters);
                    }}
                    className={`w-full p-3.5 rounded-2xl border-2 text-left transition flex items-center justify-between group shadow-sm ${
                      isAllDisabled
                        ? 'bg-slate-100/70 dark:bg-slate-800/40 border-dashed border-rose-300 dark:border-rose-900/40 opacity-60 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border-emerald-500/60 hover:border-emerald-600 cursor-pointer active:scale-[0.99]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
                        isAllDisabled ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white'
                      }`}>
                        <Printer className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span>Tüm Seçili Yazıcılara Yazdır</span>
                          <span className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] text-white ${
                            isAllDisabled ? 'bg-rose-500' : 'bg-emerald-600'
                          }`}>
                            {onlinePrinters.length} / {availablePrinters.length} Bağlı
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold mt-0.5 flex items-center gap-1.5">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                            isAllDisabled ? 'bg-rose-500 animate-pulse shadow-sm shadow-rose-500/50' : 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                          }`}></span>
                          <span className={isAllDisabled ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-emerald-700 dark:text-emerald-400'}>
                            {isAllDisabled ? 'Hiçbir yazıcıya ulaşılamıyor (Bağlantı Yok)' : 'Fişi tüm aktif ve bağlı yazıcılara aynı anda gönderir'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-black shadow-sm transition shrink-0 ${
                      isAllDisabled
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                        : 'bg-emerald-600 text-white group-hover:bg-emerald-700'
                    }`}>
                      {isAllDisabled ? 'Yazdırılamaz' : 'Hepsine Yazdır'}
                    </span>
                  </button>
                );
              })()}

              {/* Individual Printers */}
              {availablePrinters.map((prKey, idx) => {
                const label = formatPrinterLabel(prKey);
                const status = getPrinterStatus(prKey);

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!status.isOnline}
                    onClick={() => {
                      if (!status.isOnline) {
                        sound.warning();
                        showToast(`"${label.name}" yazıcısına ulaşılamıyor: ${status.reason}`, 'error');
                        return;
                      }
                      executePrintBill([prKey]);
                    }}
                    className={`w-full p-3.5 rounded-2xl border text-left transition flex items-center justify-between group ${
                      status.isOnline
                        ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 active:scale-[0.99] cursor-pointer'
                        : 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50 opacity-70 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition ${
                        status.isOnline
                          ? 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 group-hover:text-emerald-600 group-hover:border-emerald-400'
                          : 'bg-rose-100 dark:bg-rose-900/50 border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-300'
                      }`}>
                        <Printer className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                          {label.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                            status.isOnline
                              ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                              : 'bg-rose-500 animate-pulse shadow-sm shadow-rose-500/50'
                          }`}></span>
                          <span className={`text-[10px] font-semibold ${
                            status.isOnline
                              ? 'text-emerald-700 dark:text-emerald-400 font-mono'
                              : 'text-rose-600 dark:text-rose-400 font-bold'
                          }`}>
                            {status.isOnline ? `${label.ip ? `IP: ${label.ip} • ` : ''}${status.reason}` : `Bağlantı Yok • ${status.reason}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-black transition shrink-0 ${
                      status.isOnline
                        ? 'bg-slate-200 dark:bg-slate-700 group-hover:bg-emerald-600 text-slate-700 dark:text-slate-200 group-hover:text-white'
                        : 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                    }`}>
                      {status.isOnline ? 'Yazdır' : 'Yazdırılamaz'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                Ayarlar &gt; Donanım &amp; Yazıcılar sekmesinden yönetilebilir.
              </span>
              <button
                type="button"
                onClick={() => setIsPrinterSelectModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Modifiers Modal */}
      {selectedProductForModal && (
        <ProductModifierModal
          isOpen={!!selectedProductForModal}
          onClose={() => setSelectedProductForModal(null)}
          product={selectedProductForModal}
          onAddToCart={handleAddModifiedItem}
        />
      )}

      {/* Masa Taşıma (Transfer) Modalı */}
      {isMoveTableModalOpen && activeTable && (
        <MoveTableModal
          isOpen={isMoveTableModalOpen}
          onClose={() => setIsMoveTableModalOpen(false)}
          areas={currentAreas}
          sourceTable={activeTable}
          sourceOrderTotal={existingOrder?.grand_total || grandTotal}
          operatorName={currentUser?.name || 'Garson'}
          onSuccess={handleTableMoveSuccess}
          onBeforeMove={async () => {
            const unsavedItems = cartItems.filter(i => !i.id);
            if (unsavedItems.length > 0) {
              const targetOrderId = activeOrderId || existingOrder?.id;
              if (targetOrderId) {
                await api.addItemsToOrder(targetOrderId, unsavedItems, currentUser?.name || 'Garson');
              } else {
                const res = await api.createOrder({
                  table_id: activeTable.id,
                  order_type: 'dine_in',
                  items: unsavedItems,
                  waiter_name: currentUser?.name || 'Garson',
                  notes: orderNote || null,
                  kuver_count: 0
                });
                if (res?.order_id) await loadOrder(res.order_id);
              }
            }
          }}
        />
      )}
    </div>
  );
};
