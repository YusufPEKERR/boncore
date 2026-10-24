import React, { useState, useEffect } from 'react';
import { 
  Bike, PhoneCall, MapPin, CheckCircle, Clock, 
  RefreshCw, DollarSign, UserCheck, AlertCircle 
} from 'lucide-react';
import { Category, Courier, DeliveryOrder, Product } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';
import { useWebSocket } from '../../services/websocket';

interface DeliveryHubProps {
  categories?: Category[];
}

export const DeliveryHub: React.FC<DeliveryHubProps> = ({ categories = [] }) => {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [callerPhone, setCallerPhone] = useState<string>('0532 111 22 33');
  const [callerProfile, setCallerProfile] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCourierByDelivery, setSelectedCourierByDelivery] = useState<Record<number, number>>({});

  // Flatten real products from categories
  const realProducts: Product[] = categories.flatMap(c => (c.products || []).filter(p => p.is_available !== false));

  // New Caller Delivery Order State
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState<boolean>(false);
  const [customerNameInput, setCustomerNameInput] = useState<string>('');
  const [customerAddressInput, setCustomerAddressInput] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<number>(realProducts[0]?.id || 1);
  const [orderFoodItem, setOrderFoodItem] = useState<string>(realProducts[0]?.name || 'Kuzu Şiş');
  const [orderQty, setOrderQty] = useState<number>(1);
  const [orderPrice, setOrderPrice] = useState<number>(realProducts[0]?.base_price || 380);
  const [orderPaymentType, setOrderPaymentType] = useState<string>('nakit_kapida');
  const [orderNotes, setOrderNotes] = useState<string>('Telefonla Sipariş Alındı');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    if (realProducts.length > 0 && !realProducts.some(p => p.id === selectedProductId)) {
      setSelectedProductId(realProducts[0].id);
      setOrderFoodItem(realProducts[0].name);
      setOrderPrice(realProducts[0].base_price);
    }
  }, [categories]);

  useEffect(() => {
    loadData();
  }, []);

  useWebSocket('all', (type) => {
    if (
      type === 'ONLINE_ORDER_INCOMING' ||
      type === 'ORDER_CREATED' ||
      type === 'ORDER_UPDATED' ||
      type === 'ORDER_PAID'
    ) {
      loadData();
    }
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [cData, dData] = await Promise.all([
        api.getCouriers(),
        api.getDeliveryOrders()
      ]);
      setCouriers(cData);
      setDeliveries(dData);
    } catch (e) {
      console.warn('Failed to load delivery data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateIncomingCall = async () => {
    sound.beep();
    try {
      const profile = await api.simulateCallerId(callerPhone);
      setCallerProfile(profile);
      setCustomerNameInput(profile?.customer_name || profile?.name || 'Müşteri');
      setCustomerAddressInput(profile?.address || (profile?.addresses && profile.addresses[0]) || 'Moda Cad. Kadıköy / İstanbul');
    } catch (e) {
      console.warn(e);
    }
  };

  const handleCreateCallerOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.beep();
    setLoading(true);
    try {
      await api.ingestOnlineOrder({
        platform: 'telefon',
        channel: 'telefon',
        customer_name: customerNameInput.trim() || callerProfile?.customer_name || 'Kayıtlı Müşteri',
        customer_phone: callerPhone,
        delivery_address: customerAddressInput.trim() || callerProfile?.address || 'Moda Cad. Kadıköy / İstanbul',
        items: [
          {
            product_id: selectedProductId,
            product_name: orderFoodItem,
            name: orderFoodItem,
            quantity: orderQty,
            unit_price: orderPrice,
            total_price: orderPrice * orderQty
          }
        ],
        payment_type: orderPaymentType,
        notes: orderNotes
      });
      sound.kitchenBell();
      showToast(`Sipariş başarıyla oluşturuldu ve mutfağa iletildi! (${customerNameInput || callerProfile?.customer_name || 'Müşteri'})`, 'success');
      setIsCreateOrderModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Sipariş oluşturulamadı.', 'error');
      sound.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleAssignCourier = async (deliveryId: number, courierId: number) => {
    sound.beep();
    try {
      await api.assignCourier(deliveryId, courierId);
      showToast('Sipariş kuryeye zimmetlendi ve yola çıktı.', 'success');
      await loadData();
    } catch (e) {
      sound.warning();
    }
  };

  const handleCompleteDelivery = async (deliveryId: number) => {
    sound.cashDrawer();
    try {
      await api.completeDelivery(deliveryId);
      showToast('Paket teslim edildi ve tahsilatı kasaya/kuryeye işlendi.', 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Teslimat tamamlanamadı.', 'error');
      sound.warning();
    }
  };

  const handleCourierSettlement = async (courier: Courier) => {
    if (!confirm(`${courier.name} için gün sonu nakit (₺${courier.cash_collected.toFixed(2)}) ve POS fişi (₺${courier.card_slips_collected.toFixed(2)}) mutabakatı kapatılacak. Onaylıyor musunuz?`)) return;
    sound.cashDrawer();
    try {
      await api.settleCourier(courier.id, courier.cash_collected, courier.card_slips_collected);
      showToast(`${courier.name} kasa mutabakatı başarıyla kapatıldı.`, 'success');
      await loadData();
    } catch (e) {
      sound.warning();
    }
  };

  const handleSimulateOnlineOrder = async (platformName: string) => {
    sound.beep();
    const chosenProduct = realProducts.length > 0
      ? realProducts[Math.floor(Math.random() * realProducts.length)]
      : { id: 1, name: 'Izgara Köfte', base_price: 360.0 };
    const qty = 2;
    try {
      await api.ingestOnlineOrder({
        platform: platformName,
        customer_name: `${platformName.toUpperCase()} Müşterisi`,
        customer_phone: '0544 555 66 77',
        delivery_address: 'Moda Cad. No:84 D:4 Kadıköy / İstanbul',
        payment_type: 'online_card',
        items: [
          {
            product_id: chosenProduct.id,
            name: chosenProduct.name,
            unit_price: chosenProduct.base_price,
            quantity: qty,
            total_price: chosenProduct.base_price * qty,
            kitchen_note: 'Kapıda temassız teslimat rica ederim.'
          }
        ],
        notes: `${platformName.toUpperCase()} Entegrasyon Siparişi`
      });
      showToast(`${platformName.toUpperCase()} siparişi alındı: ${qty}x ${chosenProduct.name}`, 'success');
      await loadData();
    } catch (e) {
      sound.warning();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none transition-colors duration-200">
      {/* Header & Quick Online Simulators */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Paket Servis, Kurye & Platform Hub</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Caller ID Müşteri Tanıma, Yemeksepeti / Getir / Trendyol Entegratörü</p>
        </div>

        {/* Aggregator Triggers using real menu items */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleSimulateOnlineOrder('yemeksepeti')}
            className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs shadow-md transition cursor-pointer"
          >
            + Yemeksepeti Siparişi Gönder
          </button>
          <button
            onClick={() => handleSimulateOnlineOrder('getir')}
            className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs shadow-md transition cursor-pointer"
          >
            + Getir Yemek Siparişi Gönder
          </button>
        </div>
      </div>

      {/* Top Row: Caller ID Simulator + Couriers Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Caller ID Simulator Box (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-blue-500 animate-pulse" />
              <span>Caller ID Santral Simülatörü</span>
            </h3>
            <span className="text-[10px] bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 font-bold px-2 py-0.5 rounded">
              Gelen Arama
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Arayan Numara:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={callerPhone}
                  onChange={(e) => setCallerPhone(e.target.value)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white font-mono font-bold"
                />
                <button
                  onClick={handleSimulateIncomingCall}
                  className="px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow cursor-pointer"
                >
                  Sorgula
                </button>
              </div>
            </div>

            {callerProfile && (
              <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/30 text-xs space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                  <span>{callerProfile.customer_name || callerProfile.name || 'Müşteri'}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                    {callerProfile.past_orders_count ?? 0} Geçmiş Sipariş
                  </span>
                </div>
                <div className="text-slate-600 dark:text-slate-300 flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-slate-400 mt-0.5" />
                  <span>{callerProfile.address || 'Moda Cad. Kadıköy / İstanbul'}</span>
                </div>
                {callerProfile.favorite_items && callerProfile.favorite_items.length > 0 && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Son Tercihler: <span className="font-bold text-slate-700 dark:text-slate-200">{callerProfile.favorite_items.join(', ')}</span>
                  </div>
                )}
                <button
                  onClick={() => {
                    sound.beep();
                    setIsCreateOrderModalOpen(true);
                  }}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs shadow mt-1 transition cursor-pointer"
                >
                  BU MÜŞTERİYE SİPARİŞ GİR
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Couriers Live Status & Settlement (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Bike className="w-5 h-5 text-emerald-500" />
              <span>Kurye Filosu & Kasa Mutabakatı</span>
            </h3>
            <button onClick={() => loadData()} className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {couriers.map((c) => (
              <div
                key={c.id}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white">{c.name}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.is_active
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {c.is_active ? 'Aktif Kurye' : 'Pasif'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Telefon / Plaka: <span className="text-slate-800 dark:text-slate-200 font-bold">{c.phone} {c.vehicle_plate ? `(${c.vehicle_plate})` : ''}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    <span>Zimmet Nakit: <strong className="font-mono text-emerald-600 dark:text-emerald-400">₺{c.cash_collected.toFixed(2)}</strong></span>
                    <span>POS Fişi: <strong className="font-mono text-blue-600 dark:text-blue-400">₺{c.card_slips_collected.toFixed(2)}</strong></span>
                  </div>
                </div>

                <button
                  onClick={() => handleCourierSettlement(c)}
                  disabled={c.cash_collected === 0 && c.card_slips_collected === 0}
                  className="mt-3 w-full py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 text-slate-800 dark:text-slate-200 text-[11px] font-bold transition cursor-pointer"
                >
                  Kurye Kasa Mutabakatı Kapat
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deliveries Queue Table */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Aktif Paket & Kurye Siparişleri</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <tr>
                <th className="py-3 px-4 font-bold">Kanal</th>
                <th className="py-3 px-4 font-bold">Müşteri</th>
                <th className="py-3 px-4 font-bold">Adres</th>
                <th className="py-3 px-4 font-bold">Tutar</th>
                <th className="py-3 px-4 font-bold">Atanan Kurye</th>
                <th className="py-3 px-4 font-bold">Durum</th>
                <th className="py-3 px-4 font-bold">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
              {deliveries.map((d) => {
                const chosenCourierId = selectedCourierByDelivery[d.id] || couriers[0]?.id || 1;
                return (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold font-mono uppercase text-[10px]">
                        {d.platform}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {d.customer_name}
                      <div className="text-[10px] text-slate-500 font-normal">{d.customer_phone}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs truncate">{d.delivery_address}</td>
                    <td className="py-3 px-4 font-mono font-black text-emerald-600 dark:text-emerald-400">₺{d.grand_total.toFixed(2)}</td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {d.courier_status === 'unassigned' && couriers.length > 0 ? (
                        <select
                          value={chosenCourierId}
                          onChange={(e) => setSelectedCourierByDelivery(prev => ({ ...prev, [d.id]: Number(e.target.value) }))}
                          className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] font-bold"
                        >
                          {couriers.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-bold">{d.courier_name || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        d.courier_status === 'on_the_way' || d.courier_status === 'assigned'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}>
                        {d.courier_status === 'on_the_way' ? 'Yolda' : d.courier_status === 'assigned' ? 'Kuryede' : 'Hazırlanıyor'}
                      </span>
                    </td>
                    <td className="py-3 px-4 flex items-center gap-2">
                      {d.courier_status === 'unassigned' && couriers.length > 0 && (
                        <button
                          onClick={() => handleAssignCourier(d.id, chosenCourierId)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] cursor-pointer"
                        >
                          Kuryeye Zimmetle
                        </button>
                      )}
                      {(d.courier_status === 'on_the_way' || d.courier_status === 'assigned') && (
                        <button
                          onClick={() => handleCompleteDelivery(d.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer"
                        >
                          ✓ Teslim Edildi
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-400 dark:text-slate-500">
                    Aktif paket teslimat kaydı bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast Notification Banner */}
      {toast && (
        <div className={`fixed bottom-6 right-6 text-white font-bold text-xs py-3 px-5 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce z-50 ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Modal: Telefonla Müşteri Siparişi Oluştur */}
      {isCreateOrderModalOpen && callerProfile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-blue-600 dark:text-blue-400">Yeni Paket Sipariş Oluştur</h3>
              <p className="text-xs text-slate-500 font-semibold">Telefon: {callerPhone}</p>
            </div>

            <form onSubmit={handleCreateCallerOrder} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-500 block mb-1">Müşteri Adı Soyadı:</label>
                <input
                  type="text"
                  value={customerNameInput}
                  onChange={(e) => setCustomerNameInput(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Teslimat Adresi:</label>
                <input
                  type="text"
                  value={customerAddressInput}
                  onChange={(e) => setCustomerAddressInput(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Menüden Ürün Seçin:</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    const pid = Number(e.target.value);
                    setSelectedProductId(pid);
                    const found = realProducts.find(p => p.id === pid);
                    if (found) {
                      setOrderFoodItem(found.name);
                      setOrderPrice(found.base_price);
                    }
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white font-bold"
                >
                  {realProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (₺{p.base_price.toFixed(2)})
                    </option>
                  ))}
                  {realProducts.length === 0 && (
                    <option value={1}>Kuzu Şiş (₺380.00)</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 block mb-1">Porsiyon / Adet:</label>
                  <input
                    type="number"
                    min={1}
                    value={orderQty}
                    onChange={(e) => setOrderQty(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-mono text-center"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Birim Fiyat (₺):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-mono text-center"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Ödeme Yöntemi:</label>
                <select
                  value={orderPaymentType}
                  onChange={(e) => setOrderPaymentType(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                >
                  <option value="nakit_kapida">Kapıda Nakit Ödeme</option>
                  <option value="pos_kapida">Kapıda Kredi Kartı (Mobil POS)</option>
                  <option value="sodexo_kapida">Kapıda Sodexo / Multinet</option>
                  <option value="online_odendi">Online Ödendi (Önceden Tahsil)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Sipariş & Mutfak Notu:</label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Zil çalmasın, sos ayrı vb."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOrderModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'İletiliyor...' : `Siparişi Onayla (₺${(orderPrice * orderQty).toFixed(2)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
