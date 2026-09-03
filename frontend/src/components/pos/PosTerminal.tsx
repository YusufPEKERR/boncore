import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, Search, Plus, Minus, Trash2, Edit3, Printer, 
  User as UserIcon, Tag, Zap, Save, Check, RefreshCw, 
  MoreVertical, ChevronUp, AlertCircle, FileText, Users, 
  Utensils, DollarSign, X, CheckCircle2 
} from 'lucide-react';
import { Category, Product, OrderItem, Table, Order, StaffUser } from '../../types';
import { sound } from '../../services/sound';
import { api } from '../../services/api';
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
  const [existingOrder, setExistingOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Quick Action Modals
  const [isNoteModalOpen, setIsNoteModalOpen] = useState<boolean>(false);
  const [orderNote, setOrderNote] = useState<string>('');
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState<boolean>(false);
  const [discountPercent, setDiscountPercent] = useState<number>(10);

  // Settings state (API-first, localStorage fallback)
  const [settings, setSettings] = useState<{
    isKuverEnabled: boolean;
    kuverPrice: number;
    isServiceEnabled: boolean;
    serviceRate: number;
  }>({
    isKuverEnabled: true,
    kuverPrice: 35.0,
    isServiceEnabled: false,
    serviceRate: 10.0,
  });

  // Load existing order
  useEffect(() => {
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
      const newSettings = {
        isKuverEnabled: data.is_kuver_enabled ?? true,
        kuverPrice: data.kuver_price ?? 35.0,
        isServiceEnabled: data.is_service_charge_enabled ?? false,
        serviceRate: data.service_charge_rate ?? 10.0,
      };
      setSettings(newSettings);
      // Update localStorage as cache
      localStorage.setItem('boncore_kuver_enabled', String(newSettings.isKuverEnabled));
      localStorage.setItem('boncore_kuver_price', String(newSettings.kuverPrice));
      localStorage.setItem('boncore_service_enabled', String(newSettings.isServiceEnabled));
      localStorage.setItem('boncore_service_rate', String(newSettings.serviceRate));
    } catch (err) {
      console.warn('[PosTerminal] Failed to fetch settings, using localStorage fallback:', err);
      // Fallback to localStorage
      setSettings({
        isKuverEnabled: localStorage.getItem('boncore_kuver_enabled') === 'true',
        kuverPrice: parseFloat(localStorage.getItem('boncore_kuver_price') || '35.00'),
        isServiceEnabled: localStorage.getItem('boncore_service_enabled') === 'true',
        serviceRate: parseFloat(localStorage.getItem('boncore_service_rate') || '10.00'),
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
        // Ödenmiş sipariş, aktif siparişi ve sepeti temizle
        setActiveOrderId(null);
        setExistingOrder(null);
        setCartItems([]);
        return;
      }
      setExistingOrder(ord);
      setActiveOrderId(ord.id);
      setCartItems(ord.items || []);
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
    return cartItems
      .filter(i => i.product_id === productId && !i.is_voided)
      .reduce((sum, i) => sum + i.quantity, 0);
  };

  const handleProductClick = (product: Product) => {
    sound.beep();
    if ((product.variants && product.variants.length > 0) || (product.modifier_groups && product.modifier_groups.length > 0)) {
      setSelectedProductForModal(product);
      return;
    }
    // Add or increment simple item
    const existingIndex = cartItems.findIndex(i => !i.id && i.product_id === product.id && (!i.selected_modifiers || i.selected_modifiers.length === 0));
    if (existingIndex > -1) {
      setCartItems(prev => prev.map((item, idx) => {
        if (idx === existingIndex) {
          const newQty = item.quantity + 1;
          return { ...item, quantity: newQty, total_price: newQty * item.unit_price };
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
    handleProductClick(product);
  };

  const handleInlineDecrease = (e: React.MouseEvent, productId: number) => {
    e.stopPropagation();
    sound.beep();
    const existingIndex = cartItems.findIndex(i => !i.id && i.product_id === productId);
    if (existingIndex > -1) {
      setCartItems(prev => {
        const item = prev[existingIndex];
        if (item.quantity > 1) {
          return prev.map((it, idx) => idx === existingIndex ? { ...it, quantity: it.quantity - 1, total_price: (it.quantity - 1) * it.unit_price } : it);
        } else {
          return prev.filter((_, idx) => idx !== existingIndex);
        }
      });
    } else {
      // Saved item notification
      alert('Kayıtlı ürün adedini azaltmak için iptal yetkisi gerekir.');
    }
  };

  const handleAddModifiedItem = (item: OrderItem) => {
    sound.beep();
    setCartItems(prev => [...prev, item]);
    setSelectedProductForModal(null);
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
        sound.kitchenBell();
        await loadOrder(activeOrderId);
      } else {
        const payload = {
          table_id: activeTable?.id || null,
          order_type: activeTable ? 'dine_in' : 'takeaway',
          items: unsavedItems,
          waiter_name: currentUser?.name || 'MEHMETABİ',
          kuver_count: activeTable?.kuver_count || 1
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
      alert(err.message || 'Sipariş kaydedilemedi.');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  // Settings & Configuration Parameters
  const [kuverCount, setKuverCount] = useState<number>(activeTable?.kuver_count || 1);
  const [isKuverModalOpen, setIsKuverModalOpen] = useState<boolean>(false);
  const [showBreakdown, setShowBreakdown] = useState<boolean>(false);

  // Listen to SETTINGS_UPDATED over WebSocket to keep state & cache in sync
  useWebSocket('pos', (type, data) => {
    if (type === 'SETTINGS_UPDATED' && data) {
      const newSettings = {
        isKuverEnabled: data.is_kuver_enabled ?? settings.isKuverEnabled,
        kuverPrice: data.kuver_price ?? settings.kuverPrice,
        isServiceEnabled: data.is_service_charge_enabled ?? settings.isServiceEnabled,
        serviceRate: data.service_charge_rate ?? settings.serviceRate,
      };
      setSettings(newSettings);
      localStorage.setItem('boncore_kuver_enabled', String(newSettings.isKuverEnabled));
      localStorage.setItem('boncore_kuver_price', String(newSettings.kuverPrice));
      localStorage.setItem('boncore_service_enabled', String(newSettings.isServiceEnabled));
      localStorage.setItem('boncore_service_rate', String(newSettings.serviceRate));
    }
  });

  const isKuverEnabled = settings.isKuverEnabled;
  const kuverPrice = settings.kuverPrice;
  const isServiceEnabled = settings.isServiceEnabled;
  const serviceRate = isServiceEnabled ? settings.serviceRate : 0.00;

  // Calculate totals
  const subtotal = cartItems.filter(i => !i.is_voided).reduce((sum, i) => sum + i.total_price, 0);
  const kuverTotal = (isKuverEnabled && activeTable ? kuverCount * kuverPrice : 0);
  const serviceChargeTotal = (subtotal * serviceRate) / 100;
  const discountTotal = (existingOrder && existingOrder.discount_amount > 0)
    ? existingOrder.discount_amount 
    : (discountPercent > 0 ? (subtotal * discountPercent) / 100 : 0);
  const treatTotal = existingOrder?.treat_amount || 0;
  const grandTotal = Math.max(0, subtotal + kuverTotal + serviceChargeTotal - discountTotal - treatTotal);
  const vatAmount = ((grandTotal) * 10) / 110; // %10 KDV Dahil tutarı

  return (
    <div className="flex-1 flex h-[calc(100vh-3.5rem)] bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden font-sans transition-colors duration-200">
      {/* Left Panel: Adisyon & Cart (Matching Adisyo Frame 070) - ~360px */}
      <div className="w-[340px] md:w-[380px] flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-lg z-10">
        {/* Ticket Top Header: ← Masa 9 + Action Icons */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToTables}
              className="p-1 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
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

        {/* Adisyon No & Status Banner (Matching Frame 070) */}
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
            return (
              <div 
                key={idx}
                className={`py-2.5 px-2 flex items-start justify-between rounded-xl transition ${
                  item.is_voided 
                    ? 'opacity-40 line-through bg-red-50/50 dark:bg-red-950/20' 
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                      {item.quantity}x
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

                  {/* Negative modifiers info (No Onion etc) */}
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
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Mutfağa İletildi
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                        ● Kaydedilmedi
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end justify-between self-stretch">
                  <span className="font-mono text-xs font-black text-slate-900 dark:text-white">
                    ₺{item.total_price.toFixed(2)}
                  </span>

                  <button
                    onClick={() => {
                      if (!isSaved) {
                        setCartItems(prev => prev.filter((_, i) => i !== idx));
                      } else {
                        alert('Kayıtlı siparişi iptal etmek için lütfen müdür yetkisiyle İptal/İade işlemi yapınız.');
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
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-xs text-center p-4">
              <span>Henüz ürün eklenmedi.</span>
            </div>
          )}
        </div>

        {/* Bottom Bar: Total Summary + Breakdown Drawer + 3 Action Buttons */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2 shadow-2xl">
          {/* Expandable Breakdown Details */}
          {showBreakdown && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-semibold space-y-1.5 animate-fadeIn">
              <div className="flex justify-between text-slate-500">
                <span>Ürünler Ara Toplamı:</span>
                <span className="font-mono text-slate-900 dark:text-white font-bold">₺{subtotal.toFixed(2)}</span>
              </div>
              {kuverTotal > 0 && (
                <div className="flex justify-between text-amber-600 dark:border-amber-400">
                  <span>Kuver ({kuverCount} Kişi x ₺{kuverPrice}):</span>
                  <span className="font-mono font-bold">+₺{kuverTotal.toFixed(2)}</span>
                </div>
              )}
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
              {isKuverEnabled && (
                <span className="text-[10px] text-slate-400">({kuverCount} Kişi)</span>
              )}
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
              onClick={() => {
                if (activeOrderId) {
                  sound.beep();
                  onOpenCheckout(activeOrderId, activeTable);
                } else {
                  handleSaveOrSendOrder();
                }
              }}
              disabled={cartItems.length === 0}
              className="col-span-5 py-3 px-2 rounded-xl bg-[#27ae60] hover:bg-[#219653] disabled:opacity-50 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">
                ÖDE ₺{(existingOrder ? existingOrder.remaining_total : grandTotal).toFixed(2)}
              </span>
            </button>

            <button
              onClick={() => {
                if (activeOrderId) {
                  sound.cashDrawer();
                  alert(`Hızlı Nakit Ödeme ₺${grandTotal.toFixed(2)} alındı.`);
                  onRefreshData();
                  onBackToTables();
                }
              }}
              disabled={cartItems.length === 0}
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

      {/* Right Panel: Search Bar + Toolbar + 2-Row Category Grid + Product Cards (Frame 070) */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Top Search & Toolbar */}
        <div className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between gap-3 shadow-sm">
          <div className="relative flex-1 max-w-xl">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ürün Adı veya Barkod ile Arama"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs md:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Action Toolbar Icons (Frame 070) */}
          <div className="flex items-center gap-2">
            {/* Person / Kuver Count */}
            <div 
              onClick={() => setIsKuverModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 cursor-pointer transition shadow-sm"
              title="Kişi Sayısı / Kuver Değiştir"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>{kuverCount} Kişi</span>
            </div>

            {/* Note Button 📄 */}
            <button
              onClick={() => setIsNoteModalOpen(true)}
              className="p-2 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
              title="Adisyon Notu"
            >
              <FileText className="w-4 h-4" />
            </button>

            {/* Treat / Kuver Button 🍽️ */}
            <button
              onClick={() => alert('İkram Modalı Açıldı')}
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

        {/* 2-Row Horizontal Category Grid (Matching Frame 070) */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-3 overflow-x-auto">
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
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
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-tight transition whitespace-nowrap ${
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

        {/* Clean White Product Cards Grid with Inline Stepper Overlay (Matching Frame 070) */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
          {displayedProducts.map((p) => {
            const qty = getProductQuantityInCart(p.id);
            return (
              <div
                key={p.id}
                onClick={() => handleProductClick(p)}
                className="h-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-3.5 flex flex-col justify-between cursor-pointer pos-touch-card shadow-sm hover:shadow-md transition relative group overflow-hidden"
              >
                <div>
                  <h4 className="font-extrabold text-xs md:text-sm text-slate-900 dark:text-white uppercase tracking-tight leading-snug group-hover:text-red-600 transition">
                    {p.name}
                  </h4>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span className="font-mono text-xs font-black text-slate-900 dark:text-white">
                    ₺{p.base_price.toFixed(2)}
                  </span>
                  {p.variants && p.variants.length > 0 && (
                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded">
                      Seçenek
                    </span>
                  )}
                </div>

                {/* Inline Card Quantity Stepper Overlay (Exact Adisyo Frame 070 Feature) */}
                {qty > 0 && (
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-8 bg-[#c0392b] text-white flex flex-col items-center justify-between py-1 z-10 shadow-lg rounded-r-2xl animate-fadeIn"
                  >
                    <button
                      onClick={(e) => handleInlineIncrease(e, p)}
                      className="w-full text-center hover:bg-black/20 font-black text-sm active:scale-90"
                    >
                      +
                    </button>
                    <span className="font-mono font-black text-xs">{qty}</span>
                    <button
                      onClick={(e) => handleInlineDecrease(e, p.id)}
                      className="w-full text-center hover:bg-black/20 font-black text-sm active:scale-90"
                    >
                      -
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
                onClick={() => {
                  sound.beep();
                  alert('Adisyon notu kaydedildi.');
                  setIsNoteModalOpen(false);
                }}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white font-black text-xs"
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
              <label className="text-[11px] font-bold text-slate-500">Tanımlı İndirim Şablonları:</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: '%10 Sadakat İndirimi', val: 10, type: 'percent' },
                  { name: '%15 Personel İndirimi', val: 15, type: 'percent' },
                  { name: '%20 VIP İndirimi', val: 20, type: 'percent' },
                  { name: '%50 Yönetici / İkram', val: 50, type: 'percent' }
                ].map((d, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      sound.beep();
                      setDiscountPercent(d.val);
                      alert(`${d.name} (%${d.val}) adisyona uygulandı.`);
                      setIsDiscountModalOpen(false);
                    }}
                    className="p-2.5 bg-slate-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 hover:border-red-400 rounded-xl text-left transition flex items-center justify-between"
                  >
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{d.name}</span>
                    <span className="font-mono font-black text-red-600 text-xs">%{d.val}</span>
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
                  min="1"
                  max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  className="w-24 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-center font-black text-slate-900 dark:text-white"
                />
                <button
                  onClick={() => {
                    sound.beep();
                    alert(`%${discountPercent} İndirim uygulandı.`);
                    setIsDiscountModalOpen(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow transition"
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

      {/* Kuver / Kişi Sayısı Modalı */}
      {isKuverModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <h3 className="text-base font-black">Masa Kişi Sayısı & Kuver</h3>
            <p className="text-xs text-slate-500">Masada oturan kişi sayısını seçin (Kişi başı kuver: ₺{kuverPrice.toFixed(2)}):</p>

            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map(n => (
                <button
                  key={n}
                  onClick={() => {
                    sound.beep();
                    setKuverCount(n);
                    setIsKuverModalOpen(false);
                  }}
                  className={`py-2.5 rounded-xl font-mono font-black text-sm border transition ${
                    kuverCount === n
                      ? 'bg-red-600 text-white border-red-500 shadow'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsKuverModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs"
              >
                Kapat
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
    </div>
  );
};
