import React, { useState, useEffect, useCallback } from 'react';
import {
  Receipt, Search, Printer, Eye, RotateCcw, Calendar,
  CheckCircle2, AlertCircle, CreditCard, Banknote, Wallet,
  Clock, User, UtensilsCrossed, X, RefreshCw, ChevronRight
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';
import { printThermalReceipt } from '../fiscal/FiscalModal';
import { useWebSocket } from '../../services/websocket';

interface ClosedBillsReportProps {
  currentUser?: any;
  onOpenFiscalModal?: (orderId: number) => void;
  onRefreshGlobalData?: () => void;
  onNavigateToTable?: (tableId: number | null, orderId: number) => void;
  embedded?: boolean;
}

const DATE_OPTIONS = [
  { label: 'Bugün', value: 'today' },
  { label: 'Dün', value: 'yesterday' },
  { label: 'Bu Hafta', value: 'week' },
  { label: 'Bu Ay', value: 'month' },
  { label: 'Tüm Zamanlar', value: 'all' }
];

export const ClosedBillsReport: React.FC<ClosedBillsReportProps> = ({
  currentUser,
  onOpenFiscalModal,
  onRefreshGlobalData,
  onNavigateToTable,
  embedded = false
}) => {
  const [dateRange, setDateRange] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<any>(null);
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [reopeningId, setReopeningId] = useState<number | null>(null);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadClosedBills = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getClosedBillsReport({
        dateRange,
        search: searchQuery.trim() || undefined,
        paymentMethod: paymentFilter !== 'all' ? paymentFilter : undefined
      });
      setReportData(data);
    } catch (err) {
      console.warn('Failed to load closed bills report:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange, searchQuery, paymentFilter]);

  useEffect(() => {
    loadClosedBills();
  }, [loadClosedBills]);

  useWebSocket('all', (type) => {
    if (type === 'ORDER_PAID' || type === 'ORDER_UPDATED' || type === 'TABLE_STATUS_CHANGED') {
      loadClosedBills();
    }
  });

  const handlePrintBill = async (bill: any) => {
    sound.beep();
    setPrintingId(bill.id);
    try {
      const doc = await api.getEAdisyon(bill.id);
      await printThermalReceipt(doc);
      showToast(`Adisyon #${bill.order_no} yazıcıya gönderildi.`, 'success');
    } catch (err: any) {
      if (onOpenFiscalModal) {
        onOpenFiscalModal(bill.id);
      } else {
        showToast('Fiş yazdırılamadı.', 'error');
      }
    } finally {
      setPrintingId(null);
    }
  };

  const handleReopenTable = async (bill: any, goToPos: boolean = false) => {
    const confirmMsg = bill.table_id
      ? `"${bill.table_name}" masasını ve #${bill.order_no} numaralı adisyonu tekrar aktif (Açık Hesap) yapmak istediğinize emin misiniz?`
      : `#${bill.order_no} numaralı adisyonu tekrar aktif (Açık Hesap) yapmak istediğinize emin misiniz?`;
    if (!confirm(confirmMsg)) return;

    sound.beep();
    setReopeningId(bill.id);
    try {
      const res = await api.reopenClosedOrder(bill.id, currentUser?.name || 'Yönetici', true);
      sound.kitchenBell();
      showToast(res.message || 'Masa ve adisyon tekrar aktif edildi!', 'success');
      setSelectedBill(null);
      await loadClosedBills();
      if (onRefreshGlobalData) {
        onRefreshGlobalData();
      }
      if (goToPos && onNavigateToTable) {
        onNavigateToTable(res.table_id || bill.table_id || null, bill.id);
      }
    } catch (err: any) {
      sound.warning();
      showToast(err.message || 'Masa tekrar aktif edilemedi.', 'error');
    } finally {
      setReopeningId(null);
    }
  };

  const orders: any[] = reportData?.orders || [];

  return (
    <div className={`${embedded ? '' : 'flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 md:p-6'} space-y-5 text-slate-900 dark:text-slate-100 select-none font-sans`}>
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-extrabold animate-slideDown ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Header (if standalone page) */}
      {!embedded && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <span>Raporlar</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-red-600 font-bold">Kapatılan Adisyonlar</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <Receipt className="w-6 h-6 text-red-600" />
              <span>Kapatılan Adisyonlar & Geçmiş Fişler</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
              Kapatılan tüm adisyonları görüntüleyin, tekrar fiş yazdırın veya yanlışlıkla kapatılan masaları tek tıkla tekrar aktif edin.
            </p>
          </div>

          <button
            type="button"
            onClick={() => { sound.beep(); loadClosedBills(); }}
            className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-extrabold flex items-center gap-2 shadow-xs cursor-pointer self-start md:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-red-600' : 'text-slate-500'}`} />
            <span>Listeyi Yenile</span>
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-1">
            <span>KAPATILAN ADİSYON</span>
            <Receipt className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
            {reportData?.total_closed_count ?? 0} <span className="text-xs font-bold text-slate-400">Adet</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-1">
            <span>TOPLAM TAHSİLAT</span>
            <Wallet className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            ₺{Number(reportData?.total_turnover ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-1">
            <span>NAKİT TAHSİLAT</span>
            <Banknote className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
            ₺{Number(reportData?.cash_total ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-1">
            <span>KREDİ KARTI</span>
            <CreditCard className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
            ₺{Number(reportData?.card_total ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Filter Bar: Date Range + Payment Method + Search */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-xs">
        {/* Date Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0 mr-1" />
          {DATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { sound.beep(); setDateRange(opt.value); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${
                dateRange === opt.value
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Payment Method & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 max-w-xl">
          <select
            value={paymentFilter}
            onChange={(e) => { sound.beep(); setPaymentFilter(e.target.value); }}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
          >
            <option value="all">Tüm Ödeme Tipleri</option>
            <option value="cash">Nakit</option>
            <option value="credit_card">Kredi Kartı</option>
            <option value="sodexo">Sodexo / Multinet</option>
            <option value="open_account">Açık Hesap (Cari)</option>
          </select>

          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Masa adı, adisyon no, garson veya ürün ara..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>
      </div>

      {/* Closed Bills Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-extrabold uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Adisyon No</th>
                <th className="py-3.5 px-4">Masa / Kanal</th>
                <th className="py-3.5 px-4">Açılış / Kapanış</th>
                <th className="py-3.5 px-4">Garson / Kasiyer</th>
                <th className="py-3.5 px-4">Ürün İçeriği</th>
                <th className="py-3.5 px-4">Ödeme Tipi</th>
                <th className="py-3.5 px-4 text-right">Tutar</th>
                <th className="py-3.5 px-4 text-center">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-semibold">
              {orders.map((bill) => {
                const activeItems = (bill.items || []).filter((i: any) => !i.is_voided);
                const previewText = activeItems
                  .slice(0, 3)
                  .map((i: any) => `${Number.isInteger(i.quantity) ? i.quantity + 'x' : i.quantity + ' Kg'} ${i.product_name}`)
                  .join(', ');
                const extraCount = activeItems.length > 3 ? ` +${activeItems.length - 3} ürün` : '';

                return (
                  <tr
                    key={bill.id}
                    className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-black text-slate-900 dark:text-white">
                        #{bill.order_no}
                      </span>
                      <div className="mt-0.5">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                          bill.status === 'paid'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                            : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                        }`}>
                          {bill.status === 'paid' ? 'Ödendi / Kapalı' : 'İptal Edildi'}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white">
                        <UtensilsCrossed className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span>{bill.table_name}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      <div>Açılış: {bill.created_at}</div>
                      <div className="text-slate-700 dark:text-slate-300 font-bold">Kapanış: {bill.closed_at}</div>
                    </td>

                    <td className="py-3.5 px-4 text-xs">
                      <div className="flex items-center gap-1 text-slate-800 dark:text-slate-200 font-bold">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{bill.waiter_name}</span>
                      </div>
                      {bill.cashier_name && (
                        <div className="text-[10px] text-slate-400">Kasa: {bill.cashier_name}</div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="text-slate-700 dark:text-slate-300 line-clamp-2 text-xs">
                        {previewText || 'Ürün yok'}{extraCount}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {(bill.payments || []).length > 0 ? (
                          bill.payments.map((p: any, pIdx: number) => (
                            <span
                              key={pIdx}
                              className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                            >
                              {p.label}: ₺{Number(p.amount).toFixed(2)}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400">-</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                      ₺{Number(bill.grand_total).toFixed(2)}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* 1. Adisyonu Görüntüle */}
                        <button
                          type="button"
                          onClick={() => { sound.beep(); setSelectedBill(bill); }}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-extrabold text-[11px] flex items-center gap-1 transition cursor-pointer"
                          title="Adisyon Detayını Görüntüle"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>Görüntüle</span>
                        </button>

                        {/* 2. Adisyonu Yazdır */}
                        <button
                          type="button"
                          disabled={printingId === bill.id}
                          onClick={() => handlePrintBill(bill)}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-extrabold text-[11px] flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                          title="Adisyon Fişini Yazdır"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>{printingId === bill.id ? 'Yazdırılıyor...' : 'Yazdır'}</span>
                        </button>

                        {/* 3. Masayı Tekrar Aktif Et */}
                        <button
                          type="button"
                          disabled={reopeningId === bill.id}
                          onClick={() => handleReopenTable(bill, false)}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] shadow-xs flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                          title="Kapatılan Masayı ve Adisyonu Tekrar Aktif Et"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{reopeningId === bill.id ? 'Açılıyor...' : 'Masayı Aktif Et'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400 font-bold text-xs">
                    Seçilen tarih ve filtre kriterlerine uygun kapatılmış adisyon bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= ADİSYON DETAY & GÖRÜNTÜLEME MODALI ================= */}
      {selectedBill && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-600/15 text-red-600 dark:text-red-400 flex items-center justify-center border border-red-500/30">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {selectedBill.table_name} • Adisyon #{selectedBill.order_no}
                  </h3>
                  <p className="text-[11px] font-semibold text-slate-500">
                    Açılış: {selectedBill.created_at} • Kapanış: {selectedBill.closed_at}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBill(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Receipt Details */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 font-semibold">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Garson</span>
                  <span className="text-slate-900 dark:text-white font-black">{selectedBill.waiter_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Kasiyer</span>
                  <span className="text-slate-900 dark:text-white font-black">{selectedBill.cashier_name}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] font-extrabold uppercase text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Ürün</th>
                      <th className="py-2.5 px-2 text-center">Miktar</th>
                      <th className="py-2.5 px-2 text-right">Birim</th>
                      <th className="py-2.5 px-3 text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                    {(selectedBill.items || []).map((it: any, idx: number) => (
                      <tr key={idx} className={it.is_voided ? 'opacity-40 line-through' : ''}>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {it.product_name}
                            {it.variant_name && <span className="ml-1 text-[10px] text-blue-600">({it.variant_name})</span>}
                          </div>
                          {it.kitchen_note && (
                            <div className="text-[10px] text-amber-600">Not: {it.kitchen_note}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono font-bold">
                          {Number.isInteger(Number(it.quantity)) ? `${it.quantity}x` : `${Number(Number(it.quantity).toFixed(3))} Kg`}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-500">
                          ₺{Number(it.unit_price).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 dark:text-white">
                          ₺{Number(it.total_price).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals & Payments */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 space-y-1.5 font-semibold">
                <div className="flex justify-between text-slate-500">
                  <span>Ara Toplam:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">₺{Number(selectedBill.subtotal).toFixed(2)}</span>
                </div>
                {selectedBill.service_charge > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>Servis Ücreti:</span>
                    <span className="font-mono font-bold">+₺{Number(selectedBill.service_charge).toFixed(2)}</span>
                  </div>
                )}
                {selectedBill.discount_amount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>İndirim:</span>
                    <span className="font-mono font-bold">-₺{Number(selectedBill.discount_amount).toFixed(2)}</span>
                  </div>
                )}
                {selectedBill.treat_amount > 0 && (
                  <div className="flex justify-between text-purple-600">
                    <span>İkram:</span>
                    <span className="font-mono font-bold">-₺{Number(selectedBill.treat_amount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                  <span>GENEL TOPLAM:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">₺{Number(selectedBill.grand_total).toFixed(2)}</span>
                </div>

                {(selectedBill.payments || []).length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Alınan Ödemeler</span>
                    {selectedBill.payments.map((p: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs font-bold text-blue-600 dark:text-blue-400">
                        <span>{p.label} {p.created_at && `(${p.created_at})`}</span>
                        <span className="font-mono">₺{Number(p.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer: Print, Fiscal Preview, and Reopen Table */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintBill(selectedBill)}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Adisyonu Yazdır</span>
                </button>

                {onOpenFiscalModal && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = selectedBill.id;
                      setSelectedBill(null);
                      onOpenFiscalModal(id);
                    }}
                    className="px-3 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
                  >
                    E-Adisyon Önizleme
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={reopeningId === selectedBill.id}
                onClick={() => handleReopenTable(selectedBill, true)}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Masayı Tekrar Aktif Et</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
