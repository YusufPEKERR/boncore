import React, { useState, useEffect } from 'react';
import {
  Calendar, Clock, Users, Phone, Plus, CheckCircle2, XCircle,
  UtensilsCrossed, Sparkles, Trash2, RefreshCw
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface ReservationItem {
  id: string;
  guest_name: string;
  phone: string;
  guests_count: number;
  date: string;
  time: string;
  table_name: string;
  status: 'confirmed' | 'seated' | 'completed' | 'cancelled';
  notes: string;
  deposit: number;
}

export const ReservationsView: React.FC = () => {
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string>('');

  const [newRes, setNewRes] = useState({
    guest_name: '',
    phone: '',
    guests_count: 4,
    date: new Date().toISOString().slice(0, 10),
    time: '19:30',
    table_name: 'Salon 4',
    notes: '',
    deposit: 0
  });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getReservations();
      if (res) {
        setReservations(res.reservations || []);
        setSummary(res.summary || {});
      }
    } catch (e) {
      console.error('Failed to load reservations', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRes.guest_name.trim()) return;
    try {
      sound.cashDrawer();
      await api.createReservation(newRes);
      setIsAddModalOpen(false);
      setNewRes({
        guest_name: '',
        phone: '',
        guests_count: 4,
        date: new Date().toISOString().slice(0, 10),
        time: '19:30',
        table_name: 'Salon 4',
        notes: '',
        deposit: 0
      });
      await loadData();
      showToast('Yeni masa rezervasyonu kaydedildi!');
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (resId: string, status: string) => {
    try {
      sound.beep();
      await api.updateReservationStatus(resId, status);
      await loadData();
      showToast('Rezervasyon durumu güncellendi.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (resId: string) => {
    try {
      sound.beep();
      await api.deleteReservation(resId);
      await loadData();
      showToast('Rezervasyon silindi.');
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = reservations.filter(r => statusFilter === 'all' || r.status === statusFilter);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              Masa Rezervasyon & Misafir Planlama
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white uppercase">
              Adisyo Rezervasyon
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gelen rezervasyon taleplerini, masa atamalarını, kapora (ön ödeme) bilgilerini ve misafir karşılama durumunu yönetin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.beep(); loadData(); }}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-100 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
          <button
            onClick={() => { sound.beep(); setIsAddModalOpen(true); }}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Rezervasyon Ekle</span>
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Toplam Rezervasyon</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{summary.total_reservations || reservations.length}</div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Onaylı Bekleyen</div>
          <div className="text-2xl font-black text-amber-500 mt-1">{summary.confirmed_count || 0}</div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Masaya Oturtulan</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{summary.seated_count || 0}</div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Toplam Gelecek Misafir</div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{summary.expected_guests || 0} Kişi</div>
        </div>
      </div>

      {/* Status Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'all', label: 'Tümü' },
          { id: 'confirmed', label: 'Onaylı / Bekleyen' },
          { id: 'seated', label: 'Masada (Geldi)' },
          { id: 'completed', label: 'Tamamlandı' },
          { id: 'cancelled', label: 'İptal Edildi' }
        ].map(f => (
          <button
            key={f.id}
            onClick={() => { sound.beep(); setStatusFilter(f.id); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              statusFilter === f.id
                ? 'bg-rose-600 text-white'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((res) => (
          <div
            key={res.id}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-4"
          >
            <div className="space-y-2.5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-base text-slate-900 dark:text-white">{res.guest_name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{res.phone}</span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                  res.status === 'confirmed'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : res.status === 'seated'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : res.status === 'cancelled'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {res.status === 'confirmed' ? 'Onaylı' : res.status === 'seated' ? 'Masada' : res.status === 'cancelled' ? 'İptal' : 'Tamamlandı'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold">TARİH / SAAT</div>
                  <div className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{res.time}</div>
                  <div className="text-[10px] text-slate-500">{res.date}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold">MASA</div>
                  <div className="font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">{res.table_name}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold">KİŞİ / KAPORA</div>
                  <div className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{res.guests_count} Kişi</div>
                  {res.deposit > 0 && <div className="text-[10px] text-emerald-600 font-bold">₺{res.deposit} Kapora</div>}
                </div>
              </div>

              {res.notes && (
                <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold bg-amber-50/60 dark:bg-amber-950/30 px-3 py-1.5 rounded-xl">
                  Not: {res.notes}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {res.status === 'confirmed' && (
                  <button
                    onClick={() => handleStatusChange(res.id, 'seated')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition cursor-pointer"
                  >
                    Masaya Oturt
                  </button>
                )}
                {res.status === 'seated' && (
                  <button
                    onClick={() => handleStatusChange(res.id, 'completed')}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition cursor-pointer"
                  >
                    Tamamla
                  </button>
                )}
                {res.status !== 'cancelled' && (
                  <button
                    onClick={() => handleStatusChange(res.id, 'cancelled')}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 text-slate-600 hover:text-rose-600 font-bold transition cursor-pointer"
                  >
                    İptal Et
                  </button>
                )}
              </div>
              <button
                onClick={() => handleDelete(res.id)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 transition cursor-pointer"
                title="Sil"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Reservation Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Yeni Masa Rezervasyonu</h3>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Misafir Adı Soyadı *</label>
                <input
                  type="text"
                  required
                  value={newRes.guest_name}
                  onChange={(e) => setNewRes({ ...newRes, guest_name: e.target.value })}
                  placeholder="Örn: Selin Demir"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Telefon *</label>
                  <input
                    type="text"
                    required
                    value={newRes.phone}
                    onChange={(e) => setNewRes({ ...newRes, phone: e.target.value })}
                    placeholder="0532 000 00 00"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Kişi Sayısı</label>
                  <input
                    type="number"
                    min={1}
                    value={newRes.guests_count}
                    onChange={(e) => setNewRes({ ...newRes, guests_count: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Tarih</label>
                  <input
                    type="date"
                    value={newRes.date}
                    onChange={(e) => setNewRes({ ...newRes, date: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Saat</label>
                  <input
                    type="time"
                    value={newRes.time}
                    onChange={(e) => setNewRes({ ...newRes, time: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Masa / Bölge</label>
                  <input
                    type="text"
                    value={newRes.table_name}
                    onChange={(e) => setNewRes({ ...newRes, table_name: e.target.value })}
                    placeholder="Bahçe 3 / Salon 5"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Alınan Kapora (₺)</label>
                  <input
                    type="number"
                    value={newRes.deposit}
                    onChange={(e) => setNewRes({ ...newRes, deposit: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Özel Not (Doğum Günü, Mama Sandalyesi vb.)</label>
                <input
                  type="text"
                  value={newRes.notes}
                  onChange={(e) => setNewRes({ ...newRes, notes: e.target.value })}
                  placeholder="Örn: Yıldönümü kutlaması, cam kenarı"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 text-white font-black"
                >
                  Rezervasyonu Oluştur
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
