import React, { useState, useEffect } from 'react';
import { 
  X, Printer, Download, QrCode, FileText, 
  CheckCircle2, ShieldCheck, Copy 
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface FiscalModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number | null;
}

export const FiscalModal: React.FC<FiscalModalProps> = ({ isOpen, onClose, orderId }) => {
  const [fiscalDoc, setFiscalDoc] = useState<any>(null);
  const [escposText, setEscposText] = useState<string>('');
  const [viewMode, setViewMode] = useState<'e_adisyon' | 'escpos'>('e_adisyon');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen && orderId) {
      loadFiscalData(orderId);
    }
  }, [isOpen, orderId]);

  const loadFiscalData = async (id: number) => {
    setLoading(true);
    try {
      const [doc, slip] = await Promise.all([
        api.getEAdisyon(id),
        api.getEscposReceipt(id)
      ]);
      setFiscalDoc(doc);
      setEscposText(slip.slip_text);
    } catch (e) {
      console.warn('Failed to load fiscal doc', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !fiscalDoc) return null;

  const handleDownloadXml = () => {
    sound.beep();
    window.open(`/api/fiscal/e-adisyon/${orderId}/xml`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">GİB Uyumlu E-Adisyon & Termal Fiş</h3>
              <p className="text-xs text-slate-400 font-mono">ETTN: {fiscalDoc.ettn}</p>
            </div>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => { sound.beep(); setViewMode('e_adisyon'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'e_adisyon' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Resmi E-Adisyon
            </button>
            <button
              onClick={() => { sound.beep(); setViewMode('escpos'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'escpos' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              80mm ESC/POS Fiş
            </button>
          </div>

          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body View */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex justify-center">
          {viewMode === 'e_adisyon' ? (
            /* Official GİB E-Adisyon Document Card */
            <div className="w-full max-w-lg bg-white text-slate-950 rounded-2xl p-6 shadow-2xl border border-slate-300 text-xs space-y-4">
              {/* Top Banner */}
              <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between">
                <div>
                  <div className="font-black text-sm uppercase tracking-wider">{fiscalDoc.company_title}</div>
                  <div className="text-[10px] text-slate-600">VKN: {fiscalDoc.vkn} • Kadıköy / İSTANBUL</div>
                  <div className="text-[10px] text-slate-600">GİB E-Adisyon Belge No: {fiscalDoc.doc_no}</div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-extrabold uppercase bg-slate-900 text-white px-2 py-1 rounded">
                    E-ADİSYON
                  </span>
                  <div className="text-[10px] text-slate-600 mt-1">{fiscalDoc.date} {fiscalDoc.time}</div>
                </div>
              </div>

              {/* Table & Waiter Info */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-2.5 rounded-xl text-[11px] font-semibold">
                <div>Masa: <span className="font-bold">{fiscalDoc.table_name}</span></div>
                <div>Garson: <span className="font-bold">{fiscalDoc.waiter_name}</span></div>
                <div>Kasiyer: <span className="font-bold">{fiscalDoc.cashier_name}</span></div>
                <div>Kişi Sayısı: <span className="font-bold">{fiscalDoc.kuver > 0 ? `${fiscalDoc.kuver / 35} Kişi` : '1'}</span></div>
              </div>

              {/* Line Items */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 font-bold uppercase text-[10px] text-slate-500 border-b pb-1">
                  <span className="col-span-6">Ürün / Açıklama</span>
                  <span className="col-span-2 text-center">Miktar</span>
                  <span className="col-span-2 text-right">Birim</span>
                  <span className="col-span-2 text-right">Tutar</span>
                </div>
                {fiscalDoc.items.map((it: any, i: number) => (
                  <div key={i} className="grid grid-cols-12 py-1 border-b border-slate-100 text-[11px]">
                    <span className="col-span-6 font-semibold">{it.product_name} {it.variant && `(${it.variant})`}</span>
                    <span className="col-span-2 text-center font-mono">{it.quantity}</span>
                    <span className="col-span-2 text-right font-mono">₺{it.unit_price.toFixed(2)}</span>
                    <span className="col-span-2 text-right font-mono font-bold">₺{it.total_price.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Totals & VAT Breakdown */}
              <div className="pt-2 border-t-2 border-slate-900 space-y-1 text-right text-[11px]">
                <div>Ara Toplam: <span className="font-mono font-bold">₺{fiscalDoc.subtotal.toFixed(2)}</span></div>
                {fiscalDoc.kuver > 0 && <div>Kuver Bedeli: <span className="font-mono font-bold">₺{fiscalDoc.kuver.toFixed(2)}</span></div>}
                {fiscalDoc.discount > 0 && <div className="text-red-600">İndirim: <span className="font-mono font-bold">-₺{fiscalDoc.discount.toFixed(2)}</span></div>}
                <div>Hesaplanan KDV (%10): <span className="font-mono">₺{fiscalDoc.vat_summary.vat_10.tax.toFixed(2)}</span></div>
                <div className="text-base font-black text-slate-950 pt-1 border-t">
                  GENEL TOPLAM: <span className="font-mono">₺{fiscalDoc.grand_total.toFixed(2)}</span>
                </div>
              </div>

              {/* GİB QR Code String & Signature */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
                <div className="space-y-0.5">
                  <div className="font-mono text-[9px] break-all max-w-[280px]">
                    {fiscalDoc.qr_code_content}
                  </div>
                  <div className="font-bold text-slate-700">Bu belge 509 Sıra No.lu VUK Genel Tebliği uyarınca düzenlenmiştir.</div>
                </div>
                <QrCode className="w-12 h-12 text-slate-900 flex-shrink-0" />
              </div>
            </div>
          ) : (
            /* 80mm ESC/POS Thermal Printer Slip Text */
            <div className="w-full max-w-sm bg-slate-900 rounded-2xl p-4 border border-slate-800 shadow-inner">
              <pre className="font-thermal text-xs text-slate-200 whitespace-pre leading-relaxed select-text">
                {escposText}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={handleDownloadXml}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span>GİB XML İndir</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold shadow-lg shadow-blue-500/25 flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>TERMAL FİŞİ YAZDIR</span>
          </button>
        </div>
      </div>
    </div>
  );
};
