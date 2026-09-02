import React, { useState, useEffect } from 'react';
import { 
  Bike, PhoneCall, MapPin, CheckCircle, Clock, 
  RefreshCw, DollarSign, UserCheck, AlertCircle 
} from 'lucide-react';
import { Courier, DeliveryOrder } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

export const DeliveryHub: React.FC = () => {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [callerPhone, setCallerPhone] = useState<string>('0532 111 22 33');
  const [callerProfile, setCallerProfile] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadData();
  }, []);

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
    } catch (e) {
      console.warn(e);
    }
  };

  const handleAssignCourier = async (deliveryId: number, courierId: number) => {
    sound.beep();
    try {
      await api.assignCourier(deliveryId, courierId);
      await loadData();
    } catch (e) {
      sound.warning();
    }
  };

  const handleCourierSettlement = async (courier: Courier) => {
    if (!confirm(`${courier.name} için gün sonu nakit (${courier.cash_collected}₺) mutabakatı kapatılacak. Onaylıyor musunuz?`)) return;
    sound.cashDrawer();
    try {
      await api.settleCourier(courier.id, courier.cash_collected, courier.card_slips_collected);
      await loadData();
    } catch (e) {
      sound.warning();
    }
  };

  const handleSimulateOnlineOrder = async (platformName: string) => {
    sound.beep();
    try {
      await api.ingestOnlineOrder({
        platform: platformName,
        customer_name: `${platformName.toUpperCase()} Müşterisi`,
        customer_phone: '0544 555 66 77',
        delivery_address: 'Moda Cad. No:84 D:4 Kadıköy / İstanbul',
        payment_type: 'online_card',
        items: [
          {
            name: 'BonBurger Klasik Menü',
            unit_price: 360.0,
            quantity: 2,
            total_price: 720.0,
            kitchen_note: 'Kapıda temassız teslimat rica ederim.'
          }
        ],
        notes: `${platformName.toUpperCase()} Entegrasyon Siparişi`
      });
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

        {/* Mock Aggregator Triggers */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSimulateOnlineOrder('yemeksepeti')}
            className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs shadow-md transition"
          >
            + Yemeksepeti Siparişi Gönder
          </button>
          <button
            onClick={() => handleSimulateOnlineOrder('getir')}
            className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs shadow-md transition"
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
                  className="px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow"
                >
                  Ara
                </button>
              </div>
            </div>

            {callerProfile && (
              <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/30 text-xs space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                  <span>{callerProfile.customer_name || 'Müşteri'}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                    {callerProfile.past_orders_count || 3} Geçmiş Sipariş
                  </span>
                </div>
                <div className="text-slate-600 dark:text-slate-300 flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-slate-400 mt-0.5" />
                  <span>{callerProfile.address || 'Moda Cad. Kadıköy / İstanbul'}</span>
                </div>
                <button
                  onClick={() => alert(`Masa dışı sipariş ekranına aktarıldı: ${callerProfile.customer_name}`)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs shadow mt-1"
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
            <button onClick={() => loadData()} className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white">
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
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Zimmet Nakit: <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">₺{c.cash_collected.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleCourierSettlement(c)}
                  disabled={c.cash_collected === 0}
                  className="mt-3 w-full py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 text-slate-800 dark:text-slate-200 text-[11px] font-bold transition"
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
              {deliveries.map((d) => (
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
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{d.courier_name || '-'}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px]">
                      {d.courier_status === 'on_the_way' ? 'Yolda' : d.courier_status === 'assigned' ? 'Kuryede' : 'Bekliyor'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {d.courier_status === 'unassigned' && couriers.length > 0 && (
                      <button
                        onClick={() => handleAssignCourier(d.id, couriers[0].id)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px]"
                      >
                        Kuryeye Zimmetle
                      </button>
                    )}
                  </td>
                </tr>
              ))}
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
    </div>
  );
};
