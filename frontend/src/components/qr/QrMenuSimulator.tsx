import React, { useState, useEffect, useMemo } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { 
  QrCode, Bell, Receipt, ShoppingCart, 
  Plus, Minus, Trash2, Scale, CreditCard, Printer, X,
  Copy, ExternalLink, Check, Globe, Sun, Moon, Ruler, Settings, ChevronDown, ChevronUp
} from 'lucide-react';
import { Area } from '../../types';
import { api, getResolvedRestaurantCode } from '../../services/api';
import { sound } from '../../services/sound';
import { QrCodeSvg, buildTableQrMenuUrl, slugifyQrPart } from '../../utils/qrCodeGenerator';
import {
  decrementProductPortion,
  getAllProductExtraMeta,
} from '../../services/competitorFeatures';
import { useWebSocket } from '../../services/websocket';

interface QrMenuSimulatorProps {
  areas: Area[];
  onBuzzerSent: () => void;
  customerOnlyMode?: boolean;
  initialTableId?: number;
  initialAreaSlug?: string;
  initialTableSlug?: string;
  initialRestaurantSlug?: string;
  restaurantName?: string;
}

export const QrMenuSimulator: React.FC<QrMenuSimulatorProps> = ({
  areas,
  onBuzzerSent,
  customerOnlyMode = false,
  initialTableId,
  initialAreaSlug,
  initialTableSlug,
  initialRestaurantSlug,
  restaurantName,
}) => {
  const [localAreas, setLocalAreas] = useState<Area[]>([]);
  const effectiveAreas = useMemo(
    () => (areas && areas.length > 0 ? areas : localAreas),
    [areas, localAreas]
  );
  const tableEntries = useMemo(
    () =>
      (effectiveAreas || []).flatMap((a) =>
        ((a && a.tables) || [])
          .filter(Boolean)
          .map((table) => ({
            areaId: a.id,
            areaName: a.name || 'Salon',
            table,
          }))
      ),
    [effectiveAreas]
  );
  const allTables = useMemo(() => tableEntries.map((e) => e.table), [tableEntries]);

  const [selectedTableId, setSelectedTableId] = useState<number>(initialTableId || allTables[0]?.id || 0);
  const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const [customDomain, setCustomDomain] = useState<string>(defaultOrigin);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [qrTheme, setQrTheme] = useState<'light' | 'dark'>('light');
  const [qrSizeCm, setQrSizeCm] = useState<number>(6);
  const [printAreaFilter, setPrintAreaFilter] = useState<string>('all');
  const [selectedPrintTableIds, setSelectedPrintTableIds] = useState<number[]>([]);
  const [printTargetMode, setPrintTargetMode] = useState<'single' | 'bulk'>('single');
  const [menuData, setMenuData] = useState<any>(null);
  const [splitMode, setSplitMode] = useState<'full' | 'equal' | 'items'>('full');
  const [splitPeopleCount, setSplitPeopleCount] = useState<number>(2);
  const [selectedSplitKeys, setSelectedSplitKeys] = useState<Record<number, boolean>>({});
  const [tipPercent, setTipPercent] = useState<number>(10);
  const [productMetaMap, setProductMetaMap] = useState(() => getAllProductExtraMeta());
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number>(0);
  const [customerCart, setCustomerCart] = useState<any[]>([]);
  const [isCartExpanded, setIsCartExpanded] = useState<boolean>(true);
  const [customerOrderNote, setCustomerOrderNote] = useState<string>('');
  const [isOrderNoteModalOpen, setIsOrderNoteModalOpen] = useState<boolean>(false);
  const [qrAllowTablePayment, setQrAllowTablePayment] = useState<boolean>(true);
  const [qrAllowedCategoryIds, setQrAllowedCategoryIds] = useState<number[] | null>(null);
  const [savingQrSettings, setSavingQrSettings] = useState<boolean>(false);
  const [weightModalProduct, setWeightModalProduct] = useState<any | null>(null);
  const [weightGramInput, setWeightGramInput] = useState<string>('250');
  const [weightKgInput, setWeightKgInput] = useState<string>('0.25');
  const [notice, setNotice] = useState<{ message: string; isError?: boolean } | null>(null);

  const showNotice = (message: string, isError = false) => {
    setNotice({ message, isError });
    setTimeout(() => setNotice(null), 4000);
  };
  const [isVirtualPosOpen, setIsVirtualPosOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // Fetch public areas/tables when opening QR menu directly without authenticated App areas
  useEffect(() => {
    if ((!areas || areas.length === 0) && localAreas.length === 0) {
      api
        .getAreas()
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setLocalAreas(data);
          }
        })
        .catch(() => null);
    }
  }, [areas?.length, localAreas.length]);

  useEffect(() => {
    if (initialTableId && initialTableId > 0) {
      setSelectedTableId(initialTableId);
      return;
    }
    if (tableEntries.length === 0) return;

    if (initialTableSlug || initialAreaSlug) {
      const targetAreaSlug = initialAreaSlug ? slugifyQrPart(initialAreaSlug, '') : '';
      const targetTableSlug = initialTableSlug ? slugifyQrPart(initialTableSlug, '') : '';
      const exactMatch = tableEntries.find(
        (e) =>
          (!targetAreaSlug || slugifyQrPart(e.areaName, '') === targetAreaSlug) &&
          (!targetTableSlug || slugifyQrPart(e.table.name, '') === targetTableSlug)
      );
      if (exactMatch) {
        setSelectedTableId(exactMatch.table.id);
        return;
      }
      if (targetTableSlug) {
        const tableOnlyMatch = tableEntries.find((e) => slugifyQrPart(e.table.name, '') === targetTableSlug);
        if (tableOnlyMatch) {
          setSelectedTableId(tableOnlyMatch.table.id);
          return;
        }
      }
    }

    if (!allTables.some((t) => t.id === selectedTableId)) {
      setSelectedTableId(allTables[0].id);
    }
  }, [initialTableId, initialAreaSlug, initialTableSlug, tableEntries]);

  useEffect(() => {
    if (allTables.length > 0 && selectedPrintTableIds.length === 0) {
      setSelectedPrintTableIds(allTables.slice(0, 12).map((t) => t.id));
    }
  }, [allTables.length]);

  useEffect(() => {
    if (selectedTableId > 0 && (initialTableId || allTables.some((t) => t.id === selectedTableId))) {
      loadTableQrMenu(selectedTableId);
    }
  }, [selectedTableId, initialTableId, allTables.length]);

  useWebSocket('all', (type) => {
    if (
      type === 'MENU_UPDATED' ||
      type === 'QR_SETTINGS_UPDATED' ||
      type === 'ORDER_CREATED' ||
      type === 'ORDER_UPDATED' ||
      type === 'ORDER_PAID' ||
      type === 'OUT_OF_STOCK_ORDER_ALERT' ||
      type === 'STOCK_APPROVAL_RESOLVED'
    ) {
      if (selectedTableId) {
        loadTableQrMenu(selectedTableId);
      }
    }
  });

  const loadTableQrMenu = async (tableId: number) => {
    try {
      const data = await api.getQrMenu(tableId);
      if (data?.status === 'error' || data?.detail || data?.error) {
        showNotice(data.detail || data.error || 'Menü yüklenemedi.', true);
      } else {
        setNotice(null);
        if (data?.qr_settings) {
          if (typeof data.qr_settings.allow_table_payment === 'boolean') {
            setQrAllowTablePayment(data.qr_settings.allow_table_payment);
          }
          if (data.qr_settings.has_custom_categories && Array.isArray(data.qr_settings.allowed_category_ids)) {
            setQrAllowedCategoryIds(data.qr_settings.allowed_category_ids.map(Number));
          } else {
            setQrAllowedCategoryIds(null);
          }
        }
        if (Array.isArray(data?.menu) && data.menu.length > 0) {
          const curCat = data.menu[activeCategoryIndex];
          if (!curCat || !Array.isArray(curCat.products) || curCat.products.length === 0) {
            const firstNonEmpty = data.menu.findIndex((c: any) => Array.isArray(c.products) && c.products.length > 0);
            if (firstNonEmpty >= 0) {
              setActiveCategoryIndex(firstNonEmpty);
            }
          }
        }
      }
      setMenuData(data);
    } catch (e: any) {
      console.warn('Failed to load QR menu', e);
      showNotice(e?.message || 'Menü yüklenemedi.', true);
    }
  };

  const isWeightProduct = (product: any): boolean => {
    if (!product) return false;
    const u = String(product.unit || '').trim().toUpperCase();
    if (u === 'KG' || u === 'GR' || u === 'GRAM' || u === 'KİLO' || u === 'KILO' || Boolean(product.is_weight)) {
      return true;
    }
    return /\bKG\b|\(KG\)|\/KG|KİLO/i.test(String(product.name || ''));
  };

  const productByIdMap = useMemo(() => {
    const map: Record<number, any> = {};
    if (Array.isArray(menuData?.menu)) {
      for (const cat of menuData.menu) {
        for (const p of cat?.products || []) {
          if (p && p.id) map[Number(p.id)] = p;
        }
      }
    }
    return map;
  }, [menuData]);

  const isProductOutOfStock = (product: any, requestedQty: number = 1): boolean => {
    if (!product) return false;
    if (product.is_available === false) return true;
    const rem86 = productMetaMap[product.id]?.remainingPortions;
    if (rem86 !== null && rem86 !== undefined && Number(rem86) + 1e-9 < requestedQty) {
      return true;
    }
    const tracked = Boolean(
      product.has_stock_tracking ||
        product.has_recipe ||
        (product.stock_quantity !== undefined && product.stock_quantity !== null)
    );
    if (tracked && Number(product.stock_quantity ?? 0) + 1e-9 < requestedQty) {
      return true;
    }
    return false;
  };

  const formatCartItemQty = (item: any): string => {
    const qty = Number(item?.quantity || 0);
    if (isWeightProduct(item) || !Number.isInteger(qty)) {
      const cleanKg = Number(qty.toFixed(3));
      const grams = Math.round(cleanKg * 1000);
      return `${grams} gr (${cleanKg} Kg)`;
    }
    return `${qty} Adet`;
  };

  const openWeightModal = (product: any) => {
    const existing = customerCart.find((i) => i.product_id === product.id);
    if (existing && Number(existing.quantity) > 0) {
      const cleanKg = Number(Number(existing.quantity).toFixed(3));
      setWeightKgInput(String(cleanKg));
      setWeightGramInput(String(Math.round(cleanKg * 1000)));
    } else {
      setWeightKgInput('0.25');
      setWeightGramInput('250');
    }
    setWeightModalProduct(product);
  };

  const handleWeightGramChange = (rawVal: string) => {
    const cleaned = rawVal.replace(/[^0-9.]/g, '');
    setWeightGramInput(cleaned);
    const gr = parseFloat(cleaned);
    if (!isNaN(gr) && gr >= 0) {
      setWeightKgInput(String(Number((gr / 1000).toFixed(3))));
    } else {
      setWeightKgInput('');
    }
  };

  const handleWeightKgChange = (rawVal: string) => {
    const cleaned = rawVal.replace(',', '.').replace(/[^0-9.]/g, '');
    setWeightKgInput(cleaned);
    const kg = parseFloat(cleaned);
    if (!isNaN(kg) && kg >= 0) {
      setWeightGramInput(String(Math.round(kg * 1000)));
    } else {
      setWeightGramInput('');
    }
  };

  const handleConfirmWeightProduct = () => {
    if (!weightModalProduct) return;
    const parsedKg = parseFloat(String(weightKgInput).replace(',', '.'));
    const parsedGr = parseFloat(String(weightGramInput).replace(',', '.'));
    const kgVal = Number((!isNaN(parsedKg) && parsedKg > 0 ? parsedKg : !isNaN(parsedGr) && parsedGr > 0 ? parsedGr / 1000 : 0).toFixed(3));
    if (!kgVal || kgVal <= 0) {
      sound.warning();
      showNotice('Lütfen geçerli bir gramaj girin.', true);
      return;
    }
    if (isProductOutOfStock(weightModalProduct, kgVal) && !weightModalProduct.allow_negative_stock) {
      sound.warning();
      showNotice(`Efendim maalesef ${weightModalProduct.name} elimizde kalmadı.`, true);
      setWeightModalProduct(null);
      return;
    }
    sound.beep();
    setCustomerCart((prev) => {
      const existing = prev.find((item) => item.product_id === weightModalProduct.id);
      if (existing) {
        return prev.map((item) =>
          item.product_id === weightModalProduct.id
            ? { ...item, quantity: kgVal, unit: weightModalProduct.unit || 'Kg', is_weight: true }
            : item
        );
      }
      return [
        ...prev,
        {
          product_id: weightModalProduct.id,
          name: weightModalProduct.name,
          price: weightModalProduct.base_price,
          quantity: kgVal,
          unit: weightModalProduct.unit || 'Kg',
          is_weight: true,
          selected_modifiers: [],
          negative_modifiers: [],
        },
      ];
    });
    setIsCartExpanded(true);
    showNotice(`${weightModalProduct.name} (${Math.round(kgVal * 1000)} gr) sepete eklendi.`, false);
    setWeightModalProduct(null);
  };

  const handleRemoveFromCart = (productId: number) => {
    sound.beep();
    setCustomerCart((prev) => prev.filter((item) => item.product_id !== productId));
  };

  const handleChangeCartQty = (productId: number, delta: number) => {
    if (delta > 0) {
      const prod = productByIdMap[productId];
      const curItem = customerCart.find((i) => i.product_id === productId);
      const nextQty = Number(curItem?.quantity || 0) + delta;
      if (prod && isProductOutOfStock(prod, nextQty) && !prod.allow_negative_stock) {
        sound.warning();
        showNotice(`Efendim maalesef ${prod.name} elimizde kalmadı.`, true);
        return;
      }
    }
    sound.beep();
    setCustomerCart((prev) =>
      prev
        .map((item) => {
          if (item.product_id !== productId) return item;
          const nextQty = Number(item.quantity || 0) + delta;
          if (nextQty <= 0) return null;
          return { ...item, quantity: nextQty };
        })
        .filter(Boolean) as any[]
    );
  };

  const handleClearCustomerCart = () => {
    sound.beep();
    setCustomerCart([]);
  };

  const handleAddToCart = (product: any) => {
    const weighted = isWeightProduct(product);
    const inCartQty = customerCart
      .filter((i: any) => i.product?.id === product.id || i.product_id === product.id || i.id === product.id)
      .reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);
    const checkQty = weighted ? 0.001 : inCartQty + 1;
    if (isProductOutOfStock(product, checkQty) && !product.allow_negative_stock) {
      sound.warning();
      showNotice(`Efendim maalesef ${product.name} elimizde kalmadı.`, true);
      return;
    }
    sound.beep();
    if (weighted) {
      openWeightModal(product);
      return;
    }
    setCustomerCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        return prev.map(item => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        price: product.base_price,
        quantity: 1,
        unit: product.unit || 'Adet',
        is_weight: false,
        selected_modifiers: [],
        negative_modifiers: []
      }];
    });
  };

  const handleSendOrderFromPhone = async (noteOverride?: string) => {
    if (customerCart.length === 0) return;
    for (const it of customerCart) {
      const prod = productByIdMap[it.product_id];
      if (prod && isProductOutOfStock(prod, Number(it.quantity || 1)) && !prod.allow_negative_stock) {
        sound.warning();
        showNotice(`Efendim maalesef ${prod.name} elimizde kalmadı.`, true);
        return;
      }
    }
    setLoading(true);
    sound.beep();
    try {
      const noteText = (noteOverride !== undefined ? noteOverride : customerOrderNote).trim();
      const formattedItems = customerCart.map(i => ({
        product_id: i.product_id,
        unit_price: i.price,
        quantity: i.quantity,
        selected_modifiers: [],
        negative_modifiers: [],
        kitchen_note: noteText || 'Masadan QR Sipariş'
      }));

      const orderRes = await api.placeCustomerTableOrder(selectedTableId, formattedItems, noteText || undefined);
      if (orderRes?.status === 'error' || orderRes?.detail || orderRes?.error) {
        throw new Error(orderRes.detail || orderRes.error || 'Sipariş gönderilemedi.');
      }
      customerCart.forEach((it: any) => {
        const pid = it.product?.id || it.product_id || it.id;
        if (pid) decrementProductPortion(pid, Number(it.quantity || 1));
      });
      setProductMetaMap(getAllProductExtraMeta());
      sound.kitchenBell();
      setCustomerCart([]);
      setCustomerOrderNote('');
      setIsOrderNoteModalOpen(false);
      if (orderRes?.pending_stock_approval) {
        showNotice('Siparişiniz alındı! Stokta olmayan ürünler için mutfak ve garsona onay bildirimi gönderildi.', false);
      } else {
        showNotice(
          noteText
            ? 'Siparişiniz ve müşteri notunuz mutfağa iletildi! Afiyet olsun.'
            : 'Siparişiniz mutfağa iletildi! Afiyet olsun.',
          false
        );
      }
      await loadTableQrMenu(selectedTableId);
    } catch (err: any) {
      showNotice(err.message || 'Sipariş gönderilemedi.', true);
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleCallWaiter = async (reason: string = 'Garson Çağır') => {
    sound.waiterBuzzer();
    try {
      await api.triggerWaiterCall(selectedTableId, reason);
      onBuzzerSent();
      showNotice(`${reason} talebiniz garson ekranına iletildi!`, false);
    } catch (e: any) {
      sound.warning();
      showNotice(e?.message || 'Talep gönderilemedi, lütfen tekrar deneyin.', true);
    }
  };

  const handleVirtualPosPayment = async () => {
    if (!qrAllowTablePayment) {
      sound.warning();
      showNotice('Masadan müşteri ödemesi kapalıdır. Lütfen garson veya kasadan ödeme yapın.', true);
      return;
    }
    for (const it of customerCart) {
      const prod = productByIdMap[it.product_id];
      if (prod && isProductOutOfStock(prod, Number(it.quantity || 1)) && !prod.allow_negative_stock) {
        sound.warning();
        setIsVirtualPosOpen(false);
        showNotice(`Efendim maalesef ${prod.name} elimizde kalmadı.`, true);
        return;
      }
    }
    sound.beep();
    setLoading(true);
    try {
      let targetOrderId = menuData?.active_order?.order_id;
      if (customerCart.length > 0) {
        const noteText = customerOrderNote.trim();
        const formattedItems = customerCart.map(i => ({
          product_id: i.product_id,
          unit_price: i.price,
          quantity: i.quantity,
          selected_modifiers: [],
          negative_modifiers: [],
          kitchen_note: noteText || 'Masadan QR Sipariş'
        }));
        const orderRes = await api.placeCustomerTableOrder(selectedTableId, formattedItems, noteText || undefined);
        if (orderRes?.status === 'error' || orderRes?.detail || orderRes?.error) {
          throw new Error(orderRes.detail || orderRes.error || 'Sipariş oluşturulamadı.');
        }
        customerCart.forEach((it: any) => {
          const pid = it.product?.id || it.product_id || it.id;
          if (pid) decrementProductPortion(pid, Number(it.quantity || 1));
        });
        setProductMetaMap(getAllProductExtraMeta());
        targetOrderId = orderRes.order_id;
        setCustomerCart([]);
        setCustomerOrderNote('');
      }

      if (targetOrderId) {
        const splitLabel =
          splitMode === 'items'
            ? 'Alman Usulü'
            : splitMode === 'equal'
              ? `1/${splitPeopleCount} Bölüş`
              : 'Tam Hesap';
        const tipPart = qrTipAmount > 0 ? ` + ₺${qrTipAmount.toFixed(2)} Bahşiş` : '';
        await handleCallWaiter(`Masada Ödeme / POS Talebi (${splitLabel} · ₺${qrPayableFinal.toFixed(2)}${tipPart})`);
        setSelectedSplitKeys({});
        setIsVirtualPosOpen(false);
        await loadTableQrMenu(selectedTableId);
      } else {
        showNotice('Ödenecek aktif sipariş bulunamadı.', true);
      }
    } catch (err: any) {
      showNotice(err.message || 'Ödeme talebi gönderilemedi.', true);
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const allQrCategories = useMemo(() => {
    if (Array.isArray(menuData?.all_categories) && menuData.all_categories.length > 0) {
      return menuData.all_categories;
    }
    return Array.isArray(menuData?.menu) ? menuData.menu : [];
  }, [menuData]);

  const isCategorySelectedForQr = (catId: number): boolean => {
    if (qrAllowedCategoryIds === null) return true;
    return qrAllowedCategoryIds.includes(Number(catId));
  };

  const persistQrSettings = async (nextAllowPay: boolean, nextCatIds: number[] | null) => {
    setSavingQrSettings(true);
    try {
      const res = await api.updateQrMenuSettings({
        allow_table_payment: nextAllowPay,
        allowed_category_ids: nextCatIds,
      });
      if (typeof res?.allow_table_payment === 'boolean') {
        setQrAllowTablePayment(res.allow_table_payment);
      }
      if (res?.has_custom_categories && Array.isArray(res?.allowed_category_ids)) {
        setQrAllowedCategoryIds(res.allowed_category_ids.map(Number));
      } else if (res?.has_custom_categories === false) {
        setQrAllowedCategoryIds(null);
      }
      if (selectedTableId > 0) {
        await loadTableQrMenu(selectedTableId);
      }
    } catch (e: any) {
      sound.warning();
      showNotice(e?.message || 'QR menü ayarları kaydedilemedi.', true);
    } finally {
      setSavingQrSettings(false);
    }
  };

  const handleToggleQrAllowPayment = async (nextVal: boolean) => {
    sound.beep();
    setQrAllowTablePayment(nextVal);
    await persistQrSettings(nextVal, qrAllowedCategoryIds);
    showNotice(nextVal ? 'Masadan müşteri ödemesi açıldı.' : 'Masadan müşteri ödemesi kapatıldı.', false);
  };

  const handleToggleQrCategory = async (catId: number) => {
    sound.beep();
    const numericId = Number(catId);
    const currentIds =
      qrAllowedCategoryIds === null
        ? allQrCategories.map((c: any) => Number(c.id))
        : qrAllowedCategoryIds;
    const nextIds = currentIds.includes(numericId)
      ? currentIds.filter((id) => id !== numericId)
      : [...currentIds, numericId];
    setQrAllowedCategoryIds(nextIds);
    await persistQrSettings(qrAllowTablePayment, nextIds);
  };

  const handleSelectAllQrCategories = async () => {
    sound.beep();
    setQrAllowedCategoryIds(null);
    await persistQrSettings(qrAllowTablePayment, null);
    showNotice('Tüm ürün kategorileri QR menüde açıldı.', false);
  };

  const handleClearAllQrCategories = async () => {
    sound.beep();
    setQrAllowedCategoryIds([]);
    await persistQrSettings(qrAllowTablePayment, []);
    showNotice('QR menüdeki tüm kategoriler gizlendi.', false);
  };

  const orderableMenuTree = useMemo(() => {
    if (!Array.isArray(menuData?.menu)) return [];
    return menuData.menu
      .filter((cat: any) => qrAllowedCategoryIds === null || qrAllowedCategoryIds.includes(Number(cat.id)))
      .map((cat: any) => ({
        ...cat,
        products: (cat.products || []).filter((p: any) => {
          if (!p || p.is_available === false || Number(p.base_price || 0) <= 0) return false;
          return true;
        }),
      }))
      .filter((cat: any) => cat.products.length > 0);
  }, [menuData, qrAllowedCategoryIds]);

  useEffect(() => {
    if (orderableMenuTree.length > 0 && activeCategoryIndex >= orderableMenuTree.length) {
      setActiveCategoryIndex(0);
    }
  }, [orderableMenuTree.length, activeCategoryIndex]);

  const currentCategory = orderableMenuTree[activeCategoryIndex] || orderableMenuTree[0];
  const cartTotal = customerCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const isPrepaidOrder = Boolean(
    menuData?.active_order?.is_prepaid ||
      (Number(menuData?.active_order?.paid_total || 0) > 0 &&
        Number(menuData?.active_order?.remaining_total ?? menuData?.active_order?.grand_total ?? 0) <= 0.01)
  );
  const activeOrderItems: any[] = Array.isArray(menuData?.active_order?.items) ? menuData.active_order.items : [];
  const existingRemaining = Number(
    menuData?.active_order?.remaining_total ?? menuData?.active_order?.grand_total ?? 0
  );
  const fullPayableBase = Number((existingRemaining + cartTotal).toFixed(2)) || cartTotal;
  const splitItemsPool = [
    ...activeOrderItems.map((it: any, idx: number) => ({
      key: idx,
      name: it.product_name || it.name,
      qty: Number(it.quantity || 1),
      amount: Number(it.total_price || Number(it.unit_price || 0) * Number(it.quantity || 1)),
    })),
    ...customerCart.map((it: any, idx: number) => ({
      key: 1000 + idx,
      name: it.name || it.product_name,
      qty: Number(it.quantity || 1),
      amount: Number(it.price || 0) * Number(it.quantity || 1),
    })),
  ];
  const checkedItemsSum = splitItemsPool
    .filter((x) => selectedSplitKeys[x.key])
    .reduce((s, x) => s + x.amount, 0);
  const splitBaseAmount =
    splitMode === 'equal'
      ? Number((fullPayableBase / Math.max(2, splitPeopleCount)).toFixed(2))
      : splitMode === 'items'
        ? Number((checkedItemsSum > 0 ? checkedItemsSum : fullPayableBase).toFixed(2))
        : fullPayableBase;
  const qrTipAmount = Number(((splitBaseAmount * tipPercent) / 100).toFixed(2));
  const qrPayableFinal = Number((splitBaseAmount + qrTipAmount).toFixed(2));
  const selectedEntry = tableEntries.find((e) => e.table.id === selectedTableId);
  const selectedTable = selectedEntry?.table || allTables.find((t) => t.id === selectedTableId);
  const formattedAreaSlug = initialAreaSlug
    ? decodeURIComponent(initialAreaSlug).replace(/[-_]+/g, ' ').toUpperCase()
    : '';
  const formattedTableSlug = initialTableSlug
    ? decodeURIComponent(initialTableSlug).replace(/[-_]+/g, ' ').toUpperCase()
    : '';
  const formattedRestSlugTitle = initialRestaurantSlug
    ? decodeURIComponent(initialRestaurantSlug).replace(/[-_]+/g, ' ').toUpperCase()
    : '';
  const displayAreaName = selectedEntry?.areaName || formattedAreaSlug || 'Salon';
  const displayTableName =
    menuData?.table_name ||
    selectedTable?.name ||
    formattedTableSlug ||
    (selectedTableId > 0 ? `Masa #${selectedTableId}` : 'Menü');
  const restaurantTitle =
    (restaurantName && restaurantName.trim()) ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('boncore_active_restaurant_name') : null) ||
    formattedRestSlugTitle ||
    'BONCORE RESTORAN';
  const qrTenantParam = getResolvedRestaurantCode() || restaurantTitle;
  const activeOrigin = (customDomain.trim() || defaultOrigin).replace(/\/+$/, '');
  const qrMenuUrl = buildTableQrMenuUrl(activeOrigin, qrTenantParam, displayAreaName, displayTableName);

  const isLightQr = qrTheme === 'light';
  const clampedQrCm = Math.max(2, Math.min(18, Number.isFinite(qrSizeCm) ? qrSizeCm : 6));
  const printableAreaWidthCm = 19.8; // A4 (21cm) minus 1.2cm (2 x 6mm) margins
  const cardsPerRowEstimate = Math.max(1, Math.floor((printableAreaWidthCm + 0.35) / (clampedQrCm + 0.35)));
  const qrBoxCm = Math.max(1.8, Number((clampedQrCm - 0.85).toFixed(2)));

  const filteredPrintEntries = useMemo(() => {
    if (printAreaFilter === 'all') return tableEntries;
    return tableEntries.filter((e) => String(e.areaId) === printAreaFilter);
  }, [tableEntries, printAreaFilter]);

  const selectedBulkEntries = useMemo(
    () => tableEntries.filter((e) => selectedPrintTableIds.includes(e.table.id)),
    [tableEntries, selectedPrintTableIds]
  );

  const activePrintEntries = useMemo(() => {
    if (printTargetMode === 'single') {
      if (selectedEntry) return [selectedEntry];
      if (selectedTable) return [{ areaId: 0, areaName: displayAreaName, table: selectedTable }];
      return [];
    }
    return selectedBulkEntries;
  }, [printTargetMode, selectedEntry, selectedTable, displayAreaName, selectedBulkEntries]);

  const togglePrintTable = (tableId: number) => {
    sound.beep();
    setSelectedPrintTableIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
    );
  };

  const selectFirst12PrintTables = () => {
    sound.beep();
    setSelectedPrintTableIds(filteredPrintEntries.slice(0, 12).map((e) => e.table.id));
  };

  const selectAllFilteredPrintTables = () => {
    sound.beep();
    setSelectedPrintTableIds((prev) => {
      const merged = new Set(prev);
      filteredPrintEntries.forEach((e) => merged.add(e.table.id));
      return Array.from(merged);
    });
  };

  const clearPrintTables = () => {
    sound.beep();
    setSelectedPrintTableIds([]);
  };

  const triggerQrPrint = (mode: 'single' | 'bulk') => {
    if (mode === 'bulk' && selectedBulkEntries.length === 0) {
      sound.warning();
      showNotice('Lütfen toplu yazdırma için en az 1 masa seçin.', true);
      return;
    }
    if (mode === 'single' && !selectedTable && !selectedEntry) {
      sound.warning();
      showNotice('Yazdırılacak masa bulunamadı.', true);
      return;
    }

    sound.beep();
    flushSync(() => {
      setPrintTargetMode(mode);
    });

    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    document.body.classList.add('qr-print-mode');

    let overrideStyle = document.getElementById('boncore-qr-print-page-override') as HTMLStyleElement | null;
    if (!overrideStyle) {
      overrideStyle = document.createElement('style');
      overrideStyle.id = 'boncore-qr-print-page-override';
      overrideStyle.textContent = '@page { size: A4 portrait; margin: 6mm; }';
      document.head.appendChild(overrideStyle);
    }

    const cleanup = () => {
      document.body.classList.remove('qr-print-mode');
      document.getElementById('boncore-qr-print-page-override')?.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);
    window.print();
  };

  const handleCopyQrUrl = async () => {
    sound.beep();
    try {
      await navigator.clipboard.writeText(qrMenuUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      showNotice(`QR Linki: ${qrMenuUrl}`, false);
    }
  };

  const printableQrSheetPortal =
    typeof document !== 'undefined' && activePrintEntries.length > 0
      ? createPortal(
          <div className="printable-qr-sheet" aria-hidden="true">
            {activePrintEntries.map((entry) => {
              const cardUrl = buildTableQrMenuUrl(activeOrigin, qrTenantParam, entry.areaName, entry.table.name);
              const compactFontSize = clampedQrCm <= 4.5 ? '8px' : clampedQrCm <= 6.5 ? '10px' : '11px';
              const tableTitleSize = clampedQrCm <= 4.5 ? '10px' : clampedQrCm <= 6.5 ? '12px' : '14px';
              return (
                <div
                  key={entry.table.id}
                  className="printable-qr-card bg-white text-slate-950 border border-slate-300 rounded-xl flex flex-col items-center justify-between text-center box-border"
                  style={{
                    width: `${clampedQrCm}cm`,
                    padding: '0.25cm',
                    gap: '0.12cm',
                  }}
                >
                  <div
                    className="font-extrabold uppercase tracking-wider text-slate-600 leading-tight break-words w-full"
                    style={{ fontSize: compactFontSize }}
                  >
                    {restaurantTitle}
                  </div>
                  <div
                    className="font-black text-slate-950 leading-tight break-words w-full"
                    style={{ fontSize: tableTitleSize }}
                  >
                    {entry.areaName} • {entry.table.name}
                  </div>
                  <div
                    className="mx-auto bg-white border border-slate-900 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      width: `${qrBoxCm}cm`,
                      height: `${qrBoxCm}cm`,
                      padding: '0.12cm',
                    }}
                  >
                    <QrCodeSvg value={cardUrl} size="100%" />
                  </div>
                  <div
                    className="font-semibold text-slate-600 leading-tight w-full"
                    style={{ fontSize: clampedQrCm <= 4.5 ? '7px' : '8.5px' }}
                  >
                    Menü &amp; Sipariş için okutun
                  </div>
                </div>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      className={
        customerOnlyMode
          ? `min-h-[100dvh] w-full ${
              isLightQr ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'
            } flex items-center justify-center sm:p-4 select-none transition-colors duration-200`
          : 'flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none transition-colors duration-200'
      }
    >
      {/* Top Header (Admin Simulator Mode Only) */}
      {!customerOnlyMode && (
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">QR Kod Dijital Menü &amp; Masadan Sipariş</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Gerçek Okunabilir Masa QR Kartı, Güncel Domain Linki ve Müşteri Sipariş Simülatörü</p>
          </div>
        </div>
      )}

      {/* Main Grid: QR Generator Card (Left 4 cols) + Mobile Device Simulator (Right 8 cols) */}
      <div className={customerOnlyMode ? 'w-full flex justify-center' : 'grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start'}>
        {/* Left: Table QR Code Card & Selection (4 cols) */}
        {!customerOnlyMode && (
          <div className="lg:col-span-4 p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 print:hidden">
              <QrCode className="w-5 h-5 text-blue-500" />
              <span>Masa Seç &amp; QR Kod Kartı</span>
            </h3>

            <div className="print:hidden">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">Aktif Masa (Bölge • Masa):</label>
              <select
                value={selectedTableId}
                onChange={(e) => { sound.beep(); setSelectedTableId(Number(e.target.value)); }}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl p-3 text-sm text-slate-900 dark:text-white font-bold"
              >
                {tableEntries.map((entry) => (
                  <option key={entry.table.id} value={entry.table.id}>
                    {entry.areaName} • {entry.table.name} ({entry.table.status === 'occupied' ? 'Dolu' : 'Boş'})
                  </option>
                ))}
              </select>
            </div>

            {/* Printable QR Code Card Template Preview */}
            <div className="p-5 sm:p-6 bg-white text-slate-950 rounded-3xl shadow-2xl text-center space-y-3 border border-slate-200">
              <div className="text-xs uppercase font-extrabold tracking-widest text-slate-600">
                {restaurantTitle}
              </div>
              <div className="text-lg font-black">{displayAreaName} • {displayTableName}</div>

              {/* Real ISO/IEC 18004 Scannable SVG QR Code */}
              <div className="mx-auto bg-white p-2.5 rounded-2xl border-2 border-slate-900 inline-flex flex-col items-center justify-center">
                <QrCodeSvg value={qrMenuUrl} size={180} />
                <span className="text-[10px] font-mono font-black text-slate-700 mt-1 tracking-wider">
                  {displayAreaName.toUpperCase()} • {displayTableName.toUpperCase()}
                </span>
              </div>

              <p className="text-[11px] font-bold text-slate-700 leading-tight">
                Telefon kameranızla okutarak menüyü inceleyebilir, sipariş verebilir ve garson çağırabilirsiniz.
              </p>
            </div>

            {/* Domain Config & Live QR Actions */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5 print:hidden">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5 mb-1">
                  <Globe className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Güncel Domain / QR Hedef Adresi</span>
                </label>
                <input
                  type="url"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder={defaultOrigin}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300 break-all select-all">
                {qrMenuUrl}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyQrUrl}
                  className="py-2.5 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-[11px] transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'Kopyalandı!' : 'QR Linkini Kopyala'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { sound.beep(); window.open(qrMenuUrl, '_blank', 'noopener,noreferrer'); }}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Müşteri Menüsünü Aç</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => triggerQrPrint('single')}
              className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs border border-slate-300 dark:border-slate-700 transition flex items-center justify-center gap-2 print:hidden cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>BU MASANIN QR KARTINI YAZDIR ({clampedQrCm} cm)</span>
            </button>

            {/* Toplu QR Yazdırma & Fiziksel Boyut (cm) Seçimi */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3 print:hidden">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Ruler className="w-4 h-4 text-blue-500" />
                  <span>Toplu QR Yazdırma</span>
                </span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[10px] font-black">
                  {selectedBulkEntries.length} Masa Seçili
                </span>
              </div>

              {/* cm Size Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-600 dark:text-slate-400">QR Kart Genişliği (cm):</span>
                  <span className="font-mono font-black text-blue-600 dark:text-blue-400">
                    ~{cardsPerRowEstimate} kart / satır (A4)
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {[4, 5, 6, 7, 8, 10, 12].map((cm) => (
                    <button
                      key={cm}
                      type="button"
                      onClick={() => { sound.beep(); setQrSizeCm(cm); }}
                      className={`px-2 py-1 rounded-lg text-[11px] font-black border cursor-pointer transition ${
                        qrSizeCm === cm
                          ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      {cm} cm
                    </button>
                  ))}
                  <div className="flex items-center gap-1 ml-auto">
                    <input
                      type="number"
                      min={2}
                      max={18}
                      step={0.5}
                      value={qrSizeCm}
                      onChange={(e) => setQrSizeCm(Number(e.target.value) || 6)}
                      className="w-14 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] font-mono font-bold text-center text-slate-900 dark:text-white"
                    />
                    <span className="text-[11px] font-bold text-slate-500">cm</span>
                  </div>
                </div>
              </div>

              {/* Area Filter & Quick Select Buttons */}
              <div className="space-y-2">
                <select
                  value={printAreaFilter}
                  onChange={(e) => { sound.beep(); setPrintAreaFilter(e.target.value); }}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                >
                  <option value="all">Tüm Bölgeler ({tableEntries.length} Masa)</option>
                  {effectiveAreas.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name} ({(a.tables || []).length} Masa)
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={selectFirst12PrintTables}
                    className="py-1.5 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-extrabold cursor-pointer transition"
                  >
                    İlk 12 Masa
                  </button>
                  <button
                    type="button"
                    onClick={selectAllFilteredPrintTables}
                    className="py-1.5 px-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10px] font-extrabold cursor-pointer transition"
                  >
                    Tümünü Seç
                  </button>
                  <button
                    type="button"
                    onClick={clearPrintTables}
                    className="py-1.5 px-2 rounded-lg bg-slate-200 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/50 text-slate-700 dark:text-slate-300 hover:text-rose-600 text-[10px] font-extrabold cursor-pointer transition"
                  >
                    Temizle
                  </button>
                </div>
              </div>

              {/* Scrollable Table Checkboxes */}
              <div className="max-h-44 overflow-y-auto grid grid-cols-2 gap-1.5 pr-1">
                {filteredPrintEntries.map((entry) => {
                  const checked = selectedPrintTableIds.includes(entry.table.id);
                  return (
                    <label
                      key={entry.table.id}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] cursor-pointer transition ${
                        checked
                          ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-400 dark:border-blue-700 text-slate-900 dark:text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePrintTable(entry.table.id)}
                        className="rounded accent-blue-600 shrink-0"
                      />
                      <span className="min-w-0 leading-tight">
                        <span className="block font-bold truncate">{entry.table.name}</span>
                        <span className="block text-[9px] opacity-70 truncate">{entry.areaName}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => triggerQrPrint('bulk')}
                disabled={selectedBulkEntries.length === 0}
                className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white font-black text-xs shadow-lg shadow-blue-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>SEÇİLİ ({selectedBulkEntries.length}) MASAYI YAN YANA YAZDIR ({clampedQrCm} cm)</span>
              </button>
            </div>

            {/* QR Menü Ayarları: Gösterilecek Kategoriler & Masadan Müşteri Ödeme İzni */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3 print:hidden">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-emerald-500" />
                  <span>QR Menü Ayarları</span>
                </span>
                {savingQrSettings && (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    Kaydediliyor...
                  </span>
                )}
              </div>

              {/* Masadan Müşteri Ödemesi Aç/Kapa */}
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                    Masadan Müşteri Ödemesi
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                    Müşteri QR menüden Sanal POS ile kendi ödeyebilsin
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={qrAllowTablePayment}
                  onClick={() => handleToggleQrAllowPayment(!qrAllowTablePayment)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition cursor-pointer shrink-0 border ${
                    qrAllowTablePayment
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {qrAllowTablePayment ? 'Açık' : 'Kapalı'}
                </button>
              </div>

              {/* Gösterilecek Ürün Kategorileri */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    Gösterilecek Ürün Kategorileri:
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleSelectAllQrCategories}
                      className="px-2 py-0.5 rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Tümü
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllQrCategories}
                      className="px-2 py-0.5 rounded-md bg-slate-200 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/60 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-rose-600 cursor-pointer"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                  {allQrCategories.length === 0 ? (
                    <div className="col-span-full text-[11px] text-slate-400 py-2 text-center">
                      Aktif kategori bulunamadı.
                    </div>
                  ) : (
                    allQrCategories.map((cat: any) => {
                      const checked = isCategorySelectedForQr(Number(cat.id));
                      return (
                        <label
                          key={cat.id}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] cursor-pointer transition ${
                            checked
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 text-slate-900 dark:text-white'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleQrCategory(Number(cat.id))}
                            className="rounded accent-emerald-600 shrink-0"
                          />
                          <span className="min-w-0 flex-1 truncate font-bold">
                            {cat.name}
                          </span>
                          {cat.product_count !== undefined && (
                            <span className="text-[9px] font-mono opacity-70 shrink-0">
                              ({cat.product_count})
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right: Interactive Customer Smartphone Simulator / Live Customer Menu Frame */}
        <div className={customerOnlyMode ? 'w-full flex justify-center' : 'lg:col-span-8 flex justify-center print:hidden'}>
          <div
            className={`w-full ${
              customerOnlyMode
                ? 'max-w-[440px] h-[100dvh] sm:h-[780px] sm:rounded-[40px] sm:border-[6px]'
                : 'max-w-[375px] h-[680px] sm:h-[720px] rounded-[40px] sm:rounded-[45px] border-[6px] sm:border-[8px]'
            } ${
              isLightQr
                ? 'bg-white sm:border-slate-300 border-slate-300 shadow-[0_18px_50px_rgba(15,23,42,0.14)] text-slate-900'
                : 'bg-slate-950 sm:border-slate-800 border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-slate-100'
            } flex flex-col overflow-hidden relative transition-colors duration-200`}
          >
            {/* Phone Notch (Simulator only on desktop) */}
            <div
              className={`${customerOnlyMode ? 'hidden sm:flex' : 'flex'} h-6 ${
                isLightQr ? 'bg-white' : 'bg-slate-950'
              } items-center justify-center pt-1 z-20 transition-colors duration-200`}
            >
              <div className={`w-24 h-4 ${isLightQr ? 'bg-slate-200' : 'bg-slate-800'} rounded-full`} />
            </div>

            {/* Mobile App Header + Theme & 5-Dil Seçici */}
            <div
              className={`p-3.5 border-b space-y-2 z-10 backdrop-blur-md transition-colors duration-200 ${
                isLightQr ? 'bg-white/95 border-slate-200' : 'bg-slate-900/90 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className={`text-[10px] uppercase font-bold block truncate ${isLightQr ? 'text-orange-600' : 'text-orange-400'}`}>
                    {restaurantTitle} • Dijital Menü
                  </span>
                  <h4 className={`text-base font-black truncate ${isLightQr ? 'text-slate-900' : 'text-white'}`}>
                    {displayAreaName} • {displayTableName}
                  </h4>
                </div>

                {/* Buzzer Quick Buttons & White/Dark Theme Switch */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCallWaiter('Garson Çağır')}
                    className={`px-2 py-1 rounded-xl border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                      isLightQr
                        ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                        : 'bg-purple-600/20 text-purple-300 border-purple-500/40'
                    }`}
                  >
                    <Bell className="w-3 h-3" /> Garson
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCallWaiter('Hesap İste')}
                    className={`px-2 py-1 rounded-xl border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                      isLightQr
                        ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                        : 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                    }`}
                  >
                    <Receipt className="w-3 h-3" /> Hesap İste
                  </button>
                  <button
                    type="button"
                    onClick={() => { sound.beep(); setQrTheme(isLightQr ? 'dark' : 'light'); }}
                    className={`p-1.5 rounded-xl border text-[10px] font-bold flex items-center justify-center cursor-pointer transition ${
                      isLightQr
                        ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                        : 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
                    }`}
                    title={isLightQr ? 'Koyu Temaya Geç' : 'Beyaz Temaya Geç'}
                    aria-label={isLightQr ? 'Koyu Temaya Geç' : 'Beyaz Temaya Geç'}
                  >
                    {isLightQr ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {isPrepaidOrder && (
              <div
                className={`px-3.5 py-2 border-b text-xs font-extrabold flex items-center justify-between gap-2 ${
                  isLightQr
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-emerald-900/40 border-emerald-500/40 text-emerald-300'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Ön Ödeme Alındı • Siparişiniz Hazırlanıyor</span>
                </span>
                <span className="font-mono shrink-0">
                  ₺{Number(menuData?.active_order?.paid_total || menuData?.active_order?.grand_total || 0).toFixed(2)}
                </span>
              </div>
            )}

            {/* Notification Toast */}
            {notice && (
              <div className={`${notice.isError ? 'bg-rose-600' : 'bg-emerald-600'} text-white text-xs font-extrabold p-2.5 text-center animate-fadeIn z-20 shadow-md`}>
                {notice.message}
              </div>
            )}

            {/* Category Pills Bar */}
            <div
              className={`px-3 py-2 border-b flex gap-1.5 overflow-x-auto transition-colors duration-200 ${
                isLightQr ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800/80'
              }`}
            >
              {orderableMenuTree.map((cat: any, idx: number) => (
                <button
                  key={cat.id}
                  onClick={() => { sound.beep(); setActiveCategoryIndex(idx); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    activeCategoryIndex === idx
                      ? 'bg-blue-600 text-white shadow'
                      : isLightQr
                        ? 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Products List in Category (Sadece Sipariş Verilebilir Ürünler) */}
            <div className={`flex-1 overflow-y-auto p-3 space-y-2.5 ${isLightQr ? 'bg-slate-50/70' : ''}`}>
              {orderableMenuTree.length === 0 ? (
                <div className={`text-center text-xs py-10 px-4 font-semibold ${isLightQr ? 'text-slate-500' : 'text-slate-400'}`}>
                  Şu anda sipariş verilebilir ürün bulunmamaktadır.
                </div>
              ) : (
                (currentCategory?.products || []).map((p: any) => {
                  const meta = productMetaMap[p.id];
                  const weighted = isWeightProduct(p);
                  const inCartItem = customerCart.find((i) => i.product_id === p.id);
                  const outOfStock = isProductOutOfStock(p, weighted ? 0.001 : 1);
                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors duration-200 ${
                        outOfStock && !p.allow_negative_stock
                          ? isLightQr
                            ? 'bg-rose-50/50 border-rose-200 shadow-sm'
                            : 'bg-rose-950/20 border-rose-900/50 shadow-md'
                          : isLightQr
                            ? 'bg-white border-slate-200 shadow-sm'
                            : 'bg-slate-900 border-slate-800/80 shadow-md'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-extrabold text-sm ${isLightQr ? 'text-slate-900' : 'text-white'}`}>
                            {p.name}
                          </span>
                          {outOfStock && !p.allow_negative_stock && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                isLightQr ? 'bg-rose-100 text-rose-700' : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              Tükendi
                            </span>
                          )}
                          {outOfStock && p.allow_negative_stock && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                isLightQr ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              Stok Yok • Onaylı Sipariş
                            </span>
                          )}
                          {weighted && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black flex items-center gap-0.5 ${
                                isLightQr ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              <Scale className="w-2.5 h-2.5" />
                              <span>Kg / Gramaj</span>
                            </span>
                          )}
                          {meta?.prepMinutes ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] ${
                                isLightQr ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              ⏱️ {meta.prepMinutes} dk
                            </span>
                          ) : null}
                        </div>
                        {p.description && (
                          <p className={`text-[10px] line-clamp-2 mt-0.5 ${isLightQr ? 'text-slate-500' : 'text-slate-400'}`}>
                            {p.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <span className={`text-xs font-black font-mono ${isLightQr ? 'text-emerald-600' : 'text-emerald-400'}`}>
                            ₺{Number(p.base_price || 0).toFixed(2)}{weighted ? ' / Kg' : ''}
                          </span>
                          {inCartItem && (
                            <span
                              className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                                isLightQr ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-900/50 text-emerald-300'
                              }`}
                            >
                              Sepette: {formatCartItemQty(inCartItem)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {inCartItem && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFromCart(p.id)}
                            className={`w-8 h-8 rounded-xl border flex items-center justify-center cursor-pointer transition ${
                              isLightQr
                                ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                                : 'bg-rose-950/60 border-rose-800 text-rose-400 hover:bg-rose-900/60'
                            }`}
                            title="Sepetten Çıkar"
                            aria-label={`${p.name} sepetten çıkar`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAddToCart(p)}
                          className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 cursor-pointer text-white flex items-center justify-center font-bold shadow"
                          title={weighted ? 'Gramaj Seç & Sepete Ekle' : 'Sepete Ekle'}
                        >
                          {weighted ? <Scale className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Mobile Bottom Cart Bar & Un-ordered Cart Items Drawer */}
            {(customerCart.length > 0 || (existingRemaining > 0 && qrAllowTablePayment)) && (
              <div
                className={`p-3 border-t space-y-2 z-10 transition-colors duration-200 ${
                  isLightQr ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                {customerCart.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setIsCartExpanded((prev) => !prev)}
                        className={`flex items-center gap-1 font-extrabold cursor-pointer ${
                          isLightQr ? 'text-slate-700 hover:text-slate-900' : 'text-slate-200 hover:text-white'
                        }`}
                      >
                        <ShoppingCart className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Sepetiniz ({customerCart.length} kalem)</span>
                        {isCartExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleClearCustomerCart}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md cursor-pointer transition ${
                            isLightQr
                              ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                              : 'bg-rose-950/60 text-rose-400 hover:bg-rose-900/60'
                          }`}
                        >
                          Sepeti Temizle
                        </button>
                        <span className={`font-mono font-black text-sm ${isLightQr ? 'text-emerald-600' : 'text-emerald-400'}`}>
                          ₺{cartTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {isCartExpanded && (
                      <div
                        className={`max-h-36 overflow-y-auto rounded-2xl border p-2 space-y-1.5 ${
                          isLightQr ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        {customerCart.map((item) => {
                          const itemWeighted = isWeightProduct(item);
                          return (
                            <div
                              key={item.product_id}
                              className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl border text-[11px] ${
                                isLightQr ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className={`font-bold truncate ${isLightQr ? 'text-slate-900' : 'text-white'}`}>
                                  {item.name}
                                </div>
                                <div className={`text-[10px] font-mono ${isLightQr ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {formatCartItemQty(item)} •{' '}
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                    ₺{(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {itemWeighted ? (
                                  <button
                                    type="button"
                                    onClick={() => openWeightModal({ id: item.product_id, name: item.name, base_price: item.price, unit: item.unit || 'Kg', is_weight: true })}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                                      isLightQr
                                        ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                                        : 'bg-amber-950/60 border-amber-700 text-amber-300'
                                    }`}
                                    title="Gramajı Değiştir"
                                  >
                                    Gramaj
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleChangeCartQty(item.product_id, -1)}
                                      className={`w-6 h-6 rounded-lg border flex items-center justify-center cursor-pointer ${
                                        isLightQr
                                          ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                                          : 'bg-slate-800 border-slate-700 text-slate-200'
                                      }`}
                                      title="Azalt"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleChangeCartQty(item.product_id, 1)}
                                      className={`w-6 h-6 rounded-lg border flex items-center justify-center cursor-pointer ${
                                        isLightQr
                                          ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                                          : 'bg-slate-800 border-slate-700 text-slate-200'
                                      }`}
                                      title="Artır"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromCart(item.product_id)}
                                  className={`w-6 h-6 rounded-lg border flex items-center justify-center cursor-pointer ${
                                    isLightQr
                                      ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                                      : 'bg-rose-950/60 border-rose-800 text-rose-400 hover:bg-rose-900/60'
                                  }`}
                                  title="Sepetten Sil"
                                  aria-label={`${item.name} sepetten sil`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {customerCart.length === 0 && existingRemaining > 0 && qrAllowTablePayment && (
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-bold ${isLightQr ? 'text-slate-600' : 'text-slate-400'}`}>
                      Masada Öde (Açık Hesap):
                    </span>
                    <span className={`font-mono font-black text-sm ${isLightQr ? 'text-emerald-600' : 'text-emerald-400'}`}>
                      ₺{existingRemaining.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="flex gap-2">
                  {customerCart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { sound.beep(); setIsOrderNoteModalOpen(true); }}
                      disabled={loading}
                      className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Mutfağa Sipariş Ver</span>
                    </button>
                  )}
                  {qrAllowTablePayment && (
                    <button
                      type="button"
                      onClick={() => { sound.beep(); setIsVirtualPosOpen(true); }}
                      className={`${customerCart.length === 0 ? 'flex-1 py-3' : 'px-3 py-3'} rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow flex items-center justify-center gap-1.5 cursor-pointer`}
                      title="Masada Öde"
                    >
                      <CreditCard className="w-4 h-4" />
                      {customerCart.length === 0 && <span>Masada Öde</span>}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Simulated Virtual POS 3D Secure Modal */}
      {isVirtualPosOpen && (
        <div
          className={`fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4 ${
            isLightQr ? 'bg-slate-900/50' : 'bg-black/85'
          }`}
        >
          <div
            className={`border rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 ${
              isLightQr ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className={`w-5 h-5 ${isLightQr ? 'text-blue-600' : 'text-blue-400'}`} />
                <h3 className={`text-base font-bold ${isLightQr ? 'text-slate-900' : 'text-white'}`}>
                  Masada Ödeme / Hesap Talebi
                </h3>
              </div>
              <button
                onClick={() => setIsVirtualPosOpen(false)}
                className={`p-1 ${isLightQr ? 'text-slate-400 hover:text-slate-700' : 'text-slate-400 hover:text-white'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              className={`p-3 rounded-2xl border text-xs space-y-2.5 ${
                isLightQr ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            >
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                {[
                  { id: 'full', label: 'Tamamını Öde' },
                  { id: 'equal', label: `1/${splitPeopleCount}` },
                  { id: 'items', label: 'Ürün Seç' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { sound.beep(); setSplitMode(m.id as any); }}
                    className={`py-1.5 px-2 rounded-lg font-black border cursor-pointer ${
                      splitMode === m.id
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : isLightQr
                          ? 'bg-white text-slate-700 border-slate-300'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {splitMode === 'equal' && (
                <div
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border ${
                    isLightQr ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <span className={`font-bold ${isLightQr ? 'text-slate-600' : 'text-slate-400'}`}>Kişi:</span>
                  <div className="flex items-center gap-1">
                    {[2, 3, 4, 5, 6].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSplitPeopleCount(n)}
                        className={`w-6 h-6 rounded-md font-black cursor-pointer ${
                          splitPeopleCount === n
                            ? 'bg-emerald-500 text-white'
                            : isLightQr
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-slate-800 text-white'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {splitMode === 'items' && splitItemsPool.length > 0 && (
                <div
                  className={`max-h-24 overflow-y-auto space-y-1 p-2 rounded-xl border ${
                    isLightQr ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  {splitItemsPool.map((item) => (
                    <label key={item.key} className="flex items-center justify-between gap-2 cursor-pointer text-[11px]">
                      <span className={`flex items-center gap-1.5 truncate ${isLightQr ? 'text-slate-800' : 'text-slate-200'}`}>
                        <input
                          type="checkbox"
                          checked={!!selectedSplitKeys[item.key]}
                          onChange={() =>
                            setSelectedSplitKeys((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                          }
                        />
                        <span className="truncate">{item.qty}x {item.name}</span>
                      </span>
                      <span className={`font-mono font-bold ${isLightQr ? 'text-emerald-600' : 'text-emerald-400'}`}>
                        ₺{item.amount.toFixed(2)}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className={`font-bold ${isLightQr ? 'text-slate-600' : 'text-slate-400'}`}>Bahşiş:</span>
                <div className="flex items-center gap-1">
                  {[0, 5, 10, 15].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => { sound.beep(); setTipPercent(pct); }}
                      className={`px-2 py-1 rounded-md font-black text-[10px] cursor-pointer ${
                        tipPercent === pct
                          ? 'bg-amber-500 text-white'
                          : isLightQr
                            ? 'bg-white border border-slate-200 text-slate-700'
                            : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      %{pct}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`pt-1 border-t flex items-center justify-between ${isLightQr ? 'border-slate-200' : 'border-slate-800'}`}>
                <span className={isLightQr ? 'text-slate-600' : 'text-slate-400'}>Çekilecek Tutar:</span>
                <div className="text-right">
                  <div className={`text-xl font-black font-mono ${isLightQr ? 'text-emerald-600' : 'text-emerald-400'}`}>
                    ₺{qrPayableFinal.toFixed(2)}
                  </div>
                  {qrTipAmount > 0 && (
                    <div className={`text-[10px] font-bold ${isLightQr ? 'text-amber-600' : 'text-amber-400'}`}>
                      +₺{qrTipAmount.toFixed(2)} Bahşiş dahil
                    </div>
                  )}
                </div>
              </div>
            </div>

            {customerCart.length > 0 && (
              <div className="text-xs">
                <label className={`block mb-1 font-bold ${isLightQr ? 'text-slate-700' : 'text-slate-300'}`}>
                  Müşteri Sipariş Notu (İsteğe Bağlı):
                </label>
                <textarea
                  rows={2}
                  value={customerOrderNote}
                  onChange={(e) => setCustomerOrderNote(e.target.value)}
                  placeholder="Örn: Soğansız olsun, acısız hazırlansın..."
                  className={`w-full border rounded-xl p-2.5 text-xs ${
                    isLightQr ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400' : 'bg-slate-800 border-slate-700 text-white placeholder:text-slate-500'
                  }`}
                />
              </div>
            )}

            <div className={`p-3 rounded-xl border text-[11px] leading-relaxed ${
              isLightQr
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-blue-950/40 border-blue-800/60 text-blue-200'
            }`}>
              Online 3D Secure kart çekimi entegrasyonu henüz aktif değildir. Talebi onayladığınızda varsa sepetiniz mutfağa iletilir ve garsonunuza <strong>POS cihazı / hesap talebi</strong> bildirilir.
            </div>

            <button
              onClick={handleVirtualPosPayment}
              disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs shadow-lg shadow-emerald-500/30 disabled:opacity-50"
            >
              {loading ? 'Talep Gönderiliyor...' : 'GARSON / POS CİHAZI ÇAĞIR'}
            </button>
          </div>
        </div>
      )}

      {/* Customer Order Note Modal */}
      {isOrderNoteModalOpen && (
        <div
          className={`fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4 ${
            isLightQr ? 'bg-slate-900/50' : 'bg-black/80'
          }`}
        >
          <div
            className={`border rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-4 ${
              isLightQr ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className={`w-5 h-5 ${isLightQr ? 'text-emerald-600' : 'text-emerald-400'}`} />
                <h3 className="text-base font-extrabold">Müşteri Sipariş Notu</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOrderNoteModalOpen(false)}
                className={`p-1 cursor-pointer ${isLightQr ? 'text-slate-400 hover:text-slate-700' : 'text-slate-400 hover:text-white'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={`p-2.5 rounded-2xl border text-xs space-y-1 max-h-28 overflow-y-auto ${isLightQr ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
              {customerCart.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2">
                  <span className="font-semibold truncate">{formatCartItemQty(it)} • {it.name}</span>
                  <span className="font-mono font-bold shrink-0">₺{(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className={`block text-xs font-bold ${isLightQr ? 'text-slate-700' : 'text-slate-300'}`}>
                Mutfak için özel notunuz var mı?
              </label>
              <textarea
                rows={3}
                value={customerOrderNote}
                onChange={(e) => setCustomerOrderNote(e.target.value)}
                placeholder="Örn: Soğansız olsun, acısız hazırlansın, yanında limon olsun..."
                autoFocus
                className={`w-full border rounded-2xl p-3 text-xs outline-none focus:ring-2 focus:ring-emerald-500 ${
                  isLightQr
                    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                    : 'bg-slate-800 border-slate-700 text-white placeholder:text-slate-500'
                }`}
              />
              <div className="flex flex-wrap gap-1.5">
                {['Soğansız', 'Acısız', 'Az Pişmiş', 'İyi Pişmiş', 'Sossuz', 'Buzsuz'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      sound.beep();
                      setCustomerOrderNote((prev) => {
                        const trimmed = prev.trim();
                        if (!trimmed) return chip;
                        if (trimmed.toLowerCase().includes(chip.toLowerCase())) return prev;
                        return `${trimmed}, ${chip}`;
                      });
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                      isLightQr
                        ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-emerald-950/60 hover:border-emerald-500/40'
                    }`}
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsOrderNoteModalOpen(false)}
                className={`px-4 py-3 rounded-2xl text-xs font-bold border cursor-pointer ${
                  isLightQr
                    ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSendOrderFromPhone()}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs shadow-lg shadow-emerald-500/30 disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Gönderiliyor...' : 'Mutfağa Siparişi Gönder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weight / Gramaj Selection Modal (Kg Ürünler İçin) */}
      {weightModalProduct && (
        <div
          className={`fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4 ${
            isLightQr ? 'bg-slate-900/50' : 'bg-black/80'
          }`}
        >
          <div
            className={`border rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-4 ${
              isLightQr ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Scale className={`w-5 h-5 shrink-0 ${isLightQr ? 'text-amber-600' : 'text-amber-400'}`} />
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold truncate">{weightModalProduct.name}</h3>
                  <div className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    ₺{Number(weightModalProduct.base_price || 0).toFixed(2)} / Kg
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWeightModalProduct(null)}
                className={`p-1 cursor-pointer ${isLightQr ? 'text-slate-400 hover:text-slate-700' : 'text-slate-400 hover:text-white'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className={`block mb-1 font-bold ${isLightQr ? 'text-slate-700' : 'text-slate-300'}`}>
                  Gramaj (gr):
                </label>
                <input
                  type="number"
                  min={1}
                  step={50}
                  value={weightGramInput}
                  onChange={(e) => handleWeightGramChange(e.target.value)}
                  autoFocus
                  className={`w-full border rounded-2xl p-2.5 font-mono font-black text-center text-sm ${
                    isLightQr ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                  }`}
                />
              </div>
              <div>
                <label className={`block mb-1 font-bold ${isLightQr ? 'text-slate-700' : 'text-slate-300'}`}>
                  Kilogram (Kg):
                </label>
                <input
                  type="number"
                  min={0.01}
                  step={0.05}
                  value={weightKgInput}
                  onChange={(e) => handleWeightKgChange(e.target.value)}
                  className={`w-full border rounded-2xl p-2.5 font-mono font-black text-center text-sm ${
                    isLightQr ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                  }`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className={`text-[11px] font-bold ${isLightQr ? 'text-slate-600' : 'text-slate-400'}`}>
                Hızlı Gramaj Seçimi:
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[100, 150, 200, 250, 300, 500, 750, 1000].map((gr) => {
                  const isActive = Math.round(parseFloat(weightGramInput || '0')) === gr;
                  return (
                    <button
                      key={gr}
                      type="button"
                      onClick={() => {
                        sound.beep();
                        handleWeightGramChange(String(gr));
                      }}
                      className={`py-2 px-1 rounded-xl text-[11px] font-black border cursor-pointer transition ${
                        isActive
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                          : isLightQr
                            ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-amber-50 hover:border-amber-300'
                            : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-amber-500/40'
                      }`}
                    >
                      {gr === 1000 ? '1 Kg' : `${gr} gr`}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                isLightQr ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-950/40 border-emerald-800'
              }`}
            >
              <span className="font-bold">Hesaplanan Tutar:</span>
              <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                ₺{((parseFloat(String(weightKgInput).replace(',', '.')) || 0) * Number(weightModalProduct.base_price || 0)).toFixed(2)}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setWeightModalProduct(null)}
                className={`px-4 py-3 rounded-2xl text-xs font-bold border cursor-pointer ${
                  isLightQr
                    ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmWeightProduct}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-xs shadow-lg shadow-amber-500/30 cursor-pointer"
              >
                Gramaj ile Sepete Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {printableQrSheetPortal}
    </div>
  );
};
