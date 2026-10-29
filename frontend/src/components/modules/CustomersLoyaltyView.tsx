import React, { useState, useEffect } from 'react';
import {
  Users, Gift, Wallet, Plus, Search, Award, Sparkles, CheckCircle2,
  Trash2, ArrowUpRight, ArrowDownRight, Phone, Mail, Tag, RefreshCw
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface CustomerItem {
  id: string;
  name: string;
  phone: string;
  email: string;
  tier: string;
  points: number;
  balance: number;
  total_spent: number;
  visit_count: number;
  last_visit: string;
  notes: string;
}

interface CampaignItem {
  id: string;
  title: string;
  type: string;
  rule: string;
  reward: string;
  is_active: boolean;
  usage_count: number;
}

export const CustomersLoyaltyView: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'customers' | 'campaigns' | 'credit'>('customers');

  // New Customer Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    tier: 'Standart',
    points: 100,
    balance: 0,
    notes: ''
  });

  // Transaction Modal
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [txType, setTxType] = useState<'earn_points' | 'redeem_points' | 'add_debt' | 'pay_debt'>('pay_debt');
  const [txAmount, setTxAmount] = useState<string>('');
  const [txNote, setTxNote] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getCustomersLoyalty();
      if (res) {
        setCustomers(res.customers || []);
        setCampaigns(res.campaigns || []);
        setSummary(res.summary || {});
      }
    } catch (e) {
      console.error('Customers load failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name.trim()) return;
    try {
      sound.cashDrawer();
      await api.createCustomer(newCustomer);
      setIsAddModalOpen(false);
      setNewCustomer({ name: '', phone: '', email: '', tier: 'Standart', points: 100, balance: 0, notes: '' });
      await loadData();
      showToast('Yeni müşteri ve sadakat kartı başarıyla oluşturuldu!');
    } catch (err) {
      console.error(err);
    }
  };

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const val = parseFloat(txAmount) || 0;
    if (val <= 0) return;
    try {
      sound.cashDrawer();
      await api.addCustomerTransaction(selectedCustomer.id, {
        type: txType,
        amount: val,
        points: Math.round(val),
        note: txNote
      });
      setSelectedCustomer(null);
      setTxAmount('');
      setTxNote('');
      await loadData();
      showToast('Müşteri cari / sadakat işlemi kaydedildi!');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    try {
      sound.beep();
      await api.deleteCustomer(id);
      await loadData();
      showToast('Müşteri kaydı silindi.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleCampaign = async (id: string) => {
    try {
      sound.beep();
      await api.toggleCampaign(id);
      await loadData();
      showToast('Kampanya durumu güncellendi.');
    } catch (err) {
      console.error(err);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.notes || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (activeTab === 'credit') {
      return matchesSearch && c.balance !== 0;
    }
    return matchesSearch;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              Müşteri Sadakat (CRM), Cari & Kampanya Yönetimi
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white uppercase">
              Adisyo Pro CRM
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Müşteri para puanlarını, VIP sadakat seviyelerini, veresiye (cari) hesap bakiyelerini ve otomatik kampanyaları yönetin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.beep(); loadData(); }}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
          <button
            onClick={() => { sound.beep(); setIsAddModalOpen(true); }}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Müşteri / Cari Kart</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Kayıtlı Müşteri</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {summary.total_customers || customers.length}
            </div>
            <div className="text-[11px] text-emerald-600 font-bold mt-0.5">Sadakat & Cari Aktif</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Toplam Para Puan</div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {(summary.total_loyalty_points || 0).toLocaleString('tr-TR')} Puan
            </div>
            <div className="text-[11px] text-slate-400 font-semibold mt-0.5">Harcanabilir Ödül Havuzu</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-500 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Açık Veresiye (Cari Alacak)</div>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
              ₺{(summary.total_credit_receivable || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-rose-500 font-semibold mt-0.5">Tahsilat Bekleyen Bakiye</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Aktif Kampanyalar</div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {summary.active_campaigns ?? campaigns.filter(c => c.is_active).length} / {campaigns.length}
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">Otomatik POS İndirimi</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
            <Gift className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.beep(); setActiveTab('customers'); }}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              activeTab === 'customers'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
            }`}
          >
            Tüm Müşteriler ({customers.length})
          </button>
          <button
            onClick={() => { sound.beep(); setActiveTab('credit'); }}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              activeTab === 'credit'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
            }`}
          >
            Cari / Veresiye Hesaplar ({customers.filter(c => c.balance !== 0).length})
          </button>
          <button
            onClick={() => { sound.beep(); setActiveTab('campaigns'); }}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              activeTab === 'campaigns'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
            }`}
          >
            Sadakat Kampanyaları ({campaigns.length})
          </button>
        </div>

        {activeTab !== 'campaigns' && (
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Müşteri adı, telefon veya not ara..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:outline-none focus:border-rose-500"
            />
          </div>
        )}
      </div>

      {/* Main Content */}
      {activeTab === 'campaigns' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((camp) => (
            <div
              key={camp.id}
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    camp.is_active ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}>
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm text-slate-900 dark:text-white">{camp.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        camp.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {camp.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <strong>Koşul:</strong> {camp.rule}
                    </p>
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-bold mt-0.5">
                      <strong>Ödül:</strong> {camp.reward}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span className="text-slate-400 font-bold">
                  Toplam Kullanım: <strong className="text-slate-700 dark:text-slate-200">{camp.usage_count} kez</strong>
                </span>
                <button
                  onClick={() => handleToggleCampaign(camp.id)}
                  className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                    camp.is_active
                      ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {camp.is_active ? 'Durdur' : 'Aktifleştir'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black text-slate-500 uppercase">
                  <th className="py-3.5 px-4">Müşteri / Kurum</th>
                  <th className="py-3.5 px-4">Seviye</th>
                  <th className="py-3.5 px-4">Para Puan</th>
                  <th className="py-3.5 px-4">Cari / Veresiye Bakiye</th>
                  <th className="py-3.5 px-4">Toplam Harcama</th>
                  <th className="py-3.5 px-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-slate-900 dark:text-white text-sm">{c.name}</div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>
                        {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</span>}
                      </div>
                      {c.notes && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                          Not: {c.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                        c.tier === 'VIP'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                          : c.tier === 'Gold'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {c.tier}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-extrabold text-amber-600 dark:text-amber-400">
                      {c.points.toLocaleString('tr-TR')} Puan
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`font-black text-sm ${
                        c.balance < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : c.balance > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500'
                      }`}>
                        ₺{c.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                      {c.balance < 0 && (
                        <div className="text-[10px] text-rose-500 font-bold">Borçlu (Veresiye)</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        ₺{(c.total_spent || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-slate-400">{c.visit_count || 0} ziyaret • Son: {c.last_visit}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => {
                          sound.beep();
                          setSelectedCustomer(c);
                          setTxType(c.balance < 0 ? 'pay_debt' : 'earn_points');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900 text-rose-600 dark:text-rose-300 font-extrabold text-xs transition cursor-pointer"
                      >
                        Cari / Puan İşlemi
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(c.id)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Yeni Müşteri & Cari Kart Aç</h3>
            <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Ad Soyad / Firma Unvanı *</label>
                <input
                  type="text"
                  required
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  placeholder="Örn: Ahmet Yılmaz veya Yılmazlar İnşaat"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Telefon *</label>
                  <input
                    type="text"
                    required
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    placeholder="0532 000 00 00"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Sadakat Seviyesi</label>
                  <select
                    value={newCustomer.tier}
                    onChange={(e) => setNewCustomer({ ...newCustomer, tier: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  >
                    <option value="Standart">Standart</option>
                    <option value="Gold">Gold (%5 İndirim)</option>
                    <option value="VIP">VIP (%10 İndirim)</option>
                    <option value="Kurumsal">Kurumsal Cari</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Başlangıç Puanı</label>
                  <input
                    type="number"
                    value={newCustomer.points}
                    onChange={(e) => setNewCustomer({ ...newCustomer, points: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Açılış Cari Bakiye (₺)</label>
                  <input
                    type="number"
                    value={newCustomer.balance}
                    onChange={(e) => setNewCustomer({ ...newCustomer, balance: Number(e.target.value) })}
                    placeholder="Borç için eksi (-)"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Müşteri Özel Notu (Alerji / Tercih)</label>
                <input
                  type="text"
                  value={newCustomer.notes}
                  onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                  placeholder="Örn: Cam kenarı sever, acısız tercih eder"
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
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">{selectedCustomer.name}</h3>
              <p className="text-xs text-slate-500">
                Mevcut Cari: <strong>₺{selectedCustomer.balance.toFixed(2)}</strong> • Puan: <strong>{selectedCustomer.points}</strong>
              </p>
            </div>
            <form onSubmit={handleTransactionSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTxType('pay_debt')}
                  className={`p-2.5 rounded-xl font-bold border text-center cursor-pointer ${
                    txType === 'pay_debt' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Cari Tahsilat Al (+)
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('add_debt')}
                  className={`p-2.5 rounded-xl font-bold border text-center cursor-pointer ${
                    txType === 'add_debt' ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Veresiye Borç Yaz (-)
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('earn_points')}
                  className={`p-2.5 rounded-xl font-bold border text-center cursor-pointer ${
                    txType === 'earn_points' ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Para Puan Yükle (+)
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('redeem_points')}
                  className={`p-2.5 rounded-xl font-bold border text-center cursor-pointer ${
                    txType === 'redeem_points' ? 'bg-purple-600 text-white border-purple-600' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Puan Harca (-)
                </button>
              </div>
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  {txType.includes('points') ? 'Puan Miktarı' : 'Tutar (₺)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="Örn: 500"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-sm"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">Açıklama</label>
                <input
                  type="text"
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                  placeholder="Örn: Nakit tahsilat / Özel etkinlik"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold"
                >
                  Kapat
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 text-white font-black"
                >
                  İşlemi Onayla
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
