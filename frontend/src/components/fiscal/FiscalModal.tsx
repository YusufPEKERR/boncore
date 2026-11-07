import React, { useState, useEffect } from 'react';
import { 
  X, Printer, Download, QrCode, FileText, 
  CheckCircle2, ShieldCheck, Copy 
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';
import { localHardware } from '../../services/localHardware';

interface FiscalModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number | null;
}

const isVirtualPrinterTarget = (name: string): boolean => {
  const low = (name || '').toLowerCase();
  return ['pdf', 'onenote', 'xps', 'fax', 'anydesk'].some(v => low.includes(v));
};

const formatReceiptDate = (rawDate?: string): string => {
  if (!rawDate) return new Date().toLocaleDateString('tr-TR');
  const trimmed = String(rawDate).trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  }
  return trimmed;
};

const formatReceiptTime = (rawTime?: string): string => {
  if (!rawTime) return new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const trimmed = String(rawTime).trim();
  const hmMatch = /^(\d{2}:\d{2})/.exec(trimmed);
  if (hmMatch) {
    return hmMatch[1];
  }
  return trimmed;
};

const formatPaymentLabel = (raw?: string): string => {
  const val = String(raw || '').trim();
  const low = val.toLocaleLowerCase('tr-TR');
  if (low === 'cash' || low === 'nakit') return 'Nakit';
  if (low === 'credit_card' || low === 'kredi kartı' || low === 'kredi karti') return 'Kredi Kartı';
  if (low === 'open_account' || low === 'açık hesap' || low === 'acik hesap') return 'Açık Hesap';
  if (low === 'sodexo') return 'Sodexo';
  if (low === 'multinet') return 'Multinet';
  if (low === 'ticket') return 'Ticket';
  return val || 'Nakit';
};

const buildThermalRawText = (
  doc: any,
  headerTitle: string,
  formattedDate: string,
  formattedTime: string,
  vat10Tax: number,
  footerMsg: string,
  footerSub: string
): string => {
  const W = 40;
  const line = '-'.repeat(W);
  const padLR = (left: string, right: string) => {
    const space = Math.max(1, W - left.length - right.length);
    return left + ' '.repeat(space) + right;
  };
  const centerText = (txt: string) => {
    if (txt.length >= W) return txt;
    const leftPad = Math.floor((W - txt.length) / 2);
    return ' '.repeat(leftPad) + txt;
  };

  const lines: string[] = [];
  lines.push(centerText(headerTitle));
  lines.push(line);
  lines.push(padLR(`Masa: ${doc.table_name || 'Masa'}`, `Tarih: ${formattedDate}`));
  lines.push(padLR(`Garson: ${doc.waiter_name || '-'}`, `Saat: ${formattedTime}`));
  lines.push(`Kasiyer: ${doc.cashier_name || 'Kasiyer'}`);
  lines.push(line);
  lines.push('ÜRÜN               ADET    BİRİM   TUTAR');
  lines.push(line);

  (doc.items || []).forEach((it: any) => {
    const name = String(it.product_name || '').slice(0, 18).padEnd(18, ' ');
    const qtyNum = Number(it.quantity || 0);
    const qtyStr = (Number.isInteger(qtyNum) ? String(qtyNum) : qtyNum.toFixed(2)).padStart(5, ' ');
    const unitStr = Number(it.unit_price || 0).toFixed(2).padStart(8, ' ');
    const totalStr = Number(it.total_price || 0).toFixed(2).padStart(8, ' ');
    lines.push(`${name}${qtyStr} ${unitStr}${totalStr}`);
    const variant = it.variant || it.variant_name;
    if (variant) {
      lines.push(` (${variant})`);
    }
  });

  lines.push(line);
  lines.push(padLR('Ara Toplam:', `₺${Number(doc.subtotal || 0).toFixed(2)}`));
  if (Number(doc.kuver || 0) > 0) {
    lines.push(padLR('Kuver Bedeli:', `₺${Number(doc.kuver).toFixed(2)}`));
  }
  if (Number(doc.service_charge || 0) > 0) {
    lines.push(padLR('Servis Bedeli:', `₺${Number(doc.service_charge).toFixed(2)}`));
  }
  if (Number(doc.discount || 0) > 0) {
    lines.push(padLR('İndirim:', `-₺${Number(doc.discount).toFixed(2)}`));
  }
  if (Number(doc.treat || 0) > 0) {
    lines.push(padLR('İkram:', `-₺${Number(doc.treat).toFixed(2)}`));
  }
  lines.push(padLR('KDV (%10 Dahil):', `₺${vat10Tax.toFixed(2)}`));
  lines.push(line);
  lines.push(padLR('GENEL TOPLAM:', `₺${Number(doc.grand_total || 0).toFixed(2)}`));

  if (Array.isArray(doc.payments) && doc.payments.length > 0) {
    lines.push(line);
    doc.payments.forEach((p: any) => {
      const pLbl = formatPaymentLabel(p.label || p.method);
      lines.push(padLR(`✓ ÖDEME (${pLbl}):`, `₺${Number(p.amount || 0).toFixed(2)}`));
    });
  }

  lines.push(line);
  if (footerMsg) lines.push(centerText(footerMsg));
  if (footerSub) lines.push(centerText(footerSub));
  lines.push('\n\n\n');

  return lines.join('\n');
};

