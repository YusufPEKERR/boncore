import React, { useState, useEffect } from 'react';
import { 
  LifeBuoy, X, Upload, CheckCircle2, AlertTriangle, 
  Send, PhoneCall, Wifi, Clock, MessageSquare, 
  Image as ImageIcon, RefreshCw, FileText, ChevronRight,
  ArrowLeft, CheckCircle, ShieldCheck, User, Headphones, ExternalLink
} from 'lucide-react';
import { sound } from '../../services/sound';

interface SupportTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: any;
  initialTicketId?: number | null;
}

export const SupportTicketModal: React.FC<SupportTicketModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialTicketId
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [category, setCategory] = useState<string>('pos');
  const [priority, setPriority] = useState<string>('normal');
  const [subject, setSubject] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedTicket, setSubmittedTicket] = useState<any | null>(null);

  // History & Conversation state
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [replyMessage, setReplyMessage] = useState<string>('');
  const [sendingReply, setSendingReply] = useState<boolean>(false);
  const [previewZoomImage, setPreviewZoomImage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialTicketId || activeTab === 'history') {
        fetchTicketHistory(initialTicketId);
      }
    } else {
      setSelectedTicket(null);
      setPreviewZoomImage(null);
    }
  }, [isOpen, activeTab, initialTicketId]);

  const fetchTicketHistory = async (targetTicketId?: number | null) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/support/tickets?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setTickets(list);

        if (targetTicketId) {
          const match = list.find((t: any) => t.id === targetTicketId || t.ticket_number === String(targetTicketId));
          if (match) {
            setSelectedTicket(match);
            setActiveTab('history');
          }
        } else if (selectedTicket) {
          const updated = list.find((t: any) => t.id === selectedTicket.id);
          if (updated) setSelectedTicket(updated);
        }
      }
    } catch (err) {
      console.warn('History fetch warning:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleRemoveFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      alert('Lütfen konu ve açıklama giriniz.');
      return;
    }

    sound.beep();
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('priority', priority);
      formData.append('subject', subject.trim());
      formData.append('description', description.trim());
      formData.append('submitted_by_name', currentUser?.name || 'Kasa Yetkilisi');
      formData.append('submitted_by_role', currentUser?.role || 'cashier');
      formData.append('device_info', `${navigator.userAgent} | Ekran: ${window.innerWidth}x${window.innerHeight}`);

      if (selectedFile) {
        formData.append('screenshot', selectedFile);
      }

      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Talep iletilemedi.');
      }

      const data = await res.json();
      sound.cashDrawer();
      setSubmittedTicket(data.ticket);
    } catch (err: any) {
      alert(err.message || 'Destek talebi gönderilirken bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    sound.beep();
    setSendingReply(true);
    try {
      const senderName = currentUser?.name || 'Restoran Yetkilisi';
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyMessage.trim(),
          sender_name: senderName
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Cevap gönderilemedi.');
      }

      const resData = await res.json();
      sound.cashDrawer();
      setReplyMessage('');

      // Optimistically append new message
      const newMsg = resData.data || {
        id: Date.now(),
        ticket_id: selectedTicket.id,
        sender_type: 'tenant',
        sender_name: senderName,
        message: replyMessage.trim(),
        created_at: new Date().toISOString()
      };

      const updatedTicket = {
        ...selectedTicket,
        messages: [...(selectedTicket.messages || []), newMsg]
      };
      setSelectedTicket(updatedTicket);
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? updatedTicket : t));
    } catch (err: any) {
      alert(err.message || 'Cevap iletilirken hata oluştu.');
    } finally {
      setSendingReply(false);
    }
  };

  const resetForm = () => {
    setSubject('');
    setDescription('');
    handleRemoveFile();
    setSubmittedTicket(null);
  };

  // Count tickets with replies from master_admin
  const ticketsWithRepliesCount = tickets.filter(
    t => (t.messages && t.messages.some((m: any) => m.sender_type === 'master_admin')) || t.resolution_notes
  ).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-[#338d35] dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                BonCore POS Destek Merkezi
              </h3>
              <p className="text-xs text-slate-500">7/24 Canlı Destek ve Arıza Takip Sistemi</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Contact Bar */}
        <div className="grid grid-cols-2 gap-2 p-2.5 sm:p-3 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 shrink-0 text-xs">
          <a href="tel:08503050505" className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-750 transition">
            <PhoneCall className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="truncate">
              <div className="text-[10px] text-slate-400 font-bold">Çağrı Merkezi</div>
              <div className="font-mono font-bold text-slate-800 dark:text-white text-xs">0850 305 05 05</div>
            </div>
          </a>
          <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-blue-600 shrink-0" />
            <div className="truncate">
              <div className="text-[10px] text-slate-400 font-bold">Uzak Masaüstü ID</div>
              <div className="font-mono font-bold text-slate-800 dark:text-white text-xs">BON-849-210</div>
            </div>
          </div>
        </div>

        {/* Tabs: Create Ticket vs History */}
        {!selectedTicket && (
          <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-bold px-4 pt-2 bg-slate-50 dark:bg-slate-850 shrink-0">
            <button
              onClick={() => { sound.beep(); setActiveTab('create'); }}
              className={`pb-2.5 px-3 border-b-2 transition cursor-pointer ${
                activeTab === 'create'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              Yeni Talep Oluştur
            </button>
            <button
              onClick={() => { sound.beep(); setActiveTab('history'); }}
              className={`pb-2.5 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <span>Önceki Taleplerim</span>
              {ticketsWithRepliesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-500 text-white">
                  {ticketsWithRepliesCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Tab Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 text-xs">
          {selectedTicket ? (
            /* ================= TICKET CONVERSATION DETAIL VIEW ================= */
            <div className="space-y-4 animate-fadeIn flex flex-col h-full">
              {/* Back & Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  onClick={() => { sound.beep(); setSelectedTicket(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Taleplere Dön</span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-slate-800 dark:text-slate-200 text-xs">
                    {selectedTicket.ticket_number}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    selectedTicket.status === 'resolved' || selectedTicket.status === 'closed'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                      : selectedTicket.status === 'in_review'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                  }`}>
                    {selectedTicket.status === 'new' ? 'Yeni' : selectedTicket.status === 'in_review' ? 'İnceleniyor' : selectedTicket.status === 'resolved' ? 'Çözüldü' : 'Kapatıldı'}
                  </span>
                </div>
              </div>

              {/* Ticket Subject Title */}
              <div className="space-y-1">
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  {selectedTicket.subject}
                </h4>
                <div className="text-[11px] text-slate-400 flex items-center gap-3">
                  <span>Kategori: <strong className="text-slate-600 dark:text-slate-300 uppercase">{selectedTicket.category}</strong></span>
                  <span>Öncelik: <strong className="text-slate-600 dark:text-slate-300 uppercase">{selectedTicket.priority}</strong></span>
                  <span>Tarih: <strong className="text-slate-600 dark:text-slate-300">{new Date(selectedTicket.created_at).toLocaleString('tr-TR')}</strong></span>
                </div>
              </div>

              {/* Resolution Note Banner (if resolved or has notes) */}
              {selectedTicket.resolution_notes && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 space-y-1.5 shadow-xs">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-extrabold text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Teknik Destek Çözüm / Bilgilendirme Notu</span>
                  </div>
                  <p className="text-emerald-950 dark:text-emerald-100 font-medium text-xs leading-relaxed whitespace-pre-wrap pl-6">
                    {selectedTicket.resolution_notes}
                  </p>
                </div>
              )}

              {/* Initial Request Card */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{selectedTicket.submitted_by_name || 'Restoran Yetkilisi'} ({selectedTicket.submitted_by_role || 'kasa'})</span>
                  </span>
                  <span className="text-slate-400 text-[10px]">İlk Bildirim</span>
                </div>
                <p className="text-slate-800 dark:text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">
                  {selectedTicket.description}
                </p>

                {/* Attached Screenshot */}
                {selectedTicket.attachment_url && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400 block mb-1">Ekli Ekran Görüntüsü:</span>
                    <div 
                      onClick={() => setPreviewZoomImage(selectedTicket.attachment_url)}
                      className="inline-block relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 cursor-pointer group max-w-[200px]"
                    >
                      <img 
                        src={selectedTicket.attachment_url} 
                        alt="Talep Ekran Görüntüsü" 
                        className="h-20 w-auto object-cover group-hover:opacity-80 transition"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-white text-[10px] font-bold gap-1">
                        <ExternalLink className="w-3 h-3" />
                        <span>Büyüt</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Conversation Messages Thread */}
              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                <div className="text-[11px] font-bold text-slate-400 flex items-center gap-2 my-2">
                  <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                  <span>Yanıtlar ve Görüşmeler</span>
                  <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                </div>

                {(!selectedTicket.messages || selectedTicket.messages.length === 0) ? (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-slate-400 text-xs italic">
                    {selectedTicket.resolution_notes 
                      ? 'Destek ekibi yukarıdaki çözüm notu ile yanıt vermiştir. Ekstra sorunuz varsa aşağıdan yazabilirsiniz.'
                      : 'Talebiniz destek ekibimiz tarafından henüz yanıtlanmadı. Ekibimiz inceliyor...'}
                  </div>
                ) : (
                  selectedTicket.messages.map((m: any) => {
                    const isSupport = m.sender_type === 'master_admin';
                    return (
                      <div 
                        key={m.id} 
                        className={`flex flex-col ${isSupport ? 'items-start' : 'items-end'}`}
                      >
                        <div className={`max-w-[85%] rounded-2xl p-3.5 space-y-1.5 transition-all border shadow-xs ${
                          isSupport 
                            ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80 rounded-tl-xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 rounded-tr-xs shadow-sm'
                        }`}>
                          <div className="flex items-center justify-between gap-3 text-[10px] font-bold pb-1 border-b border-slate-200/50 dark:border-slate-700/50">
                            <span className="flex items-center gap-1.5 font-black">
                              {isSupport ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-600 text-white">
                                  <Headphones className="w-3 h-3" />
                                  <span>Destek</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                  <User className="w-3 h-3" />
                                  <span>Siz</span>
                                </span>
                              )}
                              <span className={isSupport ? 'text-emerald-900 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}>
                                {isSupport ? `BonCore SaaS Destek (${m.sender_name})` : m.sender_name}
                              </span>
                            </span>
                            <span className={`font-mono text-[10px] font-bold ${isSupport ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                              {new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className={`text-xs font-semibold leading-relaxed whitespace-pre-wrap ${
                            isSupport 
                              ? 'text-emerald-950 dark:text-emerald-100' 
                              : 'text-slate-900 dark:text-slate-100'
                          }`}>
                            {m.message}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Box */}
              <form onSubmit={handleSendReply} className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Destek ekibine yanıt veya ek bilgi yazınız..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyMessage.trim()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-sm shadow-emerald-600/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingReply ? 'Gönderiliyor...' : 'Yanıtla'}</span>
                </button>
              </form>
            </div>
          ) : activeTab === 'create' ? (
            submittedTicket ? (
              <div className="p-6 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-3 animate-fadeIn">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <h4 className="font-black text-lg text-emerald-900 dark:text-emerald-200">
                  Destek Talebiniz Alındı!
                </h4>
                <div className="inline-block px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 font-mono font-black text-xs text-emerald-700 dark:text-emerald-300">
                  Talep No: {submittedTicket.ticket_number}
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-xs max-w-md mx-auto">
                  Talebiniz teknik destek ekibimizin ekranına düştü. Ekip arkadaşlarımız en kısa sürede inceleyip dönüş yapacaktır. Dönüş sağlandığında sisteminizden bildirim alacaksınız.
                </p>
                <div className="flex justify-center gap-3 pt-2">
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                  >
                    Yeni Talep Yaz
                  </button>
                  <button
                    onClick={() => {
                      resetForm();
                      setActiveTab('history');
                      fetchTicketHistory();
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                  >
                    Taleplerimi Görüntüle
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Category & Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1 text-slate-700 dark:text-slate-300 font-bold">Kategori</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
                    >
                      <option value="pos">Kasa & Adisyon Sorunu</option>
                      <option value="hardware">Yazıcı & Donanım Arızası</option>
                      <option value="bug">Sistem Hatası (Bug)</option>
                      <option value="menu">Menü / Fiyat Güncelleme</option>
                      <option value="billing">Fatura & SaaS Abonelik</option>
                      <option value="other">Diğer Genel Talepler</option>
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 text-slate-700 dark:text-slate-300 font-bold">Öncelik Seviyesi</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
                    >
                      <option value="low">Düşük</option>
                      <option value="normal">Normal</option>
                      <option value="high">Yüksek (İşletmeyi Etkiliyor)</option>
                      <option value="urgent">Acil (Kasa Kilitlendi)</option>
                    </select>
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block mb-1 text-slate-700 dark:text-slate-300 font-bold">Talep Konusu *</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Örn: Mutfak fiş yazıcısı sipariş çıktısı vermiyor"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block mb-1 text-slate-700 dark:text-slate-300 font-bold">Ayrıntılı Açıklama *</label>
                  <textarea
                    rows={4}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Lütfen sorunun ne zaman başladığını ve ekranda aldığınız hatayı tarif edin..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                  />
                </div>

                {/* Screenshot Upload Attachment */}
                <div>
                  <label className="block mb-1 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-between">
                    <span>Ekran Görüntüsü / Fotoğraf (İsteğe Bağlı)</span>
                    {previewUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="text-red-500 hover:underline text-[11px] font-bold cursor-pointer"
                      >
                        Görseli Kaldır
                      </button>
                    )}
                  </label>

                  {previewUrl ? (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 max-h-36 bg-slate-900 flex items-center justify-center">
                      <img src={previewUrl} alt="Screenshot preview" className="max-h-36 object-contain" />
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition bg-slate-50 dark:bg-slate-850">
                      <Upload className="w-6 h-6 text-slate-400 mb-1" />
                      <span className="font-bold text-slate-700 dark:text-slate-300">Görsel Seç veya Ekran Görüntüsü Yükle</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">PNG, JPG veya WEBP (Maks 10 MB)</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Action Submit */}
                <div className="pt-2 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow-md shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSubmitting ? 'İletiliyor...' : 'Destek Talebini Gönder'}</span>
                  </button>
                </div>

              </form>
            )
          ) : (
            /* ================= HISTORY LIST TAB ================= */
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-500 font-bold">Önceki Destek Başvuruları</span>
                <button
                  onClick={() => fetchTicketHistory()}
                  disabled={loadingHistory}
                  className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                  <span>Yenile</span>
                </button>
              </div>

              {loadingHistory ? (
                <div className="p-8 text-center text-slate-400 font-bold animate-pulse">
                  Talepleriniz yükleniyor...
                </div>
              ) : tickets.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
                  <p>Henüz iletilmiş bir destek talebiniz bulunmuyor.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {tickets.map((t) => {
                    const hasSupportReplies = (t.messages && t.messages.some((m: any) => m.sender_type === 'master_admin')) || t.resolution_notes;
                    return (
                      <div 
                        key={t.id} 
                        onClick={() => { sound.beep(); setSelectedTicket(t); }}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 hover:bg-emerald-50/50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700/80 hover:border-emerald-500/50 transition cursor-pointer space-y-1.5 shadow-2xs group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-800 dark:text-white text-xs">{t.ticket_number}</span>
                            {hasSupportReplies && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1 animate-pulse">
                                <Headphones className="w-3 h-3" />
                                <span>Destek Yanıtı Var</span>
                              </span>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            t.status === 'resolved' || t.status === 'closed'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                              : t.status === 'in_review'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                          }`}>
                            {t.status === 'new' ? 'Yeni' : t.status === 'in_review' ? 'İnceleniyor' : t.status === 'resolved' ? 'Çözüldü' : 'Kapatıldı'}
                          </span>
                        </div>
                        <div className="font-extrabold text-slate-900 dark:text-white text-xs group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                          {t.subject}
                        </div>
                        <div className="text-[11px] text-slate-500 line-clamp-1">{t.description}</div>
                        
                        {t.resolution_notes && (
                          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <div className="truncate">
                              <strong>Çözüm Notu:</strong> {t.resolution_notes}
                            </div>
                          </div>
                        )}

                        <div className="text-[10px] text-slate-400 pt-1 flex items-center justify-between border-t border-slate-100 dark:border-slate-700/50">
                          <span>{new Date(t.created_at).toLocaleString('tr-TR')}</span>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 font-bold text-slate-500 dark:text-slate-400">
                              <MessageSquare className="w-3 h-3" />
                              <span>{t.messages ? t.messages.length : 0} mesaj</span>
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Image Preview Zoom Modal */}
      {previewZoomImage && (
        <div 
          onClick={() => setPreviewZoomImage(null)}
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img 
              src={previewZoomImage} 
              alt="Büyütülmüş Görsel" 
              className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl object-contain"
            />
            <button 
              onClick={() => setPreviewZoomImage(null)}
              className="absolute -top-3 -right-3 p-2 bg-slate-900 text-white rounded-full border border-slate-700 shadow hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
