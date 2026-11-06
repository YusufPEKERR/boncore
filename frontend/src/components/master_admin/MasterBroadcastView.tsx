import React, { useState, useEffect } from 'react';
import { 
  Megaphone, Send, Clock, CheckCircle2, AlertTriangle, 
  Info, ShieldAlert, Sparkles, Filter, X, Volume2, 
  Smartphone, Layers, Trash2, PauseCircle, PlayCircle,
  XCircle, RefreshCw, Edit
} from 'lucide-react';
import { sound } from '../../services/sound';

export interface BroadcastAnnouncement {
  id: number;
  title: string;
  content: string;
  banner_type: 'info' | 'warning' | 'urgent' | 'success';
  target_type: 'all' | 'specific_tenants' | 'plan';
  target_tenant_ids?: string;
  target_plans?: string;
  show_as_popup: boolean;
  dismissible: boolean;
  is_active: boolean;
  starts_at?: string;
  expires_at?: string;
  sent_by?: string;
  created_at: string;
}

interface MasterBroadcastViewProps {
  tenants: any[];
}

export const MasterBroadcastView: React.FC<MasterBroadcastViewProps> = ({ tenants }) => {
  const [announcements, setAnnouncements] = useState<BroadcastAnnouncement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<BroadcastAnnouncement | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Form State
  const [form, setForm] = useState<{
    title: string;
    content: string;
    banner_type: 'info' | 'warning' | 'urgent' | 'success';
    target_type: 'all' | 'specific_tenants' | 'plan';
    selectedTenants: string[];
    selectedPlans: string[];
    show_as_popup: boolean;
    dismissible: boolean;
  }>({
    title: '',
    content: '',
    banner_type: 'info',
    target_type: 'all',
    selectedTenants: [],
    selectedPlans: ['starter', 'pro', 'enterprise'],
    show_as_popup: true,
    dismissible: true
  });

  const resetForm = () => {
    setForm({
      title: '',
      content: '',
      banner_type: 'info',
      target_type: 'all',
      selectedTenants: [],
      selectedPlans: ['starter', 'pro', 'enterprise'],
      show_as_popup: true,
      dismissible: true
    });
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/master/announcements?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Announcements fetch warning:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNewComposer = () => {
    sound.beep();
    setEditingAnnouncement(null);
    resetForm();
    setIsComposerOpen(true);
  };

  const handleOpenEdit = (item: BroadcastAnnouncement) => {
    sound.beep();
    setEditingAnnouncement(item);
    
    let parsedTenants: string[] = [];
    try {
      if (item.target_tenant_ids) {
        parsedTenants = JSON.parse(item.target_tenant_ids);
      }
    } catch {}

    let parsedPlans: string[] = ['starter', 'pro', 'enterprise'];
    try {
      if (item.target_plans) {
        parsedPlans = JSON.parse(item.target_plans);
      }
    } catch {}

    setForm({
      title: item.title,
      content: item.content,
      banner_type: item.banner_type,
      target_type: item.target_type,
      selectedTenants: Array.isArray(parsedTenants) ? parsedTenants : [],
      selectedPlans: Array.isArray(parsedPlans) ? parsedPlans : ['starter', 'pro', 'enterprise'],
      show_as_popup: item.show_as_popup,
      dismissible: item.dismissible
    });
    setIsComposerOpen(true);
  };

  const handleToggleActive = async (id: number) => {
    sound.beep();
    setTogglingId(id);
    try {
      const res = await fetch(`/api/master/announcements/${id}/toggle`, {
        method: 'PATCH'
      });
      if (!res.ok) {
        throw new Error('Duyuru durumu güncellenemedi.');
      }
      const data = await res.json();
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_active: data.is_active } : a));
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteAnnouncement = async (id: number, title: string) => {
    sound.warning();
    if (!window.confirm(`"${title}" duyurusunu sistemden tamamen silmek istediğinize emin misiniz?`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/master/announcements/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        throw new Error('Duyuru silinemedi.');
      }
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      alert('Başlık ve duyuru içeriği zorunludur.');
      return;
    }

    sound.cashDrawer();
    setIsSending(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        banner_type: form.banner_type,
        target_type: form.target_type,
        target_tenant_ids: JSON.stringify(form.selectedTenants),
        target_plans: JSON.stringify(form.selectedPlans),
        show_as_popup: form.show_as_popup,
        dismissible: form.dismissible,
        sent_by: 'Master Admin'
      };

      if (editingAnnouncement) {
        const res = await fetch(`/api/master/announcements/${editingAnnouncement.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Duyuru güncellenemedi.');
        }

        alert('Duyuru başarıyla güncellendi!');
      } else {
        const res = await fetch('/api/master/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Duyuru gönderilemedi.');
        }

        alert('Duyuru başarıyla yayınlandı ve tüm bağlı restoran POS terminallerine anlık iletildi!');
      }

      setIsComposerOpen(false);
      setEditingAnnouncement(null);
      resetForm();
      fetchAnnouncements();
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    } finally {
      setIsSending(false);
    }
  };

  const toggleTenant = (code: string) => {
    setForm(prev => {
      const exists = prev.selectedTenants.includes(code);
      return {
        ...prev,
        selectedTenants: exists ? prev.selectedTenants.filter(c => c !== code) : [...prev.selectedTenants, code]
      };
    });
  };

  const togglePlan = (plan: string) => {
    setForm(prev => {
      const exists = prev.selectedPlans.includes(plan);
      return {
        ...prev,
        selectedPlans: exists ? prev.selectedPlans.filter(p => p !== plan) : [...prev.selectedPlans, plan]
      };
    });
  };

  const getBannerBadge = (type: string) => {
    switch (type) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-950 text-red-400 border border-red-800 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Acil</span>;
      case 'warning':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-950 text-amber-400 border border-amber-800 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Uyarı</span>;
      case 'success':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Başarı</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-950 text-blue-400 border border-blue-800 flex items-center gap-1"><Info className="w-3 h-3" /> Bilgi</span>;
    }
  };

  const activeAnnouncements = announcements.filter(a => a.is_active);
  const inactiveAnnouncements = announcements.filter(a => !a.is_active);

  const filteredAnnouncements = announcements.filter(a => {
    if (statusFilter === 'active') return a.is_active;
    if (statusFilter === 'inactive') return !a.is_active;
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Duyuru & Bildirim Merkezi
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800 font-bold uppercase">
                  WebSocket Canlı Yayın
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Tüm restoran POS terminallerine veya hedef işletmelere anlık bildirim, sistem güncelleme uyarısı veya acil duyuru gönderin.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenNewComposer}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs shadow-md shadow-amber-600/20 transition cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>Yeni Canlı Duyuru Yayınla</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium mb-1">Toplam Duyurular</div>
          <div className="text-2xl font-black text-white">{announcements.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">Sistem geçmişindeki tüm anonslar</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium mb-1">Canlı Yayında (Aktif)</div>
          <div className="text-2xl font-black text-emerald-400">{activeAnnouncements.length} Duyuru</div>
          <div className="text-[11px] text-slate-500 mt-1">POS terminallerinde görüntülenenler</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium mb-1">Durdurulan (Devre Dışı)</div>
          <div className="text-2xl font-black text-slate-400">{inactiveAnnouncements.length} Duyuru</div>
          <div className="text-[11px] text-slate-500 mt-1">Yayından kaldırılan / arşivlenenler</div>
        </div>
      </div>

      {/* Announcement History List */}
      <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-white text-base">Yayın Geçmişi & Duyuru Yönetimi</h3>
            <p className="text-xs text-slate-400">Duyuruları dilediğiniz an yayına alabilir veya devre dışı bırakabilirsiniz</p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Buttons */}
            <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700 text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  statusFilter === 'all' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tümü ({announcements.length})
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                Aktif ({activeAnnouncements.length})
              </button>
              <button
                onClick={() => setStatusFilter('inactive')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  statusFilter === 'inactive' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                Devre Dışı ({inactiveAnnouncements.length})
              </button>
            </div>

            <button
              onClick={fetchAnnouncements}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 cursor-pointer"
              title="Yenile"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {filteredAnnouncements.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            {statusFilter === 'all' 
              ? 'Henüz yayınlanmış bir duyuru bulunmuyor.' 
              : statusFilter === 'active' 
                ? 'Şu anda canlı yayında olan aktif bir duyuru yok.' 
                : 'Devre dışı bırakılmış duyuru bulunmuyor.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-850">
            {filteredAnnouncements.map((item) => (
              <div key={item.id} className={`p-5 transition space-y-3 ${item.is_active ? 'hover:bg-slate-850/50' : 'bg-slate-950/40 opacity-75 hover:opacity-100'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {getBannerBadge(item.banner_type)}
                    
                    {/* Status Badge */}
                    {item.is_active ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1 shadow-xs">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Yayında (Aktif)</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-slate-500" />
                        <span>Devre Dışı (Pasif)</span>
                      </span>
                    )}

                    <h4 className="font-extrabold text-white text-sm">{item.title}</h4>
                    {item.show_as_popup && (
                      <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full font-bold">
                        Popup Dialog
                      </span>
                    )}
                  </div>

                  {/* Actions & Meta */}
                  <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1 font-mono text-[11px]">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(item.created_at).toLocaleString('tr-TR')}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-300 font-bold">Hedef: {item.target_type === 'all' ? 'Tüm Restoranlar' : item.target_type}</span>

                    {/* Edit Button */}
                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Duyuruyu Düzenle"
                    >
                      <Edit className="w-3.5 h-3.5 text-amber-400" />
                      <span>Düzenle</span>
                    </button>

                    {/* Toggle Button */}
                    <button
                      onClick={() => handleToggleActive(item.id)}
                      disabled={togglingId === item.id}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                        item.is_active
                          ? 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-800/80'
                          : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-800/80'
                      }`}
                      title={item.is_active ? 'Duyuruyu yayından kaldır (devre dışı bırak)' : 'Duyuruyu tekrar yayına al (aktifleştir)'}
                    >
                      {item.is_active ? (
                        <>
                          <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                          <span>{togglingId === item.id ? 'Durduruluyor...' : 'Devre Dışı Bırak'}</span>
                        </>
                      ) : (
                        <>
                          <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{togglingId === item.id ? 'Aktifleştiriliyor...' : 'Yayına Al (Aktifleştir)'}</span>
                        </>
                      )}
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDeleteAnnouncement(item.id, item.title)}
                      disabled={deletingId === item.id}
                      className="p-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 transition cursor-pointer disabled:opacity-50"
                      title="Duyuruyu Tamamen Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-slate-850 p-3 rounded-xl border border-slate-800/80">
                  {item.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* COMPOSER MODAL */}
      {isComposerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-fadeIn">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">
                    {editingAnnouncement ? 'Duyuruyu Düzenle' : 'Canlı Duyuru Yayınla'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {editingAnnouncement ? 'Duyuru başlığını, içeriğini ve hedef kitlesini güncelleyin' : 'Tüm POS terminallerinde anında sesli ve görsel bildirim tetikler'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsComposerOpen(false)} 
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendBroadcast} className="p-6 space-y-4 text-xs">
              
              <div>
                <label className="block mb-1 text-slate-300 font-bold">Duyuru Başlığı *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Örn: BonCore POS 2.4 Güncellemesi Yayında"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-300 font-bold">Duyuru İçeriği *</label>
                <textarea
                  rows={4}
                  required
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Restoran personelinin ve yöneticilerin göreceği ayrıntılı mesaj..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Banner Type Selection */}
              <div>
                <label className="block mb-1.5 text-slate-300 font-bold">Duyuru Türü / Aciliyet Seviyesi</label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, banner_type: 'info' })}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      form.banner_type === 'info' 
                        ? 'bg-blue-950 border-blue-500 text-blue-300 font-bold' 
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <Info className="w-4 h-4 mx-auto mb-1 text-blue-400" />
                    <span>Bilgi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, banner_type: 'warning' })}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      form.banner_type === 'warning' 
                        ? 'bg-amber-950 border-amber-500 text-amber-300 font-bold' 
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-amber-400" />
                    <span>Uyarı</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, banner_type: 'urgent' })}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      form.banner_type === 'urgent' 
                        ? 'bg-red-950 border-red-500 text-red-300 font-bold' 
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4 mx-auto mb-1 text-red-400" />
                    <span>Acil</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, banner_type: 'success' })}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      form.banner_type === 'success' 
                        ? 'bg-emerald-950 border-emerald-500 text-emerald-300 font-bold' 
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                    <span>Başarı</span>
                  </button>
                </div>
              </div>

              {/* Target Selector */}
              <div>
                <label className="block mb-1.5 text-slate-300 font-bold">Hedef Kitle</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, target_type: 'all' })}
                    className={`p-2 rounded-xl border text-center font-bold transition cursor-pointer ${
                      form.target_type === 'all' 
                        ? 'bg-indigo-950 border-indigo-500 text-indigo-300' 
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Tüm Restoranlar
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, target_type: 'specific_tenants' })}
                    className={`p-2 rounded-xl border text-center font-bold transition cursor-pointer ${
                      form.target_type === 'specific_tenants' 
                        ? 'bg-indigo-950 border-indigo-500 text-indigo-300' 
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Seçili Restoranlar
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, target_type: 'plan' })}
                    className={`p-2 rounded-xl border text-center font-bold transition cursor-pointer ${
                      form.target_type === 'plan' 
                        ? 'bg-indigo-950 border-indigo-500 text-indigo-300' 
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Pakete Göre
                  </button>
                </div>

                {form.target_type === 'specific_tenants' && (
                  <div className="max-h-32 overflow-y-auto p-2 rounded-xl bg-slate-850 border border-slate-800 space-y-1">
                    {tenants.map(t => (
                      <label key={t.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-800 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.selectedTenants.includes(t.code)}
                          onChange={() => toggleTenant(t.code)}
                          className="rounded text-indigo-600"
                        />
                        <span className="font-bold">{t.name}</span>
                        <span className="font-mono text-[10px] text-slate-500">(@{t.code})</span>
                      </label>
                    ))}
                  </div>
                )}

                {form.target_type === 'plan' && (
                  <div className="flex gap-2 p-2 rounded-xl bg-slate-850 border border-slate-800">
                    {['starter', 'pro', 'enterprise'].map(p => (
                      <label key={p} className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer uppercase font-bold text-[11px]">
                        <input
                          type="checkbox"
                          checked={form.selectedPlans.includes(p)}
                          onChange={() => togglePlan(p)}
                          className="rounded text-indigo-600"
                        />
                        <span>{p}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Toggles */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-850 border border-slate-800">
                <label className="flex items-center gap-2 text-slate-300 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.show_as_popup}
                    onChange={(e) => setForm({ ...form, show_as_popup: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-0"
                  />
                  <span>Açılır Pencere (Modal Popup) olarak göster</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.dismissible}
                    onChange={(e) => setForm({ ...form, dismissible: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-0"
                  />
                  <span>Kullanıcı kapatabilsin (Dismissible)</span>
                </label>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsComposerOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSending}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black cursor-pointer shadow-md shadow-amber-600/30 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{editingAnnouncement ? (isSending ? 'Güncelleniyor...' : 'Duyuru Değişikliklerini Kaydet') : (isSending ? 'Yayınlanıyor...' : 'Duyuruyu Canlı Yayınla')}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
