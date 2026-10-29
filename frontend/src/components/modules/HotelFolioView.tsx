import React, { useState, useEffect } from 'react';
import {
  Building2, BedDouble, PlusCircle, CheckCircle2, CreditCard,
  Receipt, RefreshCw, UserCheck, Calendar
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface HotelFolioItem {
  room_no: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  package: string;
  folio_balance: number;
  status: string;
  charges: Array<{ id: string; date: string; desc: string; amount: number }>;
}

export const HotelFolioView: React.FC = () => {
  const [folios, setFolios] = useState<HotelFolioItem[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRoom, setSelectedRoom] = useState<HotelFolioItem | null>(null);
  const [chargeAmount, setChargeAmount] = useState<string>('');
  const [chargeDesc, setChargeDesc] = useState<string>('Restoran Adisyon Harcaması');
  const [toastMsg, setToastMsg] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getHotelFolios();
      if (res) {
        setFolios(res.folios || []);
        setSummary(res.summary || {});
      }
    } catch (e) {
      console.error('Failed to load hotel folios', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) return;
    const amt = parseFloat(chargeAmount) || 0;
    if (amt <= 0) return;
    try {
      sound.cashDrawer();
      await api.addHotelCharge({
        room_no: selectedRoom.room_no,
        amount: amt,
        description: chargeDesc || 'Restoran Adisyon Harcaması'
      });
      setSelectedRoom(null);
      setChargeAmount('');
      setChargeDesc('Restoran Adisyon Harcaması');
      await loadData();
      showToast(`Oda ${selectedRoom.room_no} folyosuna ₺${amt.toFixed(2)} harcama eklendi!`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSettleFolio = async (roomNo: string) => {
    try {
      sound.cashDrawer();
      await api.settleHotelFolio(roomNo);
      await loadData();
      showToast(`Oda ${roomNo} folyo hesabı tahsil edildi ve sıfırlandı.`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              Otel Yönetim (PMS) & Oda Folyo Entegrasyonu
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-600 text-white uppercase">
              Adisyo Otel PMS
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Otel misafirlerinin restoran, bar ve oda servisi adisyonlarını doğrudan oda hesabına (Folyo) aktarın ve çıkışta tahsil edin.
          </p>
        </div>

        <button
          onClick={() => { sound.beep(); loadData(); }}
          className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-100 transition cursor-pointer self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Oda Folyolarını Yenile</span>
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Konaklayan Aktif Oda</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{summary.active_rooms || folios.length} Oda</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center">
            <BedDouble className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Açık Folyo Bakiyesi (Restoran)</div>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
              ₺{(summary.total_folio_balance || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">PMS Entegrasyon Durumu</div>
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">Canlı Senkronize (Online)</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Room Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {folios.map((room) => (
          <div
            key={room.room_no}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-orange-500 text-white font-black text-base flex items-center justify-center shadow-sm">
                    {room.room_no}
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900 dark:text-white">{room.guest_name}</h3>
                    <div className="text-xs text-slate-500 font-semibold">
                      Paket: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{room.package}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Folyo Bakiye</div>
                  <div className="text-lg font-black text-rose-600 dark:text-rose-400">
                    ₺{room.folio_balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl">
                <span><strong>Giriş:</strong> {room.check_in}</span>
                <span><strong>Çıkış:</strong> {room.check_out}</span>
              </div>

              {/* Charges History */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-black text-slate-400 uppercase">Son Oda Harcamaları</div>
                {room.charges && room.charges.length > 0 ? (
                  <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                    {room.charges.map((ch) => (
                      <div key={ch.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/60">
                        <span className="text-slate-600 dark:text-slate-300 truncate">{ch.desc} <em className="text-[10px] text-slate-400">({ch.date})</em></span>
                        <span className="font-bold text-slate-900 dark:text-white">₺{ch.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">Henüz ekstra restoran harcaması yok.</div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs gap-2">
              <button
                onClick={() => { sound.beep(); setSelectedRoom(room); }}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Odaya Adisyon Yansıt</span>
              </button>
              {room.folio_balance > 0 && (
                <button
                  onClick={() => handleSettleFolio(room.room_no)}
                  className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Folyo Kapat (Tahsil Et)</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Charge Modal */}
      {selectedRoom && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Oda {selectedRoom.room_no} — {selectedRoom.guest_name}
              </h3>
              <p className="text-xs text-slate-500">Restoran / Bar harcamasını oda folyosuna ekleyin</p>
            </div>
            <form onSubmit={handleAddCharge} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Harcama Tutarı (₺) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                  placeholder="Örn: 650"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-sm"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Açıklama / Departman</label>
                <input
                  type="text"
                  value={chargeDesc}
                  onChange={(e) => setChargeDesc(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedRoom(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 text-white font-black"
                >
                  Folyoya İşle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl text-xs font-black flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};
