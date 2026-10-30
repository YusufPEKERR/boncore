import React, { useState } from 'react';
import { 
  CreditCard, DollarSign, TrendingUp, CheckCircle2, 
  AlertCircle, Clock, Plus, Filter, Search, X, Calendar 
} from 'lucide-react';
import { sound } from '../../services/sound';

interface MasterBillingViewProps {
  stats: any;
  tenants: any[];
  invoices: any[];
  onRefresh: () => void;
}

export const MasterBillingView: React.FC<MasterBillingViewProps> = ({
  stats,
  tenants,
  invoices,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isAddInvoiceOpen, setIsAddInvoiceOpen] = useState<boolean>(false);

  // New Invoice Form
  const [newInvTenantId, setNewInvTenantId] = useState<number>(tenants[0]?.id || 1);
  const [newInvAmount, setNewInvAmount] = useState<number>(1490);
  const [newInvPeriod, setNewInvPeriod] = useState<string>('Kasım 2026');
  const [newInvMethod, setNewInvMethod] = useState<string>('credit_card');
  const [newInvStatus, setNewInvStatus] = useState<string>('paid');

  const filteredInvoices = invoices.filter(i => {
    const matchesSearch = 
      i.tenant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.invoice_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.period.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleMarkPaid = async (invoiceId: number) => {
    sound.cashDrawer();
    try {
      const res = await fetch(`/api/master/invoices/${invoiceId}/pay`, { method: 'PUT' });
      if (res.ok) {
        onRefresh();
      }
    } catch (e) {
      alert('İşlem başarısız.');
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.cashDrawer();
    try {
      const res = await fetch('/api/master/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: newInvTenantId,
          amount: Number(newInvAmount),
          period: newInvPeriod,
          payment_method: newInvMethod,
          status: newInvStatus
        })
      });
      if (!res.ok) throw new Error('Fatura oluşturulamadı.');
      setIsAddInvoiceOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-400" />
            <span>SaaS Finans, Abonelikler & Fatura Geçmişi</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Hangi restoran hangi plana üye, aylık ne kadar satış yapılmış ve ödemeler nasıl alınmış detaylıca inceleyin.
          </p>
        </div>

        <button
          onClick={() => { sound.beep(); setIsAddInvoiceOpen(true); }}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 hover:from-brand-500 hover:to-emerald-500 text-white font-black text-xs transition cursor-pointer shadow-md flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>+ Manuel Tahsilat / Fatura Ekle</span>
        </button>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-1.5">
          <div className="text-xs font-bold text-slate-400">Aylık Düzenli Gelir (MRR)</div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400">
            ₺{Number(stats?.total_mrr || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500">Tüm aktif restoranlardan aylık garanti gelir</div>
        </div>

        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-1.5">
          <div className="text-xs font-bold text-slate-400">Yıllık Koşu Hızı (ARR)</div>
          <div className="text-2xl sm:text-3xl font-black text-white">
            ₺{Number(stats?.total_arr || 0).toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-slate-500">MRR x 12 aylık projeksiyon</div>
        </div>

        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-1.5">
          <div className="text-xs font-bold text-slate-400">Bu Ay Tahsil Edilen</div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-300">
            ₺{Number(stats?.paid_invoices_sum || 0).toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-emerald-500 font-bold">✓ Kasaya giren net tahsilat</div>
        </div>

        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-1.5">
          <div className="text-xs font-bold text-slate-400">Bekleyen / Geciken Ödemeler</div>
          <div className="text-2xl sm:text-3xl font-black text-amber-400">
            ₺{Number(stats?.pending_invoices_sum || 0).toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-amber-500">Ödeme bekleyen abonelikler</div>
        </div>
      </div>

      {/* 1. RESTORANLARIN GÜNCEL ABONELİK & PLAN TABLOSU */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-sm space-y-4">
        <div className="pb-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Restoranların Abonelik & Plan Durumları ({tenants.length} Restoran)
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Her bir müşterinin aktif planı, aylık ücreti ve ödeme şekli
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Restoran</th>
                <th className="py-3 px-4">Abonelik Planı</th>
                <th className="py-3 px-4">Aylık Ücret</th>
                <th className="py-3 px-4">Ödeme Yöntemi</th>
                <th className="py-3 px-4">Ödeme Durumu</th>
                <th className="py-3 px-4">Sonraki Yenileme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-850/60 transition">
                  <td className="py-3 px-4">
                    <div className="font-black text-white">{t.name}</div>
                    <div className="text-[11px] text-slate-400">{t.owner_name} • {t.phone}</div>
                  </td>

                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                      t.plan === 'enterprise' 
                        ? 'bg-purple-950 text-purple-300 border border-purple-800'
                        : t.plan === 'pro'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-blue-950 text-blue-300 border border-blue-800'
                    }`}>
                      {t.plan}
                    </span>
                  </td>

                  <td className="py-3 px-4 font-black text-slate-200">
                    ₺{Number(t.monthly_price || 0).toLocaleString('tr-TR')}/ay
                  </td>

                  <td className="py-3 px-4 font-medium text-slate-300">
                    {t.payment_method === 'bank_transfer' ? 'Banka Havalesi / EFT' : 'Otomatik Kredi Kartı'}
                  </td>

                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      t.payment_status === 'paid'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : t.payment_status === 'pending'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-red-500/10 text-red-400 border border-red-500/30'
                    }`}>
                      {t.payment_status === 'paid' ? 'Ödendi' : t.payment_status === 'pending' ? 'Bekliyor' : 'Gecikmede'}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                    {t.renewal_date ? new Date(t.renewal_date).toLocaleDateString('tr-TR') : 'Belirtilmedi'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. TÜM FATURA & TAHSİLAT GEÇMİŞİ */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-sm space-y-4">
        <div className="pb-3 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Abonelik Fatura & Tahsilat Kayıtları
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Düzenlenen tüm faturalar ve tahsilat makbuzları
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-850 border border-slate-700 text-slate-300 text-xs font-bold"
            >
              <option value="all">Tüm Faturalar</option>
              <option value="paid">Ödenenler</option>
              <option value="pending">Bekleyenler</option>
              <option value="overdue">Gecikenler</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Fatura No</th>
                <th className="py-3 px-4">Restoran Adı</th>
                <th className="py-3 px-4">Dönem</th>
                <th className="py-3 px-4">Tutar</th>
                <th className="py-3 px-4">Ödeme Yöntemi</th>
                <th className="py-3 px-4">Durum</th>
                <th className="py-3 px-4 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Fatura kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-850/60 transition">
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {inv.invoice_no}
                    </td>

                    <td className="py-3 px-4 font-bold text-slate-200">
                      {inv.tenant_name}
                    </td>

                    <td className="py-3 px-4 text-slate-300">
                      {inv.period}
                    </td>

                    <td className="py-3 px-4 font-black text-emerald-400">
                      ₺{Number(inv.amount || 0).toLocaleString('tr-TR')}
                    </td>

                    <td className="py-3 px-4 text-slate-400">
                      {inv.payment_method === 'bank_transfer' ? 'Havale / EFT' : 'Kredi Kartı'}
                    </td>

                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        inv.status === 'paid'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : inv.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-red-500/10 text-red-400 border border-red-500/30'
                      }`}>
                        {inv.status === 'paid' ? 'Ödendi' : inv.status === 'pending' ? 'Bekliyor' : 'Gecikmede'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      {inv.status !== 'paid' ? (
                        <button
                          onClick={() => handleMarkPaid(inv.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer"
                        >
                          Ödendi Olarak İşaretle
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-400 font-bold flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Tahsil Edildi</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Manuel Fatura / Tahsilat Ekle */}
      {isAddInvoiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
          <div className="relative w-full max-w-md bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <span>Manuel Tahsilat / Fatura Kaydet</span>
              </h3>
              <button onClick={() => setIsAddInvoiceOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-4 text-xs font-bold text-slate-300">
              <div>
                <label className="block mb-1">Restoran Seçin</label>
                <select
                  value={newInvTenantId}
                  onChange={(e) => {
                    const tid = Number(e.target.value);
                    setNewInvTenantId(tid);
                    const t = tenants.find(x => x.id === tid);
                    if (t) setNewInvAmount(t.monthly_price || 1490);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-bold"
                >
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name} (₺{t.monthly_price})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-1">Fatura / Abonelik Dönemi</label>
                <input
                  type="text"
                  required
                  value={newInvPeriod}
                  onChange={(e) => setNewInvPeriod(e.target.value)}
                  placeholder="Örn: Kasım 2026"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Tutar (₺)</label>
                  <input
                    type="number"
                    required
                    value={newInvAmount}
                    onChange={(e) => setNewInvAmount(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-black"
                  />
                </div>

                <div>
                  <label className="block mb-1">Ödeme Şekli</label>
                  <select
                    value={newInvMethod}
                    onChange={(e) => setNewInvMethod(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold"
                  >
                    <option value="credit_card">Kredi Kartı</option>
                    <option value="bank_transfer">Havale / EFT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block mb-1">Durum</label>
                <select
                  value={newInvStatus}
                  onChange={(e) => setNewInvStatus(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold"
                >
                  <option value="paid">Ödendi (Tahsil Edildi)</option>
                  <option value="pending">Bekliyor (Fatura Gönderildi)</option>
                  <option value="overdue">Gecikmede</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddInvoiceOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black"
                >
                  Faturayı Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
