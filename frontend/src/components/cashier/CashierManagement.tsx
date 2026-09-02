import React, { useState, useEffect } from 'react';
import { 
  Receipt, DollarSign, ArrowUpRight, ArrowDownLeft, 
  FileText, CheckCircle2, ShieldCheck, Printer, RefreshCw 
} from 'lucide-react';
import { StaffUser } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface CashierManagementProps {
  currentUser: StaffUser | null;
}

export const CashierManagement: React.FC<CashierManagementProps> = ({ currentUser }) => {
  const [register, setRegister] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [xReport, setXReport] = useState<any>(null);
  const [zReportData, setZReportData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // New Expense Form State
  const [expenseCategory, setExpenseCategory] = useState<string>('Tedarikçi');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseType, setExpenseType] = useState<'out' | 'in'>('out');
  const [expenseDescription, setExpenseDescription] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [regData, expData, xData] = await Promise.all([
        api.getActiveRegister(),
        api.getExpenses(),
        api.getXReport(currentUser?.name || 'Kasiyer')
      ]);
      setRegister(regData);
      setExpenses(expData);
      setXReport(xData);
    } catch (e) {
      console.warn('Failed to load cashier data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0 || !expenseDescription.trim()) return;

    sound.beep();
    try {
      await api.createExpense(
        expenseCategory,
        amt,
        expenseType,
        expenseDescription,
        currentUser?.name || 'Kasiyer'
      );
      setExpenseAmount('');
      setExpenseDescription('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Masraf eklenemedi.');
      sound.warning();
    }
  };

  const handleCloseZReport = async () => {
    if (!confirm('GÜN SONU Z-RAPORU ALINACAK VE KASA KAPATILACAK! Emin misiniz?')) return;
    sound.beep();
    try {
      const res = await api.closeZReport(currentUser?.name || 'Müdür', '9999');
      setZReportData(res);
      sound.cashDrawer();
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Z Raporu alınamadı.');
      sound.warning();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none transition-colors duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Kasa & Gün Sonu Mutabakatı</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">X-Raporu, Z-Raporu, Gün İçi Masraf & Harcama Yönetimi</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { sound.beep(); loadData(); }}
            className="p-2.5 rounded-2xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition shadow-sm"
            title="Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleCloseZReport}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold text-xs shadow-lg shadow-red-500/25 transition flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>GÜN SONU Z-RAPORU AL</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Toplam Günlük Ciro</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            ₺{xReport?.total_revenue?.toFixed(2) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
            {xReport?.total_orders || 0} Adet Tamamlanan Adisyon
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Kasada Nakit Durumu</div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
            ₺{xReport?.cash_in_drawer?.toFixed(2) || '500.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
            500 ₺ Açılış Avansı Dahil
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Kredi Kartı & Slip</div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
            ₺{xReport?.payment_breakdown?.credit_card?.amount?.toFixed(2) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
            {xReport?.payment_breakdown?.credit_card?.count || 0} Adet POS Çekimi
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Toplam Masraf & Çıkış</div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            ₺{xReport?.total_expenses?.toFixed(2) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
            {expenses.length} Kalem Gün İçi Gider
          </div>
        </div>
      </div>

      {/* Main Content: Expense Entry + Live X-Report Terminal Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Expenses Form & History (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-500" />
              <span>Gün İçi Masraf / Gider Kaydı</span>
            </h3>

            <form onSubmit={handleAddExpense} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Kategori:</label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="Tedarikçi">Tedarikçi Ödemesi</option>
                    <option value="Market">Market & Acil Alım</option>
                    <option value="Personel">Personel Avansı / Yemeği</option>
                    <option value="Bakım">Teknik Bakım / Onarım</option>
                    <option value="Diğer">Diğer Masraf</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Tutar (₺):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Açıklama / Fiş No:</label>
                <input
                  type="text"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  placeholder="Örn: Kasap et ödemesi (Fiş #142)"
                  required
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs shadow-lg shadow-amber-500/20 transition"
              >
                MASRAFI KASADAN DÜŞ
              </button>
            </form>
          </div>

          {/* Expenses Table */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Bugünkü Masraflar</h4>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {expenses.map((e) => (
                <div key={e.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{e.category}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{e.description} • {e.created_at}</div>
                  </div>
                  <span className="font-mono font-black text-amber-600 dark:text-amber-400">-₺{e.amount.toFixed(2)}</span>
                </div>
              ))}
              {expenses.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-400 dark:text-slate-500">Bugün henüz masraf girişi yapılmadı.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Live X / Z Report Thermal Preview (6 cols) */}
        <div className="lg:col-span-6 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                <span>{zReportData ? 'Resmi Z-Raporu' : 'Canlı X-Raporu (Ara Kasa)'}</span>
              </h3>
              <span className="text-xs bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded font-mono font-bold">
                {zReportData ? zReportData.z_report_no : 'ARA DENETİM'}
              </span>
            </div>

            {/* Thermal Print Slip Preview Box */}
            <div className="p-4 bg-slate-900 dark:bg-slate-950 rounded-2xl border border-slate-800 font-thermal text-xs text-slate-300 space-y-1 overflow-x-auto shadow-inner">
              <div className="text-center font-bold text-white">==========================================</div>
              <div className="text-center font-black text-amber-400 text-sm">BONCORE RESTAURANT & LOUNGE</div>
              <div className="text-center font-bold text-white">{zReportData ? zReportData.title : xReport?.title}</div>
              <div className="text-center font-bold text-white">==========================================</div>
              <div>Tarih & Saat: {xReport?.date || ''}</div>
              <div>Kasiyer: {currentUser?.name || 'Kasiyer'}</div>
              <div>Kasa Durumu: AÇIK</div>
              <div className="text-center font-bold">------------------------------------------</div>
              <div className="flex justify-between font-bold text-white">
                <span>TOPLAM HASILAT (CİRO):</span>
                <span className="text-emerald-400">₺{(zReportData || xReport)?.total_revenue?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Nakit Tahsilat:</span>
                <span>₺{((zReportData || xReport)?.payment_breakdown?.cash?.amount || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Kredi Kartı / POS:</span>
                <span>₺{((zReportData || xReport)?.payment_breakdown?.credit_card?.amount || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Sodexo / Yemek Çeki:</span>
                <span>₺{((zReportData || xReport)?.payment_breakdown?.sodexo?.amount || 0).toFixed(2)}</span>
              </div>
              <div className="text-center font-bold">------------------------------------------</div>
              <div className="flex justify-between text-amber-300">
                <span>Gün Başı Kasa Avansı:</span>
                <span>₺500.00</span>
              </div>
              <div className="flex justify-between text-red-400">
                <span>Kasadan Çıkan Masraflar:</span>
                <span>-₺{(zReportData || xReport)?.total_expenses?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-400">
                <span>KASADA OLMASI GEREKEN NAKİT:</span>
                <span>₺{(zReportData || xReport)?.cash_in_drawer?.toFixed(2)}</span>
              </div>
              <div className="text-center font-bold">------------------------------------------</div>
              <div>KDV %1: ₺{(zReportData || xReport)?.vat_summary?.vat_1?.toFixed(2)}</div>
              <div>KDV %10 (Gıda): ₺{(zReportData || xReport)?.vat_summary?.vat_10?.toFixed(2)}</div>
              <div>KDV %20 (Alkol/Diğer): ₺{(zReportData || xReport)?.vat_summary?.vat_20?.toFixed(2)}</div>
              <div className="text-center font-bold text-white">==========================================</div>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => window.print()}
              className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <Printer className="w-4 h-4" />
              <span>RAPORU YAZDIR</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
