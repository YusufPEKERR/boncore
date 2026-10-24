import React, { useState, useEffect } from 'react';
import { 
  FileText, Calendar, Printer, Download, CheckCircle2, 
  AlertCircle, DollarSign, Wallet, CreditCard, ShieldCheck, 
  Clock, User, RefreshCw, ChevronRight, X, Lock, Check,
  TrendingUp, Users, Utensils, Receipt, Archive, ArrowRight
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';
import { useWebSocket } from '../../services/websocket';

interface PaymentMethodSummary {
  name: string;
  amount: number;
  count: number;
  color: string;
  percent: number;
}

interface VatSummaryItem {
  rate: string;
  base: number;
  tax: number;
  total: number;
}

interface DayEndData {
  date: string;
  formatted_date: string;
  report_generated_at: string;
  z_report_no: string;
  is_closed: boolean;
  register_id: number | null;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  closed_by: string | null;
  financial_summary: {
    gross_sales: number;
    net_turnover: number;
    total_discounts: number;
    total_treats: number;
    void_total_amount: number;
    void_items_count: number;
    kuver_revenue: number;
    total_kuver: number;
    total_orders: number;
    paid_orders_count: number;
    open_orders_count: number;
    average_ticket: number;
  };
  cash_flow: {
    opening_float: number;
    cash_sales: number;
    cash_in: number;
    cash_out: number;
    expected_drawer_cash: number;
    expenses_list: { category: string; amount: number; type: string; description: string }[];
  };
  payment_methods: PaymentMethodSummary[];
  vat_breakdown: {
    vat_1: VatSummaryItem;
    vat_10: VatSummaryItem;
    vat_20: VatSummaryItem;
    total_base: number;
    total_tax: number;
  };
  channels: { name: string; orders: number; turnover: number; share: number }[];
  waiters: { waiter_name: string; orders_count: number; turnover: number }[];
  departments: { name: string; quantity: number; turnover: number }[];
}

export const DayEndReport: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState<boolean>(true);
  const [report, setReport] = useState<DayEndData | null>(null);
  const [activeTab, setActiveTab] = useState<'payments' | 'cash' | 'vat' | 'channels' | 'staff'>('payments');

  // Modals
  const [isCloseRegisterModalOpen, setIsCloseRegisterModalOpen] = useState<boolean>(false);
  const [managerPin, setManagerPin] = useState<string>('9999');
  const [managerName, setManagerName] = useState<string>('Müdür / Yönetici');
  const [closeRegisterLoading, setCloseRegisterLoading] = useState<boolean>(false);

  const [isThermalReceiptOpen, setIsThermalReceiptOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [zHistory, setZHistory] = useState<any[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadReport = async (dateStr: string = selectedDate) => {
    setLoading(true);
    try {
      const res = await api.getDayEndReport(dateStr);
      setReport(res);
    } catch (err) {
      console.warn('Failed to load day end report:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const hist = await api.getZReportHistory();
      setZHistory(hist || []);
    } catch (err) {
      console.warn('Failed to load Z history:', err);
    }
  };

  useEffect(() => {
    loadReport(selectedDate);
  }, [selectedDate]);

  useWebSocket('all', (type) => {
    if (type === 'ORDER_PAID' || type === 'Z_REPORT_GENERATED' || type === 'ORDER_CREATED') {
      loadReport(selectedDate);
    }
  });

  const handleCloseRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (managerPin !== '9999' && managerPin !== '1234') {
      sound.warning();
      alert('Geçersiz yönetici PIN kodu! (Varsayılan: 9999)');
      return;
    }

    setCloseRegisterLoading(true);
    try {
      const res = await api.closeDayEndRegister(managerName || 'Yönetici');
      sound.cashDrawer();
      setIsCloseRegisterModalOpen(false);
      setToastMessage(`Gün sonu başarıyla kapatıldı! Z No: ${res.z_report_no || 'Z-RAPORU'}`);
      await loadReport(selectedDate);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      sound.warning();
      alert(err.message || 'Kasa kapatılamadı.');
    } finally {
      setCloseRegisterLoading(false);
    }
  };

  const exportCSV = () => {
    if (!report) return;
    sound.beep();
    const rows = [
      ['Rapor Türü', 'Mali Gün Sonu Raporu (Z)'],
      ['Tarih', report.formatted_date],
      ['Z Rapor No', report.z_report_no],
      ['Kasa Durumu', report.is_closed ? 'KAPALI (Z Alindi)' : 'ACIK (Gun Devam Ediyor)'],
      ['Brüt Satış', report.financial_summary.gross_sales.toFixed(2)],
      ['Net Ciro', report.financial_summary.net_turnover.toFixed(2)],
      ['İndirimler', report.financial_summary.total_discounts.toFixed(2)],
      ['İkramlar', report.financial_summary.total_treats.toFixed(2)],
      ['İptaller (Void)', report.financial_summary.void_total_amount.toFixed(2)],
      ['Kasadaki Net Nakit', report.cash_flow.expected_drawer_cash.toFixed(2)],
      ['Toplam Sipariş', report.financial_summary.total_orders],
      ['Toplam Kuver', report.financial_summary.total_kuver],
      ['', ''],
      ['Ödeme Yöntemi', 'Tutar (TL)', 'Adet', 'Yüzde (%)'],
      ...report.payment_methods.map(p => [p.name, p.amount.toFixed(2), p.count, `%${p.percent}`]),
      ['', ''],
      ['KDV Oranı', 'Matrah (TL)', 'Hesaplanan KDV (TL)', 'Toplam (TL)'],
      ['%1 KDV', report.vat_breakdown.vat_1.base.toFixed(2), report.vat_breakdown.vat_1.tax.toFixed(2), report.vat_breakdown.vat_1.total.toFixed(2)],
      ['%10 KDV', report.vat_breakdown.vat_10.base.toFixed(2), report.vat_breakdown.vat_10.tax.toFixed(2), report.vat_breakdown.vat_10.total.toFixed(2)],
      ['%20 KDV', report.vat_breakdown.vat_20.base.toFixed(2), report.vat_breakdown.vat_20.tax.toFixed(2), report.vat_breakdown.vat_20.total.toFixed(2)],
      ['Genel KDV Toplamı', report.vat_breakdown.total_base.toFixed(2), report.vat_breakdown.total_tax.toFixed(2), (report.vat_breakdown.total_base + report.vat_breakdown.total_tax).toFixed(2)]
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(r => r.join(';')).join('\n');
    const encoded = encodeURI(csvContent);
    const a = document.createElement('a');
    a.href = encoded;
    a.download = `Gun_Sonu_Z_Raporu_${report.date}.csv`;
    a.click();
    setToastMessage('Gün sonu CSV raporu indirildi.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4 md:p-6 space-y-6">
      {/* Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg font-bold text-xs flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <span>Raporlar</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-red-600 font-bold">Gün Sonu Raporu (Z)</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Receipt className="w-6 h-6 text-red-600" />
            Mali Gün Sonu Raporu (Z Raporu)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Günlük mali hasılat, ödeme dağılımı, yasal KDV dökümü, nakit akışı ve kasa devir kapanışı
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Picker */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent font-bold outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => {
              sound.beep();
              loadReport();
            }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-600' : ''}`} />
            <span>Yenile</span>
          </button>

          <button
            onClick={() => {
              sound.beep();
              loadHistory();
              setIsHistoryModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <Archive className="w-3.5 h-3.5 text-slate-500" />
            <span>Geçmiş Z'ler</span>
          </button>

          <button
            onClick={() => {
              sound.beep();
              setIsThermalReceiptOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white shadow-sm transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Termal Z Fişi</span>
          </button>

          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel / CSV</span>
          </button>

          {!report?.is_closed ? (
            <button
              onClick={() => {
                sound.beep();
                setIsCloseRegisterModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20 transition animate-pulse"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Gün Sonunu Kapat (Z Al)</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Z Raporu Alındı ({report?.z_report_no})</span>
            </div>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
        report?.is_closed
          ? 'bg-slate-900 text-white border-slate-800'
          : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
            report?.is_closed ? 'bg-slate-800 text-slate-300' : 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
          }`}>
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                report?.is_closed ? 'bg-slate-800 text-slate-300' : 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
              }`}>
                {report?.is_closed ? 'GÜN SONU TAMAMLANDI' : 'GÜN DEVAM EDİYOR (CANLI ARA Z)'}
              </span>
              <span className="font-mono text-xs font-extrabold">{report?.z_report_no}</span>
            </div>
            <div className="text-xs opacity-80 mt-0.5">
              Tarih: <span className="font-semibold">{report?.formatted_date}</span> | Açılış: {report?.opened_at} {report?.closed_at && `| Kapanış: ${report?.closed_at}`} | Kasiyer: {report?.opened_by} {report?.closed_by && `| Onaylayan: ${report.closed_by}`}
            </div>
          </div>
        </div>

        <div className="text-right sm:border-l sm:pl-4 border-slate-300 dark:border-slate-700">
          <span className="text-[11px] opacity-75 uppercase font-bold block">Gün Sonu Net Hasılat</span>
          <span className="text-xl font-black font-mono">
            ₺{(report?.financial_summary.net_turnover || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Ciro */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Net Satış (Ciro)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              ₺{(report?.financial_summary.net_turnover || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            KDV Dahil Net Tahsilat ({report?.financial_summary.total_orders || 0} Adisyon)
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>

        {/* Brüt Satış */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Brüt Satış Tutarı</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              ₺{(report?.financial_summary.gross_sales || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            İndirim ve ikramlar öncesi toplam
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
        </div>

        {/* Kasadaki Net Nakit */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Çekmecedeki Net Nakit</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              ₺{(report?.cash_flow.expected_drawer_cash || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Devir: ₺{report?.cash_flow.opening_float || 0} + Nakit: ₺{report?.cash_flow.cash_sales || 0}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
        </div>

        {/* İndirim ve İkram */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">İndirim & İkram & İptal</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-purple-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              ₺{((report?.financial_summary.total_discounts || 0) + (report?.financial_summary.total_treats || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            İptal: ₺{report?.financial_summary.void_total_amount || 0} ({report?.financial_summary.void_items_count || 0} kalem)
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-500" />
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto text-xs font-bold">
        {[
          { id: 'payments', label: '1. Ödeme Yöntemleri Dağılımı' },
          { id: 'cash', label: '2. Kasa & Nakit Akışı' },
          { id: 'vat', label: '3. Resmi KDV Dağılımı' },
          { id: 'channels', label: '4. Satış Kanalları & Masa' },
          { id: 'staff', label: '5. Personel Performansı' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => {
              sound.beep();
              setActiveTab(t.id as any);
            }}
            className={`px-3 py-2 rounded-xl transition whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Payment Methods */}
      {activeTab === 'payments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              Ödeme Tiplerine Göre Tahsilat Tablosu
            </h3>

            <div className="space-y-3">
              {report?.payment_methods.map((pm, idx) => (
                <div key={idx} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800 dark:text-slate-200">{pm.name}</span>
                    <span className="font-mono text-sm text-slate-900 dark:text-white">
                      ₺{pm.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, pm.percent)}%`, backgroundColor: pm.color || '#3b82f6' }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{pm.count} işlem</span>
                    <span className="font-bold text-slate-600 dark:text-slate-300">%{pm.percent.toFixed(1)} pay</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2 mb-3">
                <Receipt className="w-4 h-4 text-emerald-600" />
                Mali Tahsilat Dengesi
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Gün boyunca gerçekleştirilen tüm tahsilat yöntemlerinin oransal ve tutarsal dökümü
              </p>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 font-semibold">Toplam Ödenen Adisyon:</span>
                  <span className="font-bold">{report?.financial_summary.paid_orders_count || 0} Adet</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 font-semibold">Açık / Masada Kalan Sipariş:</span>
                  <span className="font-bold text-amber-600">{report?.financial_summary.open_orders_count || 0} Adet</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 font-semibold">Masa Başına Ortalama Harcama:</span>
                  <span className="font-bold font-mono">₺{report?.financial_summary.average_ticket.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 font-semibold">Toplam Kuver / Misafir:</span>
                  <span className="font-bold">{report?.financial_summary.total_kuver || 0} Kişi</span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Tahsil Edilen Toplam Tutar</div>
                <div className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  ₺{report?.payment_methods.reduce((sum, p) => sum + p.amount, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <ShieldCheck className="w-8 h-8 text-emerald-500 opacity-60" />
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Cash Flow */}
      {activeTab === 'cash' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-600" />
              Nakit Kasa Mutabakatı (Çekmece Durumu)
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                <span className="text-slate-600 dark:text-slate-300 font-bold">(+) Gün Başı Devir Nakit (Float)</span>
                <span className="font-mono font-bold">₺{report?.cash_flow.opening_float.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 font-bold">
                <span>(+) Gün İçi Nakit Satışlar</span>
                <span className="font-mono">₺{report?.cash_flow.cash_sales.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 font-bold">
                <span>(+) Kasa Nakit Girişleri</span>
                <span className="font-mono">₺{report?.cash_flow.cash_in.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 font-bold">
                <span>(-) Kasa Çıkışları / Masraflar</span>
                <span className="font-mono">-₺{report?.cash_flow.cash_out.toFixed(2)}</span>
              </div>
              <div className="p-4 rounded-xl bg-amber-500 text-white font-bold flex items-center justify-between text-sm shadow-md shadow-amber-500/20">
                <span>(=) Çekmecede Olması Gereken Nakit</span>
                <span className="font-mono font-black text-lg">₺{report?.cash_flow.expected_drawer_cash.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-600" />
              Kasa Masraf ve Hareketleri ({report?.cash_flow.expenses_list.length || 0})
            </h3>

            <div className="overflow-y-auto max-h-72 space-y-2">
              {report?.cash_flow.expenses_list.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400">
                  Bugün kasadan herhangi bir masraf veya para çıkışı yapılmadı.
                </div>
              ) : (
                report?.cash_flow.expenses_list.map((exp, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">{exp.category}</div>
                      <div className="text-[10px] text-slate-400">{exp.description}</div>
                    </div>
                    <span className={`font-mono font-extrabold ${exp.type === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {exp.type === 'in' ? '+' : '-'}₺{exp.amount.toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Official VAT Breakdown */}
      {activeTab === 'vat' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-red-600" />
              Yasal Mali KDV Dağılım Tablosu (Gelir İdaresi Standartları)
            </h3>
            <span className="text-xs text-slate-400">KDV Matrah & Vergi Dökümü</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-3 px-4">Vergi Oranı</th>
                  <th className="py-3 px-4">Açıklama</th>
                  <th className="py-3 px-4 text-right">KDV Hariç Matrah (₺)</th>
                  <th className="py-3 px-4 text-right">Hesaplanan KDV (₺)</th>
                  <th className="py-3 px-4 text-right font-black">Genel Toplam (₺)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                <tr>
                  <td className="py-3.5 px-4 font-bold text-blue-600">%1 KDV</td>
                  <td className="py-3.5 px-4 text-slate-400">Temel Gıda / Ekmek / Paket Fırın</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold">₺{report?.vat_breakdown.vat_1.base.toFixed(2)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-red-600">₺{report?.vat_breakdown.vat_1.tax.toFixed(2)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900 dark:text-white">₺{report?.vat_breakdown.vat_1.total.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 font-bold text-emerald-600">%10 KDV</td>
                  <td className="py-3.5 px-4 text-slate-400">Restoran Yeme-İçme Hizmetleri</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold">₺{report?.vat_breakdown.vat_10.base.toFixed(2)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-red-600">₺{report?.vat_breakdown.vat_10.tax.toFixed(2)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900 dark:text-white">₺{report?.vat_breakdown.vat_10.total.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 font-bold text-amber-600">%20 KDV</td>
                  <td className="py-3.5 px-4 text-slate-400">Alkollü İçecekler / Özel Tüketim</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold">₺{report?.vat_breakdown.vat_20.base.toFixed(2)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-red-600">₺{report?.vat_breakdown.vat_20.tax.toFixed(2)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900 dark:text-white">₺{report?.vat_breakdown.vat_20.total.toFixed(2)}</td>
                </tr>
                <tr className="bg-slate-50 dark:bg-slate-800/80 font-black text-sm">
                  <td colSpan={2} className="py-4 px-4 text-slate-900 dark:text-white uppercase tracking-wider">
                    GENEL TOPLAM (KDV MATRAH VE VERGİ)
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-slate-900 dark:text-white">
                    ₺{report?.vat_breakdown.total_base.toFixed(2)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-red-600">
                    ₺{report?.vat_breakdown.total_tax.toFixed(2)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 text-base">
                    ₺{((report?.vat_breakdown.total_base || 0) + (report?.vat_breakdown.total_tax || 0)).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Channels & Table Operations */}
      {activeTab === 'channels' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Utensils className="w-4 h-4 text-blue-600" />
              Satış Kanalları Dağılımı
            </h3>

            <div className="space-y-3">
              {report?.channels.map((ch, idx) => (
                <div key={idx} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800 dark:text-slate-200">{ch.name}</span>
                    <span className="font-mono text-sm">₺{ch.turnover.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, ch.share)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{ch.orders} sipariş</span>
                    <span className="font-bold text-slate-600 dark:text-slate-300">%{ch.share.toFixed(1)} pay</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              Masa ve Müşteri Operasyonu
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Toplam İşlem Gören Sipariş:</span>
                <span className="font-bold text-sm">{report?.financial_summary.total_orders || 0} Adet</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Toplam Misafir (Kuver):</span>
                <span className="font-bold text-sm">{report?.financial_summary.total_kuver || 0} Kişi</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Kuver Bedeli Hasılatı:</span>
                <span className="font-mono font-bold text-sm">₺{report?.financial_summary.kuver_revenue.toFixed(2)}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Ortalama Adisyon Tutarı:</span>
                <span className="font-mono font-bold text-sm text-emerald-600">₺{report?.financial_summary.average_ticket.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Staff Performance */}
      {activeTab === 'staff' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-600" />
            Personel (Garson) Bazında Ciro ve Adisyon Dağılımı
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {report?.waiters.map((w, idx) => (
              <div key={idx} className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-extrabold text-slate-900 dark:text-white">
                  <span>{w.waiter_name}</span>
                  <span className="font-mono text-emerald-600">₺{w.turnover.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>{w.orders_count} adisyon kapattı</span>
                  <span>Ort: ₺{(w.orders_count > 0 ? w.turnover / w.orders_count : 0).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Close Register Confirmation Modal */}
      {isCloseRegisterModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-600 font-black text-sm">
                <Lock className="w-5 h-5" />
                <span>Gün Sonu Kapatma Onayı (Z Al)</span>
              </div>
              <button 
                onClick={() => setIsCloseRegisterModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Bu işlem aktif çalışma gününü kapatır, resmi <strong>Mali Z Raporu</strong> numarasını oluşturur ve kasayı bir sonraki güne devreder. Bu işlem geri alınamaz.
            </p>

            <form onSubmit={handleCloseRegisterSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Kapatan Yetkili / Müdür Adı:
                </label>
                <input
                  type="text"
                  value={managerName}
                  onChange={e => setManagerName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Yönetici PIN Kodu:
                </label>
                <input
                  type="password"
                  value={managerPin}
                  onChange={e => setManagerPin(e.target.value)}
                  placeholder="PIN giriniz (9999)"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-center tracking-widest text-lg font-bold outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-300">
                Kasadaki beklenen nakit devir tutarı: <strong>₺{(report?.cash_flow.expected_drawer_cash || 0).toFixed(2)}</strong>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCloseRegisterModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={closeRegisterLoading}
                  className="flex-1 py-2.5 rounded-xl font-black bg-red-600 hover:bg-red-700 text-white shadow-md transition disabled:opacity-50"
                >
                  {closeRegisterLoading ? 'Kapatılıyor...' : 'Onayla ve Z Raporu Al'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Simulated 80mm Thermal Receipt Modal */}
      {isThermalReceiptOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-[11px] border border-slate-300">
            <div className="flex items-center justify-between pb-2 border-b border-dashed border-slate-300">
              <span className="font-extrabold text-xs">TERMAL Z FISI ONIZLEME</span>
              <button onClick={() => setIsThermalReceiptOpen(false)} className="text-slate-400 hover:text-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center space-y-1">
              <div className="font-black text-sm">BONCORE RESTAURANT & LOUNGE</div>
              <div>MERKEZ SUBE - POS KASA 01</div>
              <div>VERGI DAIRESI: KADIKOY / VNO: 1234567890</div>
              <div className="py-1">------------------------------------------</div>
              <div className="font-black text-xs">MALI GUN SONU Z RAPORU</div>
              <div>RAPOR NO: {report?.z_report_no}</div>
              <div>TARIH: {report?.formatted_date} {report?.closed_at || report?.report_generated_at}</div>
              <div>KASIYER: {report?.closed_by || report?.opened_by}</div>
              <div className="py-1">------------------------------------------</div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>BRUT SATIS:</span>
                <span className="font-bold">₺{report?.financial_summary.gross_sales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>INDIRIMLER:</span>
                <span>-₺{report?.financial_summary.total_discounts.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>IKRAMLAR:</span>
                <span>-₺{report?.financial_summary.total_treats.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-black text-xs py-1 border-y border-dashed border-slate-300">
                <span>NET HASILAT:</span>
                <span>₺{report?.financial_summary.net_turnover.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-1 pt-1">
              <div className="font-bold">ODEME DETAYLARI:</div>
              {report?.payment_methods.map((p, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{p.name}:</span>
                  <span>₺{p.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 pt-1">
              <div className="font-bold">KDV DOKUMU:</div>
              <div className="flex justify-between">
                <span>%1 KDV (Matrah ₺{report?.vat_breakdown.vat_1.base.toFixed(2)}):</span>
                <span>₺{report?.vat_breakdown.vat_1.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>%10 KDV (Matrah ₺{report?.vat_breakdown.vat_10.base.toFixed(2)}):</span>
                <span>₺{report?.vat_breakdown.vat_10.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>%20 KDV (Matrah ₺{report?.vat_breakdown.vat_20.base.toFixed(2)}):</span>
                <span>₺{report?.vat_breakdown.vat_20.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold pt-0.5">
                <span>TOPLAM KDV:</span>
                <span>₺{report?.vat_breakdown.total_tax.toFixed(2)}</span>
              </div>
            </div>

            <div className="text-center pt-2 space-y-1 text-[10px]">
              <div>------------------------------------------</div>
              <div>KASADAKI DEVIR NAKIT: ₺{report?.cash_flow.expected_drawer_cash.toFixed(2)}</div>
              <div>TOPLAM ADISYON: {report?.financial_summary.total_orders} ADET</div>
              <div>MALI DEGERI BULUNMAKTADIR</div>
              <div>AFİYET OLSUN - TESEKKUR EDERIZ</div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => window.print()}
                className="w-full py-2 bg-slate-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Termal Yazıcıya Gönder</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Archive Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-sm">
                <Archive className="w-5 h-5 text-red-600" />
                <span>Geçmiş Z Raporları Arşivi ({zHistory.length})</span>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              {zHistory.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400">
                  Arşivde henüz kayıtlı geçmiş Z raporu bulunmuyor.
                </div>
              ) : (
                zHistory.map((zh) => (
                  <div
                    key={zh.id}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">{zh.z_report_no}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold">
                          {zh.status === 'closed' ? 'KAPATILDI' : 'AÇIK'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Açılış: {zh.opened_at ? zh.opened_at.slice(0, 10) : '-'} | Kapatan: {zh.closed_by || zh.opened_by}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Toplam Ciro</div>
                        <div className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                          ₺{(zh.total_revenue || 0).toFixed(2)}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (zh.opened_at) {
                            setSelectedDate(zh.opened_at.slice(0, 10));
                            setIsHistoryModalOpen(false);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold text-[11px] flex items-center gap-1"
                      >
                        <span>Görüntüle</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
