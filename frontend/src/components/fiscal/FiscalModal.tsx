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

export const printThermalReceipt = (doc: any) => {
  if (!doc) return;
  try {
    let iframe = document.getElementById('boncore-thermal-print-frame') as HTMLIFrameElement | null;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'boncore-thermal-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }

    const itemsRows = (doc.items || [])
      .map(
        (it: any) => `
        <tr>
          <td style="padding:3px 0;font-weight:600;">${it.product_name}${it.variant ? ` (${it.variant})` : ''}</td>
          <td style="padding:3px 0;text-align:center;">${Number.isInteger(Number(it.quantity)) ? it.quantity : Number(Number(it.quantity).toFixed(3)) + ' Kg'}</td>
          <td style="padding:3px 0;text-align:right;">₺${Number(it.unit_price || 0).toFixed(2)}</td>
          <td style="padding:3px 0;text-align:right;font-weight:700;">₺${Number(it.total_price || 0).toFixed(2)}</td>
        </tr>`
      )
      .join('');

    const paymentsRows = (doc.payments || [])
      .map(
        (p: any) => `
        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:12px;margin-top:2px;">
          <span>ÖDEME (${p.label || p.method}):</span>
          <span>₺${Number(p.amount || 0).toFixed(2)}</span>
        </div>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Adisyo Fişi - ${doc.doc_no || ''}</title>
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: 74mm;
      margin: 0 auto;
      padding: 4px;
      color: #000;
      font-size: 11px;
      line-height: 1.35;
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .double-divider { border-top: 2px solid #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { border-bottom: 1px solid #000; padding-bottom: 3px; text-align: left; font-size: 10px; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:14px;">${doc.company_title || 'BONCORE RESTORAN'}</div>
  <div class="center" style="font-size:10px;">VKN: ${doc.vkn || '1234567890'} • E-ADİSYON FİŞİ</div>
  <div class="center" style="font-size:10px;">Belge No: ${doc.doc_no || '-'}</div>
  <div class="double-divider"></div>
  <div class="row"><span><b>Masa:</b> ${doc.table_name || 'Hızlı Satış'}</span><span><b>Tarih:</b> ${doc.date || ''}</span></div>
  <div class="row"><span><b>Garson:</b> ${doc.waiter_name || '-'}</span><span><b>Saat:</b> ${doc.time || ''}</span></div>
  <div class="row"><span><b>Kasiyer:</b> ${doc.cashier_name || '-'}</span><span></span></div>
  <div class="divider"></div>
  <table>
    <thead>
      <tr>
        <th style="width:48%;">ÜRÜN</th>
        <th style="width:12%;text-align:center;">MİKTAR</th>
        <th style="width:20%;text-align:right;">BİRİM</th>
        <th style="width:20%;text-align:right;">TUTAR</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>
  <div class="divider"></div>
  <div class="row"><span>Ara Toplam:</span><b>₺${Number(doc.subtotal || 0).toFixed(2)}</b></div>
  ${doc.kuver > 0 ? `<div class="row"><span>Kuver Bedeli:</span><b>₺${Number(doc.kuver).toFixed(2)}</b></div>` : ''}
  ${doc.service_charge > 0 ? `<div class="row"><span>Servis Bedeli:</span><b>₺${Number(doc.service_charge).toFixed(2)}</b></div>` : ''}
  ${doc.discount > 0 ? `<div class="row"><span>İndirim:</span><b>-₺${Number(doc.discount).toFixed(2)}</b></div>` : ''}
  ${doc.treat > 0 ? `<div class="row"><span>İkram:</span><b>-₺${Number(doc.treat).toFixed(2)}</b></div>` : ''}
  <div class="row"><span>KDV (%10 Dahil):</span><span>₺${Number(doc.vat_summary?.vat_10?.tax || 0).toFixed(2)}</span></div>
  <div class="double-divider"></div>
  <div class="row" style="font-size:14px;font-weight:900;">
    <span>GENEL TOPLAM:</span>
    <span>₺${Number(doc.grand_total || 0).toFixed(2)}</span>
  </div>
  ${paymentsRows ? `<div class="divider"></div>${paymentsRows}` : ''}
  <div class="double-divider"></div>
  <div class="center" style="font-size:9px;word-break:break-all;">ETTN: ${doc.ettn || ''}</div>
  <div class="center bold" style="font-size:10px;margin-top:4px;">TEŞEKKÜR EDERİZ • AFİYET OLSUN!</div>
</body>
</html>`;

    const frameDoc = iframe.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();
      setTimeout(() => {
        iframe?.contentWindow?.focus();
        iframe?.contentWindow?.print();
      }, 200);
    }
  } catch (err) {
    console.warn('Termal fiş yazdırma hatası:', err);
    window.print();
  }
};

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
      // Otomatik Adisyo Fişi Yazdır
      setTimeout(() => {
        printThermalReceipt(doc);
      }, 250);
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
                <div>Belge No: <span className="font-bold">{fiscalDoc.doc_no}</span></div>
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
                    <span className="col-span-2 text-center font-mono">{Number.isInteger(Number(it.quantity)) ? it.quantity : `${Number(Number(it.quantity).toFixed(3))} Kg`}</span>
                    <span className="col-span-2 text-right font-mono">₺{it.unit_price.toFixed(2)}</span>
                    <span className="col-span-2 text-right font-mono font-bold">₺{it.total_price.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Totals & VAT Breakdown */}
              <div className="pt-2 border-t-2 border-slate-900 space-y-1 text-right text-[11px]">
                <div>Ara Toplam: <span className="font-mono font-bold">₺{fiscalDoc.subtotal.toFixed(2)}</span></div>
                {fiscalDoc.kuver > 0 && <div>Kuver Bedeli: <span className="font-mono font-bold">₺{fiscalDoc.kuver.toFixed(2)}</span></div>}
                {fiscalDoc.service_charge > 0 && <div>Servis Bedeli: <span className="font-mono font-bold">₺{fiscalDoc.service_charge.toFixed(2)}</span></div>}
                {fiscalDoc.discount > 0 && <div className="text-red-600">İndirim: <span className="font-mono font-bold">-₺{fiscalDoc.discount.toFixed(2)}</span></div>}
                <div>Hesaplanan KDV (%10): <span className="font-mono">₺{fiscalDoc.vat_summary.vat_10.tax.toFixed(2)}</span></div>
                <div className="text-base font-black text-slate-950 pt-1 border-t">
                  GENEL TOPLAM: <span className="font-mono">₺{fiscalDoc.grand_total.toFixed(2)}</span>
                </div>
                {fiscalDoc.payments && fiscalDoc.payments.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-200 space-y-0.5">
                    {fiscalDoc.payments.map((p: any, idx: number) => (
                      <div key={idx} className="text-emerald-700 font-extrabold flex justify-between">
                        <span>ÖDEME YÖNTEMİ ({p.label}):</span>
                        <span className="font-mono">₺{Number(p.amount || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
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
            onClick={() => printThermalReceipt(fiscalDoc)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold shadow-lg shadow-blue-500/25 flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>TERMAL FİŞİ YAZDIR</span>
          </button>
        </div>
      </div>
    </div>
  );
};
