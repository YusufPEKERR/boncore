import React, { useState } from 'react';
import { 
  Phone, MessageSquare, CheckCircle2, Clock, X, 
  ArrowRight, Sparkles, Building2, User, MapPin, 
  Search, Filter, AlertCircle, RefreshCw 
} from 'lucide-react';
import { sound } from '../../services/sound';

interface MasterLeadsViewProps {
  leads: any[];
  onRefresh: () => void;
}

export const MasterLeadsView: React.FC<MasterLeadsViewProps> = ({ leads, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [convertingId, setConvertingId] = useState<number | null>(null);

  const filteredLeads = leads.filter(l => {
    const matchesSearch = 
      l.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phone.includes(searchTerm) ||
      (l.city && l.city.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleUpdateStatus = async (leadId: number, newStatus: string) => {
    sound.beep();
    try {
      const res = await fetch(`/api/master/leads/${leadId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (e) {
      alert('Durum güncellenemedi.');
    }
  };

  const handleConvertToTenant = async (leadId: number, companyName: string) => {
    sound.cashDrawer();
    if (window.confirm(`"${companyName}" işletmesi için 14 günlük ücretsiz hesap oluşturulup restorana dönüştürülsün mü?`)) {
      setConvertingId(leadId);
      try {
        const res = await fetch(`/api/master/leads/${leadId}/convert`, { method: 'POST' });
        if (!res.ok) throw new Error('Dönüştürme başarısız.');
        const data = await res.json();
        alert(`🎉 Harika! Müşteri adayı başarıyla restorana dönüştürüldü!\n\nRestoran Kodu: ${data.tenant_name}\nYönetici Kullanıcı Adı: ${data.admin_username}\nŞifre: ${data.admin_password}\nPIN: ${data.pin_code}`);
        onRefresh();
      } catch (err: any) {
        alert(err.message || 'Hata oluştu.');
      } finally {
        setConvertingId(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Status Counters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-emerald-400" />
            <span>Gelen Müşteri Talepleri & Demo İstekleri ({leads.length})</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Web sitenizden 14 gün ücretsiz deneme veya demo talep eden potansiyel restoran müşterileri.
          </p>
        </div>

        <button
          onClick={() => { sound.beep(); onRefresh(); }}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Yenile</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center gap-3 p-3 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="İsim, işletme adı, telefon veya şehir ile ara..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-slate-300 text-xs font-bold focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="yeni">🔥 Yeni (Arama Bekleyen)</option>
            <option value="arandi">📞 Arandı</option>
            <option value="demo_yapildi">💻 Demo Yapıldı</option>
            <option value="musteri_oldu">✅ Müşteri Oldu</option>
            <option value="iptal">❌ İptal / Ulaşılamadı</option>
          </select>
        </div>
      </div>

      {/* Leads Table */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Tarih</th>
                <th className="py-3.5 px-4">İşletme Adı & Türü</th>
                <th className="py-3.5 px-4">Müşteri / Yetkili</th>
                <th className="py-3.5 px-4">Telefon</th>
                <th className="py-3.5 px-4">Durum</th>
                <th className="py-3.5 px-4">Hemen İletişime Geç</th>
                <th className="py-3.5 px-4 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500">
                    Kayıtlı talep bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const rawPhone = lead.phone.replace(/[^0-9]/g, '');
                  const waNumber = rawPhone.startsWith('90') ? rawPhone : `90${rawPhone.replace(/^0/, '')}`;
                  return (
                    <tr key={lead.id} className="hover:bg-slate-850/60 transition">
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        {lead.created_at ? new Date(lead.created_at).toLocaleDateString('tr-TR') : 'Bugün'}
                        <div className="text-[10px] text-slate-500">
                          {lead.created_at ? new Date(lead.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-black text-white text-sm">{lead.company_name}</div>
                        <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mt-0.5">
                          <span className="uppercase text-emerald-400 font-bold">{lead.business_type}</span>
                          <span>•</span>
                          <span>{lead.city || 'İstanbul'}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-200">{lead.full_name}</div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                        {lead.phone}
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          value={lead.status}
                          onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border focus:outline-none cursor-pointer ${
                            lead.status === 'yeni'
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : lead.status === 'arandi'
                              ? 'bg-blue-950 text-blue-300 border-blue-800'
                              : lead.status === 'demo_yapildi'
                              ? 'bg-purple-950 text-purple-300 border-purple-800'
                              : lead.status === 'musteri_oldu'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          <option value="yeni">🔥 Yeni (Bekliyor)</option>
                          <option value="arandi">📞 Arandı</option>
                          <option value="demo_yapildi">💻 Demo Yapıldı</option>
                          <option value="musteri_oldu">✅ Müşteri Oldu</option>
                          <option value="iptal">❌ İptal</option>
                        </select>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <a
                            href={`tel:${lead.phone}`}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
                            title="Müşteriyi Telefonla Ara"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Ara</span>
                          </a>

                          <a
                            href={`https://wa.me/${waNumber}?text=Merhaba%20${encodeURIComponent(lead.full_name)},%20BonCore%20Restoran%20POS%20i%C3%A7in%20olu%C5%9Fturdu%C4%9Funuz%20demo%20talebini%20ald%C4%B1k.%20Size%20nas%C4%B1l%20yard%C4%B1mc%C4%B1%20olabiliriz%3F`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-emerald-400 font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition"
                            title="WhatsApp Üzerinden Mesaj Yaz"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {lead.status !== 'musteri_oldu' ? (
                          <button
                            onClick={() => handleConvertToTenant(lead.id, lead.company_name)}
                            disabled={convertingId === lead.id}
                            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 hover:from-brand-500 hover:to-emerald-500 text-white font-black text-xs transition cursor-pointer shadow-md flex items-center gap-1.5 ml-auto"
                            title="Bu adayı sisteme restoran olarak kaydet ve 14 gün deneme başlat"
                          >
                            <span>{convertingId === lead.id ? 'Açılıyor...' : 'Restoran Hesabı Aç'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-[11px] font-bold text-emerald-400 flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Hesap Açıldı</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
