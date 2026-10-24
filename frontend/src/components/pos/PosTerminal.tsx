import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  ArrowLeft, Search, Trash2, Edit3, Printer, 
  Tag, Zap, RefreshCw, 
  ChevronUp, AlertCircle, FileText, 
  Utensils, DollarSign, X, CheckCircle2, CreditCard, Banknote, Scale 
} from 'lucide-react';
import { Category, Product, OrderItem, Table, Order, StaffUser } from '../../types';
import { sound } from '../../services/sound';
import { api } from '../../services/api';
import { localHardware } from '../../services/localHardware';
import { useWebSocket } from '../../services/websocket';
import { ProductModifierModal } from './ProductModifierModal';

interface PosTerminalProps {
  categories: Category[];
  activeTable: Table | null;
  onBackToTables: () => void;
  currentUser: StaffUser | null;
  onOpenCheckout: (orderId: number, table: Table | null) => void;
  onOpenFiscalModal: (orderId: number) => void;
  onRefreshData: () => void;
}

export const PosTerminal: React.FC<PosTerminalProps> = ({
  categories,
  activeTable,
  onBackToTables,
  currentUser,
  onOpenCheckout,
  onOpenFiscalModal,
  onRefreshData
}) => {
  const [activeCategoryId, setActiveCategoryId] = useState<number>(categories[0]?.id || 1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[] | null>(null);

  useEffect(() => {
    if (categories.length > 0 && !categories.some(c => c.id === activeCategoryId)) {
      setActiveCategoryId(categories[0].id);
    }
  }, [categories]);

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

  // Load existing order
  useEffect(() => {
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

  // Filter products
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const q = searchQuery.toLowerCase().trim();
    const allProducts = categories.flatMap(c => c.products);
    const matched = allProducts.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.plu_code && p.plu_code.toLowerCase().includes(q))
    );
    setSearchResults(matched);
  }, [searchQuery, categories]);

  const currentCategory = categories.find(c => c.id === activeCategoryId) || categories[0];
  const displayedProducts = searchResults !== null ? searchResults : (currentCategory?.products || []);

  // Helper to count quantity of product in cart
  const getProductQuantityInCart = (productId: number) => {
    const total = cartItems
      .filter(i => i.product_id === productId && !i.is_voided)
      .reduce((sum, i) => sum + Number(i.quantity), 0);
    return Number(total.toFixed(3));
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
        is_hold: false
      };
      setCartItems(prev => [...prev, newItem]);
    }
    setWeightModalProduct(null);
  };

  const handleProductClick = (product: Product) => {
    if (product.is_available === false) {
      sound.warning();
      showToast(`"${product.name}" şu anda satışa kapalıdır (Pasif).`, 'error');
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
        is_hold: false
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
      // Saved item: trigger void modal
      const savedItem = cartItems.find(i => i.id && i.product_id === productId);
      if (savedItem) {
        sound.beep();
        setSelectedItemForVoid(savedItem);
        setIsVoidModalOpen(true);
      }
    }
  };

  const handleAddModifiedItem = (item: OrderItem) => {
    sound.beep();
    setCartItems(prev => [...prev, item]);
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
        currentUser?.name || 'Müdür',
        voidManagerPin
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

  const handleSaveOrSendOrder = async () => {
    const unsavedItems = cartItems.filter(i => !i.id);
    if (unsavedItems.length === 0 && activeOrderId) {
      onBackToTables();
      return;
    }
    setLoading(true);
    try {
      if (activeOrderId) {
        await api.addItemsToOrder(activeOrderId, unsavedItems, currentUser?.name || 'MEHMETABİ');
        if (orderNote) {
          await api.updateOrderNotes(activeOrderId, orderNote);
        }
        sound.kitchenBell();
        await loadOrder(activeOrderId);
      } else {
        const payload = {
          table_id: activeTable?.id || null,
          order_type: activeTable ? 'dine_in' : 'takeaway',
          items: unsavedItems,
          waiter_name: currentUser?.name || 'MEHMETABİ',
          notes: orderNote || null,
          kuver_count: 0
        };
        const res = await api.createOrder(payload);
        sound.kitchenBell();
        if (res.order_id) {
          await loadOrder(res.order_id);
        }
      }
      onRefreshData();
      onBackToTables();
    } catch (err: any) {
      showToast(err.message || 'Sipariş kaydedilemedi.', 'error');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleFastPayment = async (method: 'cash' | 'credit_card') => {
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
        onOpenFiscalModal(targetOrderId);
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
        treatManagerPin || '9999'
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
            : 'bg-rose-600/95 text-white border border-rose-500'
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
            <div className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
              {activeTable ? activeTable.name : 'Hızlı Satış'}
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
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            🍽️ Ürünler
          </button>
          <button
            onClick={() => { sound.beep(); setMobilePosView('cart'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer ${
              mobilePosView === 'cart'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <span>🧾 Adisyon</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              mobilePosView === 'cart' ? 'bg-white/20 text-white' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
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
            <h2 className="font-extrabold text-base text-slate-900 dark:text-white">
              {activeTable ? activeTable.name : 'Hızlı Satış'}
            </h2>
          </div>

          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsNoteModalOpen(true)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/50"
              title="Not Ekle"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setIsDiscountModalOpen(true)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/50"
              title="İndirim / İkram"
            >
              <DollarSign className="w-4 h-4" />
            </button>
            <button 
              onClick={() => {
                if (confirm('Adisyondaki kaydedilmemiş ürünleri temizlemek istiyor musunuz?')) {
                  sound.warning();
                  setCartItems(prev => prev.filter(i => !!i.id));
                }
              }}
              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-200/50"
              title="Temizle"
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
          <span className="font-bold text-emerald-600 dark:text-emerald-400">
            {activeOrderId ? 'Açık Hesap' : 'Yeni Sipariş'}
          </span>
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
                    ? 'opacity-40 line-through bg-red-50/50 dark:bg-red-950/20' 
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
                    <div className="text-[10px] text-red-500 pl-4 space-y-0.5 mt-0.5">
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
                </div>

                <div className="flex flex-col items-end justify-between self-stretch">
                  <span className="font-mono text-xs font-black text-slate-900 dark:text-white">
                    ₺{item.total_price.toFixed(2)}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isSaved) {
                        setCartItems(prev => prev.filter((_, i) => i !== idx));
                      } else {
                        sound.beep();
                        setSelectedItemForVoid(item);
                        setIsVoidModalOpen(true);
                      }
                    }}
                    className="text-slate-300 hover:text-red-500 p-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {cartItems.length === 0 && (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-xs text-center p-4 gap-2">
              <span>Henüz ürün eklenmedi.</span>
              <button
                onClick={() => setMobilePosView('menu')}
                className="lg:hidden px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold text-xs"
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
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>Uygulanan İndirim:</span>
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
            </div>
          )}

          {/* Top Total Row (Clickable to expand breakdown) */}
          <div 
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="flex items-center justify-between text-xs font-bold px-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1.5 rounded-lg transition"
            title="Hesap dökümünü göster/gizle"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600 dark:text-slate-400">Toplam Tutar</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-slate-950 dark:text-white font-mono">
                ₺{grandTotal.toFixed(2)}
              </span>
              <ChevronUp className={`w-4 h-4 text-slate-400 transition-transform ${showBreakdown ? 'rotate-180 text-red-600' : ''}`} />
            </div>
          </div>

          {/* 3 Buttons Grid */}
          <div className="grid grid-cols-12 gap-1.5 pt-1">
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
              className="col-span-5 py-3 px-2 rounded-xl bg-[#27ae60] hover:bg-[#219653] disabled:opacity-50 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">
                ÖDE ₺{(existingOrder && cartItems.filter(i => !i.id).length === 0 ? existingOrder.remaining_total : grandTotal).toFixed(2)}
              </span>
            </button>

            <button
              onClick={() => {
                sound.beep();
                setIsFastPayModalOpen(true);
              }}
              disabled={loading || (cartItems.length === 0 && !existingOrder)}
              className="col-span-4 py-3 px-1.5 rounded-xl bg-[#fff9db] dark:bg-amber-950/40 border border-[#f59f00]/40 text-[#d97706] hover:bg-[#ffec99] disabled:opacity-50 font-black text-[11px] transition flex items-center justify-center gap-1 truncate cursor-pointer"
            >
              <Zap className="w-3 h-3 flex-shrink-0 text-amber-500 fill-amber-500" />
              <span>HIZLI ÖDE</span>
            </button>

            <button
              onClick={handleSaveOrSendOrder}
              disabled={loading || cartItems.length === 0}
              className="col-span-3 py-3 px-1.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] disabled:opacity-50 text-white font-black text-xs shadow transition flex items-center justify-center cursor-pointer"
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
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 sm:py-2 text-xs md:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Action Toolbar Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Note Button 📄 */}
            <button
              onClick={() => setIsNoteModalOpen(true)}
              className="p-2 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
              title="Adisyon Notu"
            >
              <FileText className="w-4 h-4" />
            </button>

            {/* Treat Button 🍽️ */}
            <button
              onClick={() => { sound.beep(); setIsTreatModalOpen(true); }}
              className="p-2 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
              title="İkram Uygula"
            >
              <Utensils className="w-4 h-4" />
            </button>

            {/* Discount Button 💵 */}
            <button
              onClick={() => setIsDiscountModalOpen(true)}
              className="p-2 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
              title="İndirim Uygula"
            >
              <DollarSign className="w-4 h-4" />
            </button>

            {/* Undo / Refresh Button ↻ */}
            <button
              onClick={() => {
                sound.beep();
                setSearchQuery('');
                setSearchResults(null);
              }}
              className="p-2 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
              title="Yenile"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2-Row Horizontal Category Grid */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2 sm:p-3 overflow-x-auto shrink-0">
          <div className="flex flex-nowrap sm:flex-wrap gap-1.5 sm:max-h-24 overflow-x-auto sm:overflow-y-auto no-scrollbar">
            {categories.map((cat) => {
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
                      ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white border-b-2 border-red-600'
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
                className={`h-24 sm:h-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between cursor-pointer pos-touch-card shadow-sm hover:shadow-md transition relative group overflow-hidden ${
                  isPassive ? 'opacity-50 grayscale' : ''
                }`}
              >
                <div className={qty > 0 ? 'pr-8' : 'pr-2'}>
                  <h4 className="font-extrabold text-xs md:text-sm text-slate-900 dark:text-white uppercase tracking-tight leading-snug group-hover:text-red-600 transition line-clamp-2">
                    {p.name}
                  </h4>
                </div>

                <div className={`flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 ${qty > 0 ? 'pr-8' : ''}`}>
                  <span className="font-mono text-xs font-black text-slate-900 dark:text-white">
                    ₺{p.base_price.toFixed(2)}{isWeight ? '/Kg' : ''}
                  </span>
                  {isPassive ? (
                    <span className="text-[9px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded">
                      Pasif
                    </span>
                  ) : p.stock_quantity !== undefined && p.stock_quantity !== null ? (
                    <span className={p.stock_quantity <= 0 ? 'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded truncate text-rose-600 bg-rose-50 dark:bg-rose-950/50' : 'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded truncate text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50'}>
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
                    className="absolute right-0 top-0 bottom-0 w-9 bg-[#c0392b] text-white flex flex-col items-center justify-between py-1 z-10 shadow-lg rounded-r-2xl animate-fadeIn"
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
        </div>

        {/* Sticky Mobile Bottom Cart Summary Bar in Menu View (< lg) */}
        {(cartItems.length > 0 || existingOrder) && (
          <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 flex items-center gap-2 shadow-2xl shrink-0">
            <button
              onClick={() => { sound.beep(); setMobilePosView('cart'); }}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-between"
            >
              <span>🧾 Adisyon ({activeCartCount})</span>
              <span className="font-mono font-black text-emerald-400">₺{grandTotal.toFixed(2)}</span>
            </button>
            <button
              onClick={() => { sound.beep(); setIsFastPayModalOpen(true); }}
              disabled={loading}
              className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs flex items-center gap-1 shrink-0"
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              <span>Hızlı Öde</span>
            </button>
            <button
              onClick={handleSaveOrSendOrder}
              disabled={loading || cartItems.length === 0}
              className="py-2.5 px-3.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] disabled:opacity-50 text-white font-black text-xs shrink-0"
            >
              Kaydet
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
                    ? 'border-red-600 bg-red-50/40 dark:bg-red-950/20'
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
                    ? 'border-red-600 bg-red-50/40 dark:bg-red-950/20'
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
                          ? 'bg-red-600 text-white border-red-600 shadow-sm'
                          : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="font-extrabold text-xs leading-tight">{preset.label}</div>
                      <div className={`text-[9px] font-mono ${isSelected ? 'text-red-100' : 'text-slate-400'}`}>
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
                      ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/60'
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
                className="flex-1 py-3 px-4 rounded-2xl bg-[#c0392b] hover:bg-[#a93226] text-white font-black text-xs shadow-lg transition cursor-pointer"
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
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs transition"
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
                    className="p-2.5 bg-slate-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 hover:border-red-400 rounded-xl text-left transition flex items-center justify-between gap-1"
                  >
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{d.name}</span>
                    <span className="font-mono font-black text-red-600 text-xs shrink-0">
                      {d.type === 'fixed' ? `₺${d.value}` : `%${d.value}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Discount Input */}
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

            {/* Manager PIN Verification */}
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

            {/* Itemized Selection if existing order has saved items */}
            {existingOrder && existingOrder.items && existingOrder.items.length > 0 && (
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
              <button
                onClick={() => handleApplyTreatSubmit(true)}
                disabled={loading}
                className="py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>TÜM ADİSYON İKRAM</span>
              </button>
              <button
                onClick={() => handleApplyTreatSubmit(false)}
                disabled={loading || treatSelectedItems.length === 0}
                className="py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>SEÇİLENLERİ İKRAM ET ({treatSelectedItems.length})</span>
              </button>
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
                <h3 className="text-base font-black text-red-600 dark:text-red-400">Ürün İptal & İade</h3>
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
                          ? 'bg-red-50 dark:bg-red-950/60 border-red-500 text-red-600 dark:text-red-300'
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
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs shadow-md transition disabled:opacity-50"
              >
                {loading ? 'İptal Ediliyor...' : 'İptali Onayla'}
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

      {/* Product Modifiers Modal */}
      {selectedProductForModal && (
        <ProductModifierModal
          isOpen={!!selectedProductForModal}
          onClose={() => setSelectedProductForModal(null)}
          product={selectedProductForModal}
          onAddToCart={handleAddModifiedItem}
        />
      )}
    </div>
  );
};
