import React, { useState, useEffect } from 'react';
import { 
  Receipt, DollarSign, ArrowUpRight, ArrowDownLeft, 
  FileText, CheckCircle2, AlertTriangle, ShieldCheck, Printer, RefreshCw,
  Clock, X, Zap, Sparkles, Check, Archive, Trash2, Eye
} from 'lucide-react';
import { StaffUser } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';
import { useWebSocket } from '../../services/websocket';
import { printThermalSlipById } from '../../utils/printReceipt';
import { localHardware } from '../../services/localHardware';

interface CashierManagementProps {
  currentUser: StaffUser | null;
  onNavigateTab?: (tab: string) => void;
}

export const CashierManagement: React.FC<CashierManagementProps> = ({ currentUser, onNavigateTab }) => {
  const [register, setRegister] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [xReport, setXReport] = useState<any>(null);
  const [zReportData, setZReportData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Otomatik Z-Raporu Durumu
  const [autoZSettings, setAutoZSettings] = useState<{
    enabled: boolean;
    time: string;
    force_close: boolean;
    last_run_date: string;
    last_run_status: string;
  }>({
    enabled: false,
    time: '04:00',
    force_close: true,
    last_run_date: '',
    last_run_status: ''
  });
  const [showAutoZModal, setShowAutoZModal] = useState<boolean>(false);
  const [savingAutoZ, setSavingAutoZ] = useState<boolean>(false);
  const [testingAutoZ, setTestingAutoZ] = useState<boolean>(false);

  // Geçmiş Z Raporları Arşivi
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [zHistory, setZHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const loadZHistory = async () => {
    setLoadingHistory(true);
    try {
      const hist = await api.getZReportHistory();
      setZHistory(hist || []);
    } catch (err) {
      console.warn('Failed to load Z history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const formatMoney = (val: number | string | undefined | null) => {
    return Number(val || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getPayAmount = (val: any) => {
    if (typeof val === 'number') return val;
    if (val && typeof val.amount === 'number') return val.amount;
    return 0;
  };

  // New Expense Form State
  const [expenseCategory, setExpenseCategory] = useState<string>('Tedarikçi');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseType, setExpenseType] = useState<'out' | 'in'>('out');
  const [expenseDescription, setExpenseDescription] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  useWebSocket('all', (type) => {
    if (type === 'ORDER_PAID' || type === 'ORDER_UPDATED' || type === 'ORDER_CREATED') {
      loadData();
    }
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [regData, expData, xData, autoZ] = await Promise.all([
        api.getActiveRegister(),
        api.getExpenses(),
        api.getXReport(currentUser?.name || 'Kasiyer'),
        api.getAutoZReportSettings().catch(() => null)
      ]);
      setRegister(regData);
      setExpenses(expData);
      setXReport(xData);
      if (autoZ) {
        setAutoZSettings(autoZ);
      }
    } catch (e) {
      console.warn('Failed to load cashier data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAutoZSettings = async () => {
    setSavingAutoZ(true);
    sound.beep();
    try {
      const updated = await api.updateAutoZReportSettings({
        enabled: autoZSettings.enabled,
        time: autoZSettings.time,
        force_close: autoZSettings.force_close
      });
      setAutoZSettings(prev => ({ ...prev, ...updated }));
      showToast('Otomatik Z-Raporu ayarları başarıyla kaydedildi.', 'success');
      setShowAutoZModal(false);
    } catch (err: any) {
      showToast(err.message || 'Ayarlar kaydedilemedi.', 'error');
      sound.warning();
    } finally {
      setSavingAutoZ(false);
    }
  };

  const handleTestAutoZReport = async () => {
    if (!confirm('DİKKAT: Test çalıştırması gün sonu mutabakatını gerçekleştirip kasayı kapatacaktır. Test etmek istediğinize emin misiniz?')) {
      return;
    }
    setTestingAutoZ(true);
    sound.beep();
    try {
      const res = await api.testAutoZReport();
      if (res?.summary) {
        setZReportData(res.summary);
      }
      if (res?.settings) {
        setAutoZSettings(res.settings);
      }
      sound.cashDrawer();
      showToast(res.message || 'Otomatik Z-Raporu testi başarıyla tamamlandı!', 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Test çalıştırması başarısız oldu.', 'error');
      sound.warning();
    } finally {
      setTestingAutoZ(false);
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
      showToast('Masraf kaydı başarıyla eklendi.', 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Masraf eklenemedi.', 'error');
      sound.warning();
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (!confirm('Bu masraf / kasa hareketi kaydını silmek istediğinize emin misiniz?')) return;
    sound.beep();
    try {
      await api.deleteExpense(id);
      showToast('Kasa hareketi kaydı başarıyla silindi.', 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Kayıt silinemedi.', 'error');
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
      showToast('Z-Raporu başarıyla oluşturuldu ve kasa kapatıldı.', 'success');
      await loadData();
    } catch (err: any) {
      if (err.message && err.message.includes('Açıkta')) {
        const force = confirm(`${err.message}\n\nAçık kalan adisyonları yönetici onayıyla kapatıp Z-Raporunu almak istiyor musunuz?`);
        if (force) {
          try {
            const res = await api.closeZReport(currentUser?.name || 'Müdür', '9999', true);
            setZReportData(res);
            sound.cashDrawer();
            showToast('Açık adisyonlar kapatıldı ve Z-Raporu başarıyla alındı.', 'success');
            await loadData();
            return;
          } catch (forceErr: any) {
            showToast(forceErr.message || 'Z Raporu alınamadı.', 'error');
            sound.warning();
            return;
          }
        }
      }
      showToast(err.message || 'Z Raporu alınamadı.', 'error');
      sound.warning();
    }
  };

  const handlePrintCurrentReport = async () => {
    sound.beep();
    const data = zReportData || xReport;
    const isZ = Boolean(zReportData);
    const reportTitle = isZ ? 'Z-RAPORU' : 'X-RAPORU';

    const adisyonPrinters = localHardware.getAdisyonPrinters();
    const physicalPrinters = (adisyonPrinters || []).filter(p => 
      !p.toLowerCase().includes('pdf') && 
      !p.toLowerCase().includes('xps') && 
      !p.toLowerCase().includes('onenote') &&
      !p.toLowerCase().includes('fax')
    );

    if (physicalPrinters.length > 0 && data) {
      for (const pr of physicalPrinters) {
        const W = localHardware.getPrinterLineWidth(pr);
        const paperWidth = localHardware.getPrinterPaperWidth(pr);
        const sep = '='.repeat(W);
        const subSep = '-'.repeat(W);
        const padLR = (l: string, r: string) => {
          const sp = Math.max(1, W - l.length - r.length);
          return l + ' '.repeat(sp) + r;
        };
        const center = (t: string) => {
          if (t.length >= W) return t.slice(0, W);
          const sp = Math.floor((W - t.length) / 2);
          return ' '.repeat(sp) + t;
        };

        const activeRestName = localStorage.getItem('boncore_active_restaurant_name') || 'FATİH ÇİFTLİĞİ';
        const lines: string[] = [];
        lines.push(sep);
        lines.push(center(activeRestName.toLocaleUpperCase('tr-TR')));
        lines.push(center(isZ ? '*** GÜN SONU Z-RAPORU ***' : '*** ARA DENETİM X-RAPORU ***'));
        lines.push(sep);
        lines.push(padLR(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, `Saat: ${new Date().toLocaleTimeString('tr-TR')}`));
        lines.push(padLR(`Kasa: #${register?.id || '1'}`, `Kasiyer: ${currentUser?.name || 'Kasiyer'}`));
        if (data.z_report_no) lines.push(`Z No: ${data.z_report_no}`);
        lines.push(subSep);

        lines.push(padLR('AÇILIŞ AVANSI:', `₺${formatMoney(data.opening_float ?? 1500)}`));
        lines.push(padLR('TOPLAM SATIŞ (CİRO):', `₺${formatMoney(data.total_revenue ?? data.net_sales)}`));
        lines.push(padLR('  - Tamamlanan Adisyon:', `${data.total_orders ?? data.paid_orders_count ?? 0} Adet`));
        lines.push(padLR('KASADAN ÇIKIŞ / MASRAF:', `₺${formatMoney(data.total_expenses ?? 0)}`));
        if (Number(data.cash_in || 0) > 0) {
          lines.push(padLR('KASAYA GİRİŞ:', `₺${formatMoney(data.cash_in)}`));
        }
        lines.push(subSep);
        lines.push(padLR('KASADA NAKİT TOPLAMI:', `₺${formatMoney(data.cash_in_drawer)}`));
        lines.push(subSep);

        lines.push(center('-- ÖDEME DAĞILIMI --'));
        const pBreak = data.payment_breakdown || {};
        const pCash = getPayAmount(pBreak.cash);
        const pCard = getPayAmount(pBreak.credit_card);
        const pMulti = getPayAmount(pBreak.multinet);
        const pSodexo = getPayAmount(pBreak.sodexo);

        lines.push(padLR('NAKİT TAHSİLAT:', `₺${formatMoney(pCash)}`));
        lines.push(padLR('KREDİ KARTI / POS:', `₺${formatMoney(pCard)}`));
        if (pMulti > 0) lines.push(padLR('MULTİNET:', `₺${formatMoney(pMulti)}`));
        if (pSodexo > 0) lines.push(padLR('SODEXO:', `₺${formatMoney(pSodexo)}`));

        lines.push(subSep);
        lines.push(padLR('AÇIKTA BEKLEYEN ADİSYON:', `${data.open_orders_count || 0} Adet`));
        if (Number(data.open_orders_total || 0) > 0) {
          lines.push(padLR('  Açık Adisyon Tutarı:', `₺${formatMoney(data.open_orders_total)}`));
        }

        lines.push(sep);
        lines.push(center(isZ ? '* MALİ GÜN SONU BELGESİDİR *' : '* MALİ Z-RAPORU YERİNE GEÇMEZ *'));
        lines.push(center(`Rulo: ${paperWidth} (${W} Karakter)`));
        lines.push(center('BONCORE POS SİSTEMLERİ'));
        lines.push(sep + '\n\n\n\n');

        try {
          await localHardware.printReceipt({
            printers: [pr],
            rawText: lines.join('\n'),
            docType: isZ ? 'z_raporu' : 'x_raporu'
          });
          showToast(`${reportTitle} (${pr}) yazıcısına başarıyla gönderildi!`, 'success');
        } catch (e) {
          console.warn('Fiziksel rapor yazdırma uyarısı:', e);
        }
      }
    }

    // Tarayıcı üzerinden fiş çıktısını hedef yazıcı genişliğiyle tetikle
    printThermalSlipById('cashier-thermal-slip', isZ ? 'Z-Raporu' : 'X-Raporu');
  };

  return (
    <div className="flex-1 min-h-full overflow-y-auto p-4 sm:p-6 pb-36 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none transition-colors duration-200">
      {/* Toast Notification */}
      {toast && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-bold shadow-lg transition-all animate-slideDown ${
          toast.type === 'success' 
            ? 'bg-emerald-600/95 text-white border border-emerald-500' 
            : 'bg-rose-600/95 text-white border border-rose-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0 text-amber-200" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">Kasa & Gün Sonu Mutabakatı</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">X-Raporu, Z-Raporu, Gün İçi Masraf & Harcama Yönetimi</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { sound.beep(); loadData(); }}
            className="p-2.5 rounded-2xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition shadow-sm cursor-pointer"
            title="Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {onNavigateTab && (
            <button
              onClick={() => { sound.beep(); onNavigateTab('day_end_report'); }}
              className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-extrabold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-4 h-4 text-brand-600" />
              <span>DETAYLI GÜN SONU RAPORU</span>
            </button>
          )}
          <button
            onClick={() => { sound.beep(); loadZHistory(); setShowHistoryModal(true); }}
            className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-extrabold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            title="Geçmiş Z-Raporları Arşivi"
          >
            <Archive className="w-4 h-4 text-purple-600" />
            <span>GEÇMİŞ Z-RAPORLARI</span>
          </button>
          <button
            onClick={() => { sound.beep(); setShowAutoZModal(true); }}
            className={`flex-1 sm:flex-initial px-3.5 py-2.5 rounded-2xl border font-extrabold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
              autoZSettings.enabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="Otomatik Gün Sonu Z-Raporu Ayarları"
          >
            <Clock className={`w-4 h-4 ${autoZSettings.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
            <span>OTOMATİK Z: {autoZSettings.enabled ? autoZSettings.time : 'KAPALI'}</span>
          </button>
          <button
            onClick={handleCloseZReport}
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-[#338d35] hover:bg-[#28702a] text-white font-extrabold text-xs shadow-lg shadow-emerald-600/25 transition flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>GÜN SONU Z-RAPORU AL</span>
          </button>
        </div>
      </div>

      {/* Açık Adisyon Bilgilendirme Kartı */}
      {Number(xReport?.open_orders_count || 0) > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border-2 border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-900 dark:text-amber-200 animate-fadeIn">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <span>Açıkta {xReport?.open_orders_count} Adet Masada Adisyon Bulunuyor</span>
                {Number(xReport?.open_orders_total || 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-black bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    ₺{formatMoney(xReport.open_orders_total)}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Z-Raporu almadan önce açık masaların ödemesini alabilir veya tek tıkla otomatik kapatıp Z-Raporunu alabilirsiniz.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => { sound.beep(); onNavigateTab('tables'); }}
                className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-extrabold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Masalara Git
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Açıkta bekleyen ${xReport?.open_orders_count || 1} adet masa/adisyon yönetici onayıyla otomatik kapatılacak ve Gün Sonu Z-Raporu alınacak. Emin misiniz?`)) return;
                sound.beep();
                try {
                  const res = await api.closeZReport(currentUser?.name || 'Müdür', '9999', true);
                  setZReportData(res);
                  sound.cashDrawer();
                  showToast('Açık masalar kapatıldı ve Z-Raporu başarıyla oluşturuldu!', 'success');
                  await loadData();
                } catch (err: any) {
                  showToast(err.message || 'Z-Raporu alınamadı.', 'error');
                  sound.warning();
                }
              }}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              Açıkları Kapat & Z-Raporu Al
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Toplam Günlük Ciro</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            ₺{formatMoney(xReport?.total_revenue ?? xReport?.net_sales)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
            {xReport?.total_orders ?? xReport?.paid_orders_count ?? 0} Adet Tamamlanan Adisyon
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Kasada Nakit Durumu</div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
            ₺{formatMoney(xReport?.cash_in_drawer)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
            ₺{formatMoney(xReport?.opening_float ?? 1500)} Açılış Avansı Dahil
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Kredi Kartı & Slip</div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
            ₺{formatMoney(getPayAmount(xReport?.payment_breakdown?.credit_card))}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
            {xReport?.payment_breakdown?.credit_card?.count || 0} Adet POS Çekimi
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Toplam Masraf & Çıkış</div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            ₺{formatMoney(xReport?.total_expenses ?? xReport?.cash_out)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium flex items-center justify-between">
            <span>{expenses.length} Kalem Gider</span>
            {Number(xReport?.cash_in || 0) > 0 && (
              <span className="text-emerald-500 font-bold">+₺{formatMoney(xReport.cash_in)} Giriş</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content: Expense Entry + Live X-Report Terminal Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Expenses Form & History (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-500" />
                <span>Kasa Hareketi (Masraf / Giriş)</span>
              </h3>
              <span className="text-[11px] font-bold text-slate-400">
                {expenseType === 'out' ? 'Kasadan Para Çıkışı' : 'Kasaya Para Girişi'}
              </span>
            </div>

            {/* Hareket Türü Seçimi (Çıkış vs Giriş) */}
            <div className="flex rounded-2xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => { sound.beep(); setExpenseType('out'); }}
                className={`flex-1 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  expenseType === 'out'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>💸 Gider / Masraf Çıkışı</span>
              </button>
              <button
                type="button"
                onClick={() => { sound.beep(); setExpenseType('in'); }}
                className={`flex-1 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  expenseType === 'in'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>💵 Kasa Girişi (Avans / Takviye)</span>
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Kategori:</label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                  >
                    {expenseType === 'out' ? (
                      <>
                        <option value="Tedarikçi">Tedarikçi Ödemesi</option>
                        <option value="Market">Market & Acil Alım</option>
                        <option value="Personel">Personel Avansı / Yemeği</option>
                        <option value="Bakım">Teknik Bakım / Onarım</option>
                        <option value="Kurye Masrafı">Kurye Masrafı / Yakıt</option>
                        <option value="Diğer">Diğer Masraf</option>
                      </>
                    ) : (
                      <>
                        <option value="Açılış Avansı">Açılış Avansı</option>
                        <option value="Kasa Takviye">Kasa Nakit Takviyesi</option>
                        <option value="Ortak/Yönetici">Ortak / Yönetici Girişi</option>
                        <option value="Diğer Giriş">Diğer Kasa Girişi</option>
                      </>
                    )}
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
                  placeholder={expenseType === 'out' ? 'Örn: Kasap et ödemesi (Fiş #142)' : 'Örn: Gün içi bozuk para takviyesi'}
                  required
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className={`w-full py-3 rounded-2xl text-white font-extrabold text-xs shadow-lg transition cursor-pointer ${
                  expenseType === 'out'
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
                }`}
              >
                {expenseType === 'out' ? '💸 MASRAFI KASADAN DÜŞ' : '💵 NAKİT GİRİŞİNİ KASAYA EKLE'}
              </button>
            </form>
          </div>

          {/* Expenses Table */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Bugünkü Kasa Hareketleri ({expenses.length})
              </h4>
              <div className="flex items-center gap-2 text-[10px] font-mono font-bold">
                <span className="text-amber-600 dark:text-amber-400">
                  Çıkış: ₺{formatMoney(expenses.filter(e => (e.expense_type || e.type) !== 'in').reduce((s, e) => s + (Number(e.amount) || 0), 0))}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  Giriş: ₺{formatMoney(expenses.filter(e => (e.expense_type || e.type) === 'in').reduce((s, e) => s + (Number(e.amount) || 0), 0))}
                </span>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {expenses.map((e) => {
                const isCashIn = (e.expense_type === 'in' || e.type === 'in');
                const dateStr = e.created_at ? new Date(e.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
                return (
                  <div key={e.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs hover:border-slate-300 dark:hover:border-slate-600 transition">
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                        isCashIn 
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}>
                        {isCashIn ? '↓' : '↑'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{e.category}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold ${
                            isCashIn 
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                          }`}>
                            {isCashIn ? 'Giriş / Avans' : 'Gider / Çıkış'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {e.description} {dateStr && `• ${dateStr}`} {e.created_by && `• ${e.created_by}`}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-black text-sm ${isCashIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {isCashIn ? '+' : '-'}₺{formatMoney(e.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(e.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                        title="Bu kaydı sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {expenses.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500">
                  Bugün henüz masraf veya kasa hareketi girilmedi.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Live X / Z Report Thermal Preview (6 cols) */}
        <div className="lg:col-span-6 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className={`w-5 h-5 ${zReportData ? 'text-purple-600 dark:text-purple-400' : 'text-blue-500'}`} />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {zReportData ? 'Resmi Gün Sonu Z-Raporu' : 'Canlı X-Raporu (Ara Kasa)'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {zReportData && (
                  <button
                    onClick={() => { sound.beep(); setZReportData(null); }}
                    className="text-xs px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition flex items-center gap-1 cursor-pointer"
                    title="Canlı X-Raporuna Geri Dön"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>X-Raporuna Dön</span>
                  </button>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-lg font-mono font-bold ${
                  zReportData 
                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800' 
                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                }`}>
                  {zReportData ? (zReportData.z_report_no || 'Z-RAPORU') : 'ARA DENETİM'}
                </span>
              </div>
            </div>

            {/* Thermal Print Slip Preview Box (Targeted for isolated printing) */}
            <div 
              id="cashier-thermal-slip"
              className="printable-thermal-receipt p-4 bg-slate-900 dark:bg-slate-950 rounded-2xl border border-slate-800 font-thermal text-xs text-slate-300 space-y-1 overflow-x-auto shadow-inner select-text"
            >
              <div className="text-center font-bold text-white tracking-widest">==========================================</div>
              <div className="text-center font-black text-amber-400 text-sm tracking-wider">BONCORE POS • FATİH ÇİFTLİĞİ</div>
              <div className="text-center font-bold text-white text-xs">
                {zReportData ? (zReportData.title || 'RESMİ GÜN SONU Z-RAPORU') : (xReport?.title || 'X-RAPORU (GÜN İÇİ ARA DENETİM)')}
              </div>
              <div className="text-center text-[10px] text-slate-400">
                Kasa Vardiya No: #{zReportData?.id || xReport?.id || xReport?.register_id || 7}
              </div>
              <div className="text-center font-bold text-white tracking-widest">==========================================</div>
              
              <div className="flex justify-between text-[11px] pt-1">
                <span className="text-slate-400">Tarih & Saat:</span>
                <span className="font-mono text-white">{xReport?.date || xReport?.generated_at || new Date().toLocaleString('tr-TR')}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Kasiyer / Yetkili:</span>
                <span className="font-semibold text-white">{currentUser?.name || xReport?.cashier_name || 'Kasiyer'}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Vardiya Durumu:</span>
                <span className={`font-bold ${zReportData ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {zReportData ? 'KAPATILDI (GÜN SONU)' : 'AÇIK (AKTİF ÇALIŞMA)'}
                </span>
              </div>
              {zReportData?.z_report_no && (
                <div className="flex justify-between text-[11px] font-bold text-purple-300">
                  <span>Mali Z-Rapor No:</span>
                  <span>{zReportData.z_report_no}</span>
                </div>
              )}

              <div className="text-center font-bold text-slate-600 dark:text-slate-700 py-0.5">------------------------------------------</div>
              
              {/* Ciro ve Satış Özeti */}
              <div className="flex justify-between font-bold text-white text-sm">
                <span>NET HASILAT (CİRO):</span>
                <span className="text-emerald-400 font-mono">₺{formatMoney((zReportData || xReport)?.total_revenue ?? (zReportData || xReport)?.net_sales)}</span>
              </div>
              {Number((zReportData || xReport)?.gross_sales || 0) > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Brüt Satış Tutarı:</span>
                  <span className="font-mono">₺{formatMoney((zReportData || xReport)?.gross_sales)}</span>
                </div>
              )}
              {Number((zReportData || xReport)?.total_discounts || 0) > 0 && (
                <div className="flex justify-between text-[11px] text-amber-300">
                  <span>Toplam İndirim / İskonto:</span>
                  <span className="font-mono">-₺{formatMoney((zReportData || xReport)?.total_discounts)}</span>
                </div>
              )}
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Tamamlanan Adisyon:</span>
                <span className="font-mono">{(zReportData || xReport)?.total_orders ?? (zReportData || xReport)?.paid_orders_count ?? 0} Adet</span>
              </div>
              {Number((zReportData || xReport)?.average_ticket || 0) > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Ortalama Adisyon:</span>
                  <span className="font-mono">₺{formatMoney((zReportData || xReport)?.average_ticket)}</span>
                </div>
              )}
              {Number((zReportData || xReport)?.total_kuver || 0) > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Toplam Kuver:</span>
                  <span className="font-mono">{(zReportData || xReport)?.total_kuver} Kişi</span>
                </div>
              )}

              <div className="text-center font-bold text-slate-600 dark:text-slate-700 py-0.5">------------------------------------------</div>
              
              {/* Ödeme Dağılımı */}
              <div className="font-bold text-white text-[11px]">TAHSİLAT DÖKÜMÜ (ÖDEME TÜRLERİ):</div>
              <div className="flex justify-between text-[11px]">
                <span>• Nakit Tahsilat:</span>
                <span className="font-mono text-white">₺{formatMoney(getPayAmount((zReportData || xReport)?.payment_breakdown?.cash))}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>• Kredi Kartı / POS:</span>
                <span className="font-mono text-white">₺{formatMoney(getPayAmount((zReportData || xReport)?.payment_breakdown?.credit_card))}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>• Sodexo / Yemek Çeki:</span>
                <span className="font-mono text-white">₺{formatMoney(getPayAmount((zReportData || xReport)?.payment_breakdown?.sodexo))}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>• Multinet / Ticket:</span>
                <span className="font-mono text-white">₺{formatMoney(getPayAmount((zReportData || xReport)?.payment_breakdown?.multinet))}</span>
              </div>
              {Number(getPayAmount((zReportData || xReport)?.payment_breakdown?.open_account)) > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span>• Cari / Açık Hesap:</span>
                  <span className="font-mono text-white">₺{formatMoney(getPayAmount((zReportData || xReport)?.payment_breakdown?.open_account))}</span>
                </div>
              )}

              <div className="text-center font-bold text-slate-600 dark:text-slate-700 py-0.5">------------------------------------------</div>
              
              {/* Kasa Nakit Akışı */}
              <div className="font-bold text-white text-[11px]">KASA ÇEKMECESİ NAKİT HAREKETİ:</div>
              <div className="flex justify-between text-[11px] text-amber-300">
                <span>Açılış Kasa Avansı:</span>
                <span className="font-mono">+₺{formatMoney((zReportData || xReport)?.opening_float ?? 1500)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-emerald-400">
                <span>Nakit Satış Tahsilatı:</span>
                <span className="font-mono">+₺{formatMoney(getPayAmount((zReportData || xReport)?.payment_breakdown?.cash))}</span>
              </div>
              {Number((zReportData || xReport)?.cash_in || 0) > 0 && (
                <div className="flex justify-between text-[11px] text-emerald-400">
                  <span>Kasa Girişi (Takviye/Avans):</span>
                  <span className="font-mono">+₺{formatMoney((zReportData || xReport)?.cash_in)}</span>
                </div>
              )}
              <div className="flex justify-between text-[11px] text-rose-400">
                <span>Kasadan Çıkan Masraflar:</span>
                <span className="font-mono">-₺{formatMoney((zReportData || xReport)?.cash_out ?? (zReportData || xReport)?.total_expenses)}</span>
              </div>
              <div className="flex justify-between font-black text-emerald-400 text-xs pt-1 border-t border-dashed border-slate-700">
                <span>KASADA OLMASI GEREKEN NAKİT:</span>
                <span className="font-mono">₺{formatMoney((zReportData || xReport)?.cash_in_drawer)}</span>
              </div>

              <div className="text-center font-bold text-slate-600 dark:text-slate-700 py-0.5">------------------------------------------</div>
              
              {/* KDV Dağılımı */}
              <div className="font-bold text-white text-[11px]">KDV MATRAH & VERGİ BİLGİSİ:</div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">KDV %1:</span>
                <span className="font-mono">₺{formatMoney((zReportData || xReport)?.vat_summary?.vat_1)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">KDV %10 (Gıda):</span>
                <span className="font-mono">₺{formatMoney((zReportData || xReport)?.vat_summary?.vat_10)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">KDV %20 (Genel/Diğer):</span>
                <span className="font-mono">₺{formatMoney((zReportData || xReport)?.vat_summary?.vat_20)}</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold text-white pt-0.5">
                <span>TOPLAM KDV:</span>
                <span className="font-mono">₺{formatMoney((zReportData || xReport)?.vat_summary?.total_vat)}</span>
              </div>

              {/* Açık Adisyon Bilgisi */}
              <div className="text-center font-bold text-slate-600 dark:text-slate-700 py-0.5">------------------------------------------</div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Açıkta Bekleyen Adisyon:</span>
                <span className={`font-mono font-bold ${Number((zReportData || xReport)?.open_orders_count || 0) > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {(zReportData || xReport)?.open_orders_count || 0} Adet {Number((zReportData || xReport)?.open_orders_total || 0) > 0 && `(₺${formatMoney((zReportData || xReport)?.open_orders_total)})`}
                </span>
              </div>

              {/* Gün İçi Masraf Kalemleri (Varsa) */}
              {expenses.length > 0 && (
                <>
                  <div className="text-center font-bold text-slate-600 dark:text-slate-700 py-0.5">------------------------------------------</div>
                  <div className="font-bold text-white text-[10px]">GÜN İÇİ MASRAFLAR ({expenses.length} Kalem):</div>
                  {expenses.slice(0, 4).map((exp, idx) => (
                    <div key={idx} className="flex justify-between text-[10px]">
                      <span className="truncate max-w-[180px]">• {exp.description || exp.category}</span>
                      <span className="font-mono text-rose-300">-₺{formatMoney(exp.amount)}</span>
                    </div>
                  ))}
                  {expenses.length > 4 && (
                    <div className="text-[9px] text-slate-500 text-center">...ve {expenses.length - 4} masraf daha</div>
                  )}
                </>
              )}

              <div className="text-center font-bold text-white tracking-widest pt-1">==========================================</div>
              <div className="text-center text-[9px] text-slate-400 pt-0.5">
                {zReportData ? '* MALİ GÜN SONU BELGESİDİR *' : '* MALİ Z-RAPORU YERİNE GEÇMEZ • ARA DENETİMDİR *'}
              </div>
              <div className="text-center text-[9px] text-slate-500">BONCORE POS SİSTEMLERİ</div>
            </div>
          </div>

          <div className="mt-4 flex gap-3 no-print">
            <button
              type="button"
              onClick={handlePrintCurrentReport}
              className="flex-1 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 font-extrabold text-xs flex items-center justify-center gap-2 transition shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4 text-brand-500" />
              <span>{zReportData ? 'Z-RAPORUNU YAZDIR' : 'X-RAPORUNU YAZDIR (TERMAL)'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sound.beep();
                loadData();
              }}
              className="px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              title="X-Raporu Verilerini Güncelle"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Yenile</span>
            </button>
          </div>
        </div>
      </div>

      {/* Otomatik Z-Raporu Yapılandırma Modalı */}
      {showAutoZModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-6 text-slate-900 dark:text-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black">Otomatik Gün Sonu Z-Raporu</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Belirlenen saatte kasayı otomatik kapatır</p>
                </div>
              </div>
              <button
                onClick={() => setShowAutoZModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Etkinleştirme Anahtarı */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <div>
                  <div className="text-sm font-extrabold">Otomatik Z-Raporunu Etkinleştir</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Her gün belirlenen saatte otomatik çalışır</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoZSettings.enabled}
                    onChange={(e) => {
                      sound.beep();
                      setAutoZSettings(prev => ({ ...prev, enabled: e.target.checked }));
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Saat Seçimi */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Otomatik Kapanış Saati (24 Saat Formatı):
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={autoZSettings.time}
                    onChange={(e) => setAutoZSettings(prev => ({ ...prev, time: e.target.value }))}
                    disabled={!autoZSettings.enabled}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-base font-extrabold text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-[11px] text-slate-400 font-medium">Hızlı Seçim:</span>
                  {['02:00', '03:00', '04:00', '04:30', '05:00', '06:00'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={!autoZSettings.enabled}
                      onClick={() => { sound.beep(); setAutoZSettings(prev => ({ ...prev, time: t })); }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer disabled:opacity-40 ${
                        autoZSettings.time === t
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Açık Adisyonları Otomatik Kapatma Seçeneği */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <div className="pr-4">
                  <div className="text-sm font-extrabold">Açık Kalan Adisyonları Otomatik Kapat</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Gece açık unutulan paket veya masa siparişlerini güvenle kapatıp Z-Raporunun aksamasını önler
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoZSettings.force_close}
                    onChange={(e) => {
                      sound.beep();
                      setAutoZSettings(prev => ({ ...prev, force_close: e.target.checked }));
                    }}
                    disabled={!autoZSettings.enabled}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 disabled:opacity-50"></div>
                </label>
              </div>

              {/* Son Çalışma Durumu */}
              {autoZSettings.last_run_status && (
                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-1">
                  <div className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>Son Otomatik İşlem Durumu:</span>
                  </div>
                  <div className="font-mono text-slate-700 dark:text-slate-300 pl-5">
                    {autoZSettings.last_run_status}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleTestAutoZReport}
                disabled={testingAutoZ || savingAutoZ}
                className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>{testingAutoZ ? 'Çalıştırılıyor...' : 'Şimdi Test Et'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAutoZModal(false)}
                  className="px-4 py-2.5 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleSaveAutoZSettings}
                  disabled={savingAutoZ || testingAutoZ}
                  className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingAutoZ ? 'Kaydediliyor...' : 'Ayarları Kaydet'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Geçmiş Z-Raporları Arşivi Modalı */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-slate-900 dark:text-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black">Geçmiş Gün Sonu Z-Raporları ({zHistory.length})</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Önceki günlere ait mali kasa kapanışları ve hasılat dökümü</p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {loadingHistory ? (
                <div className="text-center py-12 text-slate-400 text-xs">Yükleniyor...</div>
              ) : zHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">Arşivde henüz kayıtlı geçmiş Z-Raporu bulunmuyor.</div>
              ) : (
                zHistory.map((zh) => {
                  const openDateStr = zh.opened_at ? new Date(zh.opened_at).toLocaleDateString('tr-TR') : '-';
                  const closeTimeStr = zh.closed_at ? new Date(zh.closed_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
                  return (
                    <div
                      key={zh.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-brand-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
                            {zh.z_report_no || `Kasa #${zh.id}`}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            zh.status === 'closed'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                          }`}>
                            {zh.status === 'closed' ? 'KAPATILDI (Z ALINDI)' : 'AÇIK KASA'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Tarih: {openDateStr} {closeTimeStr && `(${closeTimeStr})`} • Kapatan: {zh.closed_by || zh.opened_by || 'Yönetici'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Nakit: ₺{formatMoney(zh.cash_sales)} • Kart: ₺{formatMoney(zh.card_sales)} • Masraf: ₺{formatMoney(zh.total_expenses)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-slate-200 dark:border-slate-700">
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 uppercase font-bold">Toplam Ciro</div>
                          <div className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                            ₺{formatMoney(zh.total_revenue || zh.total_turnover || 0)}
                          </div>
                        </div>

                        {onNavigateTab && (
                          <button
                            type="button"
                            onClick={() => {
                              sound.beep();
                              setShowHistoryModal(false);
                              onNavigateTab('day_end_report');
                            }}
                            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Detaylı Rapor</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