export const printThermalReceipt = async (doc: any, targetPrinters?: string[]) => {
  if (!doc || doc.error || doc.detail) {
    console.warn('printThermalReceipt çağrıldı ancak doküman geçersiz veya hata içeriyor:', doc);
    return;
  }
  // Dokümanda ürün listesi yoksa veya boşsa ve genel toplam 0 ise yazdırmayı engelle
  if ((!doc.items || doc.items.length === 0) && (!doc.grand_total || Number(doc.grand_total) === 0)) {
    console.warn('printThermalReceipt iptal edildi: Dokümanda ürün kalemi veya toplam tutar bulunamadı.', doc);
    return;
  }

  let design: any = doc.receipt_design;
  if (!design) {
    try {
      const cached = localStorage.getItem('boncore_receipt_design');
      if (cached) design = JSON.parse(cached);
    } catch (e) {}
  }

  const activeRestName = localStorage.getItem('boncore_active_restaurant_name') || '';
  const customHeader = design?.header_title && design.header_title !== 'BONCORE RESTORAN' && design.header_title !== 'BONCORE RESTORAN & LOUNGE'
    ? design.header_title
    : '';
  const docHeader = doc.company_title && doc.company_title !== 'BONCORE RESTORAN' && doc.company_title !== 'BONCORE RESTORAN & LOUNGE'
    ? doc.company_title
    : '';
  const headerTitle = (customHeader || activeRestName || docHeader || 'FATİH ÇİFTLİĞİ').toLocaleUpperCase('tr-TR');

  const formattedDate = formatReceiptDate(doc.date);
  const formattedTime = formatReceiptTime(doc.time);
  const grandTotalNum = Number(doc.grand_total || 0);
  const vat10Tax = Number(
    doc.vat_summary?.vat_10?.tax !== undefined
      ? doc.vat_summary.vat_10.tax
      : (grandTotalNum * 10) / 110
  );

  const footerMsg = design?.footer_message || 'TEŞEKKÜR EDERİZ • AFİYET OLSUN!';
  const footerSub = design?.footer_sub || 'Mali değeri yoktur, bilgi fişidir.';

  const rawText = buildThermalRawText(
    doc,
    headerTitle,
    formattedDate,
    formattedTime,
    vat10Tax,
    footerMsg,
    footerSub
  );

  // 1. Kasa bilgisayarinda secili FİZİKSEL termal yazicilar varsa dogrudan ajan uzerinden yazdir
  const selectedPrinters = (targetPrinters && targetPrinters.length > 0)
    ? targetPrinters
    : localHardware.getSelectedPrinters();

  const physicalPrinters = (selectedPrinters || []).filter(p => !isVirtualPrinterTarget(p));

  if (physicalPrinters.length > 0) {
    try {
      const res = await localHardware.printReceipt({
        printers: physicalPrinters,
        document: doc,
        rawText
      });
      if (res && res.success) {
        return;
      }
    } catch (e) {
      console.warn('Fiziksel termal yazdirma hatasi, tarayici onizlemesine geciliyor:', e);
    }
  }

  // 2. Ajan veya fiziksel yazici yoksa tarayici uzerinden görsel şablonla yazdir
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

    const paperWidth = design?.paper_width === '58mm' ? '58mm' : '80mm';
    const bodyWidth = design?.paper_width === '58mm' ? '52mm' : '74mm';

    const itemsRows = (doc.items || [])
      .map((it: any) => {
        const qtyNum = Number(it.quantity || 0);
        const qtyDisplay = Number.isInteger(qtyNum) ? String(qtyNum) : `${Number(qtyNum.toFixed(3))} Kg`;
        const variant = it.variant || it.variant_name;
        return `
        <div class="item-block">
          <div class="item-row">
            <span class="col-name">${it.product_name}</span>
            <span class="col-qty">${qtyDisplay}</span>
            <span class="col-unit">${Number(it.unit_price || 0).toFixed(2)}</span>
            <span class="col-total">${Number(it.total_price || 0).toFixed(2)}</span>
          </div>
          ${variant ? `<div class="item-variant">(${variant})</div>` : ''}
        </div>`;
      })
      .join('');

    const paymentsRows = (doc.payments || [])
      .map((p: any) => {
        const pLbl = formatPaymentLabel(p.label || p.method);
        return `
        <div class="row pay-row">
          <span>✓ ÖDEME (${pLbl}):</span>
          <span>₺${Number(p.amount || 0).toFixed(2)}</span>
        </div>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Adisyo Fişi - ${doc.doc_no || ''}</title>
  <style>
    @page { size: ${paperWidth} auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      width: ${bodyWidth};
      margin: 0 auto;
      padding: 8px 6px;
      color: #0f172a;
      background: #ffffff;
      font-size: 12px;
      line-height: 1.45;
    }
    .center { text-align: center; }
    .receipt-header {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .divider {
      border-top: 2px solid #0f172a;
      margin: 8px 0;
    }
    .meta-section {
      font-size: 11px;
      font-weight: 600;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 2px 0;
    }
    .table-header {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 700;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin-bottom: 6px;
    }
    .col-name { width: 46%; text-align: left; }
    .col-qty { width: 14%; text-align: center; }
    .col-unit { width: 20%; text-align: right; }
    .col-total { width: 20%; text-align: right; }
    .item-block {
      margin: 5px 0;
    }
    .item-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 600;
    }
    .item-variant {
      font-size: 10.5px;
      color: #64748b;
      padding-left: 6px;
      margin-top: 1px;
    }
    .subtotals {
      font-size: 11px;
      font-weight: 600;
    }
    .vat-row {
      color: #64748b;
    }
    .receipt-total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 15px;
      font-weight: 900;
      padding: 2px 0;
    }
    .pay-row {
      font-size: 11px;
      font-weight: 700;
      margin: 3px 0;
    }
    .footer-msg {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .footer-sub {
      font-size: 10.5px;
      font-weight: 600;
      color: #64748b;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="center receipt-header">${headerTitle}</div>
  <div class="divider"></div>
  <div class="meta-section">
    <div class="row">
      <span>Masa: ${doc.table_name || 'Masa'}</span>
      <span>Tarih: ${formattedDate}</span>
    </div>
    <div class="row">
      <span>Garson: ${doc.waiter_name || '-'}</span>
      <span>Saat: ${formattedTime}</span>
    </div>
    <div class="row">
      <span>Kasiyer: ${doc.cashier_name || 'Kasiyer'}</span>
      <span></span>
    </div>
  </div>
  <div class="divider"></div>
  <div class="table-header">
    <span class="col-name">ÜRÜN</span>
    <span class="col-qty">ADET</span>
    <span class="col-unit">BİRİM</span>
    <span class="col-total">TUTAR</span>
  </div>
  <div>
    ${itemsRows}
  </div>
  <div class="divider"></div>
  <div class="subtotals">
    <div class="row"><span>Ara Toplam:</span><b>₺${Number(doc.subtotal || 0).toFixed(2)}</b></div>
    ${Number(doc.kuver || 0) > 0 ? `<div class="row"><span>Kuver Bedeli:</span><b>₺${Number(doc.kuver).toFixed(2)}</b></div>` : ''}
    ${Number(doc.service_charge || 0) > 0 ? `<div class="row"><span>Servis Bedeli:</span><b>₺${Number(doc.service_charge).toFixed(2)}</b></div>` : ''}
    ${Number(doc.discount || 0) > 0 ? `<div class="row"><span>İndirim:</span><b>-₺${Number(doc.discount).toFixed(2)}</b></div>` : ''}
    ${Number(doc.treat || 0) > 0 ? `<div class="row"><span>İkram:</span><b>-₺${Number(doc.treat).toFixed(2)}</b></div>` : ''}
    <div class="row vat-row"><span>KDV (%10 Dahil):</span><span>₺${vat10Tax.toFixed(2)}</span></div>
  </div>
  <div class="divider"></div>
  <div class="receipt-total">
    <span>GENEL TOPLAM:</span>
    <span>₺${grandTotalNum.toFixed(2)}</span>
  </div>
  ${paymentsRows ? `<div class="divider"></div><div>${paymentsRows}</div>` : ''}
  <div class="divider"></div>
  <div class="center footer-msg">${footerMsg}</div>
  ${footerSub ? `<div class="center footer-sub">${footerSub}</div>` : ''}
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

  const handleDownloadPdf = () => {
    sound.beep();
    window.open(`/api/fiscal/e-adisyon/${orderId}/pdf`, '_blank');
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
                    <span className="col-span-2 text-center font-mono">{Number.isInteger(Number(it.quantity)) ? it.quantity : `${Number(Number(it.quantity || 0).toFixed(3))} Kg`}</span>
                    <span className="col-span-2 text-right font-mono">₺{Number(it.unit_price || 0).toFixed(2)}</span>
                    <span className="col-span-2 text-right font-mono font-bold">₺{Number(it.total_price || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Totals & VAT Breakdown */}
              <div className="pt-2 border-t-2 border-slate-900 space-y-1 text-right text-[11px]">
                <div>Ara Toplam: <span className="font-mono font-bold">₺{Number(fiscalDoc.subtotal || 0).toFixed(2)}</span></div>
                {Number(fiscalDoc.kuver || 0) > 0 && <div>Kuver Bedeli: <span className="font-mono font-bold">₺{Number(fiscalDoc.kuver || 0).toFixed(2)}</span></div>}
                {Number(fiscalDoc.service_charge || 0) > 0 && <div>Servis Bedeli: <span className="font-mono font-bold">₺{Number(fiscalDoc.service_charge || 0).toFixed(2)}</span></div>}
                {Number(fiscalDoc.discount || 0) > 0 && <div className="text-brand-600">İndirim: <span className="font-mono font-bold">-₺{Number(fiscalDoc.discount || 0).toFixed(2)}</span></div>}
                <div>Hesaplanan KDV (%10): <span className="font-mono">₺{Number(fiscalDoc.vat_summary?.vat_10?.tax || fiscalDoc.vat_summary?.vat_10 || 0).toFixed(2)}</span></div>
                <div className="text-base font-black text-slate-950 pt-1 border-t">
                  GENEL TOPLAM: <span className="font-mono">₺{Number(fiscalDoc.grand_total || 0).toFixed(2)}</span>
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
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadXml}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-blue-400" />
              <span>GİB XML İndir</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>PDF İndir</span>
            </button>
          </div>

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
