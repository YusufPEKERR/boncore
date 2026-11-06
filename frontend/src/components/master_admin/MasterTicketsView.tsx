import React, { useState, useEffect } from 'react';
import { 
  LifeBuoy, Search, Filter, CheckCircle2, Clock, 
  AlertTriangle, ShieldAlert, Info, MessageSquare, 
  Eye, X, Send, Image as ImageIcon, Check, User, 
  Building2, ChevronRight, RefreshCw, FileText, Trash2
} from 'lucide-react';
import { sound } from '../../services/sound';

export interface SupportTicketItem {
  id: number;
  ticket_number: string;
  tenant_code: string;
  tenant_name: string;
  submitted_by_name: string;
  submitted_by_role: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  subject: string;
  description: string;
  attachment_url?: string;
  status: 'new' | 'in_review' | 'resolved' | 'closed';
  assigned_to?: string;
  resolution_notes?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  sender_type: string;
  sender_name: string;
  message: string;
  created_at: string;
}

export interface TicketAuditLog {
  id: number;
  ticket_id: number;
  action: string;
  old_value?: string;
  new_value?: string;
  performed_by: string;
  created_at: string;
}

export const MasterTicketsView: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Detail Modal / Drawer state
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketItem | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [auditLogs, setAuditLogs] = useState<TicketAuditLog[]>([]);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Status update form
  const [updatingStatus, setUpdatingStatus] = useState<string>('in_review');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [assignedAdmin, setAssignedAdmin] = useState<string>('BonCore Destek');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Reply message form
  const [replyMessage, setReplyMessage] = useState<string>('');
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);

  // Lightbox Image Preview
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // Selection & Deletion state
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async (isManual = false) => {
    if (isManual) sound.beep();
    setLoading(true);
    try {
      const res = await fetch(`/api/master/tickets?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Tickets fetch warning:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = async (ticket: SupportTicketItem) => {
    sound.beep();
    setSelectedTicket(ticket);
    setUpdatingStatus(ticket.status);
    setResolutionNotes(ticket.resolution_notes || '');
    setAssignedAdmin(ticket.assigned_to || 'BonCore Destek');
    setMessages([]);
    setAuditLogs([]);
    setLoadingDetail(true);

    try {
      const res = await fetch(`/api/master/tickets/${ticket.id}?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ticket) setSelectedTicket(data.ticket);
        if (data.messages) setMessages(data.messages);
        if (data.logs) setAuditLogs(data.logs);
      }
    } catch (err) {
      console.warn('Ticket detail fetch warning:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    sound.cashDrawer();
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/master/tickets/${selectedTicket.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: updatingStatus,
          assigned_to: assignedAdmin,
          resolution_notes: resolutionNotes,
          performed_by: 'Master Admin'
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Durum güncellenemedi.');
      }

      const data = await res.json();
      setSelectedTicket(data.ticket);
      alert(`Bilet durumu "${updatingStatus}" olarak güncellendi.`);
      fetchTickets();
      // Re-fetch detail to refresh audit logs
      handleOpenDetail(data.ticket);
    } catch (err: any) {
      alert(err.message || 'Hata oluştu.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    sound.beep();
    setIsSendingReply(true);
    try {
      const res = await fetch(`/api/master/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyMessage.trim(),
          sender_name: 'BonCore Destek Yetkilisi',
          sender_type: 'master_admin'
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Cevap iletilemedi.');
      }

      setReplyMessage('');
      // Re-fetch detail
      handleOpenDetail(selectedTicket);
    } catch (err: any) {
      alert(err.message || 'Cevap gönderilemedi.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleDeleteTicket = async (ticket: SupportTicketItem) => {
    if (!window.confirm(`"${ticket.ticket_number}" numaralı destek talebini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
      return;
    }

    sound.warning();
    setDeletingId(ticket.id);
    try {
      const res = await fetch(`/api/master/tickets/${ticket.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Bilet silinemedi.');
      }
      sound.cashDrawer();
      setTickets(prev => prev.filter(t => t.id !== ticket.id));
      setSelectedTicketIds(prev => prev.filter(id => id !== ticket.id));
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket(null);
      }
    } catch (err: any) {
      alert(err.message || 'Silme işlemi sırasında hata oluştu.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTicketIds.length === 0) return;
    if (!window.confirm(`Seçilen ${selectedTicketIds.length} adet destek talebini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
      return;
    }

    sound.warning();
    setIsBulkDeleting(true);
    try {
      const res = await fetch('/api/master/tickets/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedTicketIds })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Biletler silinemedi.');
      }
      sound.cashDrawer();
      setTickets(prev => prev.filter(t => !selectedTicketIds.includes(t.id)));
      if (selectedTicket && selectedTicketIds.includes(selectedTicket.id)) {
        setSelectedTicket(null);
      }
      setSelectedTicketIds([]);
    } catch (err: any) {
      alert(err.message || 'Toplu silme sırasında hata oluştu.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedTicketIds.length === filteredTickets.length && filteredTickets.length > 0) {
      setSelectedTicketIds([]);
    } else {
      setSelectedTicketIds(filteredTickets.map(t => t.id));
    }
  };

  const toggleSelectTicket = (id: number) => {
    setSelectedTicketIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = 
      t.ticket_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.tenant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.tenant_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.submitted_by_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
  });

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'urgent':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" /> Acil
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Yüksek
          </span>
        );
      case 'low':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
            Düşük
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800">
            Normal
          </span>
        );
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'resolved':
      case 'closed':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Çözüldü
          </span>
        );
      case 'in_review':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800 flex items-center gap-1">
            <Clock className="w-3 h-3" /> İnceleniyor
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800 flex items-center gap-1">
            <Info className="w-3 h-3" /> Yeni Talep
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Destek & Talep Yönetimi
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800 font-bold uppercase">
                  Ticketing & SLA
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Restoran POS ekranlarından iletilen arıza, donanım, menü ve fatura taleplerinin yaşam döngüsü ve yanıt takibi.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => fetchTickets(true)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-white font-bold text-xs border border-slate-300 dark:border-slate-700 transition cursor-pointer self-start md:self-auto shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-500' : 'text-slate-500'}`} />
          <span>Yenile</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Toplam Biletler</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{tickets.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Gelen tüm başvurular</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Yeni (İşlem Bekleyen)</div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
            {tickets.filter(t => t.status === 'new').length}
          </div>
          <div className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-1">İncelemeye alınmamış</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">İncelenen Talepler</div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
            {tickets.filter(t => t.status === 'in_review').length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Teknik ekip işlemde</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Çözülen Talepler</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Sonuçlandırılmış biletler</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Bilet No, konu, işletme veya yetkili ara..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Bulk Delete Button */}
          {selectedTicketIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isBulkDeleting ? 'Siliniyor...' : `Seçilenleri Sil (${selectedTicketIds.length})`}</span>
            </button>
          )}

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white font-bold"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="new">Yeni</option>
            <option value="in_review">İnceleniyor</option>
            <option value="resolved">Çözüldü</option>
            <option value="closed">Kapatıldı</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white font-bold"
          >
            <option value="all">Tüm Öncelikler</option>
            <option value="urgent">Acil</option>
            <option value="high">Yüksek</option>
            <option value="normal">Normal</option>
            <option value="low">Düşük</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white font-bold"
          >
            <option value="all">Tüm Kategoriler</option>
            <option value="pos">Kasa & POS</option>
            <option value="hardware">Donanım</option>
            <option value="bug">Hata (Bug)</option>
            <option value="menu">Menü</option>
            <option value="billing">Fatura</option>
            <option value="other">Diğer</option>
          </select>
        </div>
      </div>

      {/* Tickets List */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {filteredTickets.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Eşleşen destek bileti bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase font-black text-[10px] bg-slate-50 dark:bg-slate-850">
                  <th className="p-3.5 pl-4 w-10">
                    <input
                      type="checkbox"
                      checked={filteredTickets.length > 0 && selectedTicketIds.length === filteredTickets.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      title="Tümünü Seç / Kaldır"
                    />
                  </th>
                  <th className="p-3.5">Bilet No</th>
                  <th className="p-3.5">İşletme</th>
                  <th className="p-3.5">Konu & Kategori</th>
                  <th className="p-3.5">Öncelik</th>
                  <th className="p-3.5">Durum</th>
                  <th className="p-3.5">Ek</th>
                  <th className="p-3.5">Tarih</th>
                  <th className="p-3.5 pr-5 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td className="p-3.5 pl-4">
                      <input
                        type="checkbox"
                        checked={selectedTicketIds.includes(t.id)}
                        onChange={() => toggleSelectTicket(t.id)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                      {t.ticket_number}
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900 dark:text-white">{t.tenant_name}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">@{t.tenant_code} • {t.submitted_by_name}</div>
                    </td>
                    <td className="p-3.5 max-w-xs">
                      <div className="font-extrabold text-slate-900 dark:text-white truncate">{t.subject}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">{t.category}</div>
                    </td>
                    <td className="p-3.5">{getPriorityBadge(t.priority)}</td>
                    <td className="p-3.5">{getStatusBadge(t.status)}</td>
                    <td className="p-3.5">
                      {t.attachment_url ? (
                        <button
                          onClick={() => setLightboxImageUrl(t.attachment_url || null)}
                          className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>Görsel</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      {new Date(t.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3.5 pr-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenDetail(t)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-bold border border-slate-300 dark:border-slate-700 transition cursor-pointer"
                        >
                          İncele & Yanıtla
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTicket(t);
                          }}
                          disabled={deletingId === t.id}
                          className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 transition cursor-pointer"
                          title="Talebi Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DETAIL MODAL / DRAWER */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">{selectedTicket.ticket_number}</span>
                  {getStatusBadge(selectedTicket.status)}
                  {getPriorityBadge(selectedTicket.priority)}
                </div>
                <h3 className="font-black text-slate-900 dark:text-white text-base mt-1">{selectedTicket.subject}</h3>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                  <span>{selectedTicket.tenant_name} (@{selectedTicket.tenant_code})</span>
                  <span>•</span>
                  <span>Gönderen: {selectedTicket.submitted_by_name} ({selectedTicket.submitted_by_role})</span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedTicket(null)} 
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs flex-1">
              
              {/* Description & Screenshot */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">İşletme Bildirimi</div>
                <p className="text-slate-900 dark:text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">{selectedTicket.description}</p>
                
                {selectedTicket.attachment_url && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-1.5 flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Ekran Görüntüsü Eklenmiş (Büyütmek için tıklayın):</span>
                    </div>
                    <img 
                      src={selectedTicket.attachment_url} 
                      alt="Ticket attachment" 
                      onClick={() => setLightboxImageUrl(selectedTicket.attachment_url || null)}
                      className="max-h-48 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer hover:opacity-90 transition object-contain bg-black/10 dark:bg-black/40"
                    />
                  </div>
                )}
              </div>

              {/* Status Update Form */}
              <form onSubmit={handleUpdateStatus} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-bold text-slate-800 dark:text-slate-300 text-xs flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Bilet Yaşam Döngüsü & Çözüm Durumu Güncelle</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1 text-slate-600 dark:text-slate-400 font-bold">Yeni Durum</label>
                    <select
                      value={updatingStatus}
                      onChange={(e) => setUpdatingStatus(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                    >
                      <option value="new">Yeni</option>
                      <option value="in_review">İnceleniyor (Teknik Ekipte)</option>
                      <option value="resolved">Çözüldü (İşlem Tamamlandı)</option>
                      <option value="closed">Kapatıldı</option>
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 text-slate-600 dark:text-slate-400 font-bold">Atanan Destek Uzmanı</label>
                    <input
                      type="text"
                      value={assignedAdmin}
                      onChange={(e) => setAssignedAdmin(e.target.value)}
                      placeholder="Yetkili Adı"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1 text-slate-600 dark:text-slate-400 font-bold">Çözüm Notu / Açıklama</label>
                  <textarea
                    rows={2}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="İşletmeye gösterilecek çözüm veya bilgilendirme notu..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingStatus}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black cursor-pointer shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  {isUpdatingStatus ? 'Güncelleniyor...' : 'Durumu ve Çözüm Notunu Kaydet'}
                </button>
              </form>

              {/* Reply Messages Thread */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-extrabold text-slate-700 dark:text-slate-300 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                    <LifeBuoy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Mesajlaşma & Yanıt Geçmişi ({messages.length})</span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    Canlı İletişim Akışı
                  </span>
                </div>

                {messages.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-white dark:bg-slate-850 text-slate-400 dark:text-slate-500 text-center border border-slate-200 dark:border-slate-800 shadow-2xs">
                    Henüz bir mesajlaşma kaydı bulunmuyor. Aşağıdaki alandan ilk yanıtı gönderebilirsiniz.
                  </div>
                ) : (
                  <div className="space-y-3 p-1">
                    {messages.map((m) => {
                      const isSupport = m.sender_type === 'master_admin';
                      return (
                        <div 
                          key={m.id}
                          className={`p-4 rounded-2xl text-xs transition-all border shadow-xs ${
                            isSupport 
                              ? 'ml-6 sm:ml-12 bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80 rounded-tr-xs' 
                              : 'mr-6 sm:mr-12 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 rounded-tl-xs shadow-sm'
                          }`}
                          style={
                            isSupport 
                              ? { backgroundColor: undefined } 
                              : { }
                          }
                        >
                          <div className="flex items-center justify-between text-[11px] mb-2 pb-1.5 border-b border-slate-200/60 dark:border-slate-700/50">
                            <div className="flex items-center gap-2">
                              {isSupport ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-2xs">
                                  <span>🎧 SaaS Destek</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                                  <span>👤 İşletme / Restoran</span>
                                </span>
                              )}
                              <span className={`font-black text-xs ${isSupport ? 'text-emerald-900 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>
                                {m.sender_name}
                              </span>
                            </div>
                            <span className={`font-mono text-[10px] font-bold ${isSupport ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                              {new Date(m.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          <p className={`text-[13px] leading-relaxed font-semibold whitespace-pre-wrap ${
                            isSupport 
                              ? 'text-emerald-950 dark:text-emerald-100' 
                              : 'text-slate-900 dark:text-slate-100'
                          }`}>
                            {m.message}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reply Form */}
                <form onSubmit={handleSendReply} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Restorana doğrudan yanıt mesajı yazın..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={isSendingReply || !replyMessage.trim()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Gönder</span>
                  </button>
                </form>
              </div>

              {/* Audit Trail */}
              {auditLogs.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="font-bold text-slate-500 uppercase text-[10px] tracking-wider">
                    Bilet Değişiklik Günlüğü (Audit Trail)
                  </div>
                  <div className="space-y-1">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800">
                        <span>
                          <strong className="text-slate-900 dark:text-slate-200">{log.performed_by}</strong> — İşlem: <span className="text-slate-700 dark:text-slate-300">{log.action}</span>
                          {log.old_value && log.new_value && (
                            <span> ({log.old_value} ➔ {log.new_value})</span>
                          )}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {new Date(log.created_at).toLocaleTimeString('tr-TR')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => handleDeleteTicket(selectedTicket)}
                disabled={deletingId === selectedTicket.id}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 font-bold text-xs cursor-pointer transition shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingId === selectedTicket.id ? 'Siliniyor...' : 'Bu Talebi Sil'}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold cursor-pointer transition"
              >
                Kapat
              </button>
            </div>

          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL */}
      {lightboxImageUrl && (
        <div 
          onClick={() => setLightboxImageUrl(null)}
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700 bg-black">
            <button
              onClick={() => setLightboxImageUrl(null)}
              className="absolute top-3 right-3 p-2 rounded-xl bg-black/60 text-white hover:bg-black cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img 
              src={lightboxImageUrl} 
              alt="Screenshot full size" 
              className="max-h-[85vh] max-w-full object-contain"
            />
          </div>
        </div>
      )}

    </div>
  );
};
