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

const escapeHtml = (val: unknown): string =>
  String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const mapHeaderSizePx = (size?: string): string => {
  if (size === 'xlarge') return '17px';
  if (size === 'medium') return '13px';
  return '15px';
};

const mapBodySizePx = (size?: string): string => {
  if (size === 'large') return '12.5px';
  if (size === 'small') return '10px';
  return '11px';
};

const mapSubSizePx = (size?: string): string => {
  if (size === 'normal') return '10.5px';
  if (size === 'xs') return '8.5px';
  return '9.5px';
};

const mapFontWeightCss = (weight?: string, fallback: string = '400'): string => {
  if (weight === 'black') return '900';
  if (weight === 'extrabold') return '800';
  if (weight === 'bold') return '700';
  if (weight === 'semibold') return '600';
  if (weight === 'normal') return '400';
  return fallback;
};

const computeVatBreakdown = (doc: any, grandTotalNum: number) => {
  const summary = doc?.vat_summary;
  const hasExplicitSummary = Boolean(
    summary && (summary.vat_1 !== undefined || summary.vat_10 !== undefined || summary.vat_20 !== undefined)
  );
  const vat1 = Number(summary?.vat_1?.tax ?? 0);
  const vat10 = Number(
    summary?.vat_10?.tax !== undefined
      ? summary.vat_10.tax
      : hasExplicitSummary
        ? 0
        : (grandTotalNum * 10) / 110
  );
  const vat20 = Number(summary?.vat_20?.tax ?? 0);
  const totalTax = Number((vat1 + vat10 + vat20).toFixed(2));
  return { vat1, vat10, vat20, totalTax };
};

const buildThermalRawText = (
  doc: any,
  headerTitle: string,
  formattedDate: string,
  formattedTime: string,
  vatBreakdown: { vat1: number; vat10: number; vat20: number; totalTax: number },
  footerMsg: string,
  footerSub: string,
  customWidth?: number,
  design?: any
): string => {
  let W = customWidth || 42;
  if (W < 28 || W > 56) W = 42;
  const dividerChar = design?.divider_style === 'dotted' ? '.' : '-';
  const line = dividerChar.repeat(W);
  const padLR = (left: string, right: string) => {
    const space = Math.max(1, W - left.length - right.length);
    return left + ' '.repeat(space) + right;
  };
  const centerText = (txt: string) => {
    if (txt.length >= W) return txt.slice(0, W);
    const leftPad = Math.floor((W - txt.length) / 2);
    return ' '.repeat(leftPad) + txt;
  };

  const lines: string[] = [];
  lines.push('='.repeat(W));
  if (design?.show_logo) {
    lines.push(centerText('[ BONCORE ]'));
  }
  lines.push(centerText(headerTitle));
  if (design?.header_sub) {
    lines.push(centerText(String(design.header_sub)));
  }
  if (design?.show_vkn && doc.vkn) {
    lines.push(centerText(`VKN: ${doc.vkn}`));
  }
  if (design?.show_address_phone !== false) {
    if (doc.address) lines.push(centerText(String(doc.address)));
    if (doc.phone) lines.push(centerText(`Tel: ${doc.phone}`));
  }
  if (design?.show_e_adisyon_title) {
    lines.push(centerText(String(design.e_adisyon_title_text || 'E-ADİSYON FİŞİ')));
  }
  lines.push('='.repeat(W));
  if (design?.show_order_no !== false && doc.doc_no) {
    lines.push(`Fiş No: ${doc.doc_no}`);
  }
  const showTable = design?.show_table_name !== false;
  const showDate = design?.show_date_time !== false;
  if (showTable || showDate) {
    lines.push(
      padLR(
        showTable ? `Masa: ${doc.table_name || 'Masa'}` : '',
        showDate ? `Tarih: ${formattedDate}` : ''
      )
    );
  }
  const showWaiter = design?.show_waiter_name !== false;
  if (showWaiter || showDate) {
    lines.push(
      padLR(
        showWaiter ? `Garson: ${doc.waiter_name || '-'}` : '',
        showDate ? `Saat: ${formattedTime}` : ''
      )
    );
  }
  lines.push(`Kasiyer: ${doc.cashier_name || 'Kasiyer'}`);
  lines.push(line);

  if (W <= 34) {
    // 58mm Termal Kağıt (32 Karakter)
    lines.push(padLR('ÜRÜN', 'ADET    TUTAR'));
    lines.push(line);
    (doc.items || []).forEach((it: any) => {
      const qtyNum = Number(it.quantity || 0);
      const qtyStr = (Number.isInteger(qtyNum) ? String(qtyNum) : qtyNum.toFixed(2));
      const totalStr = `₺${Number(it.total_price || 0).toFixed(2)}`;
      const rightCol = `${qtyStr} AD ${totalStr}`;
      const name = String(it.product_name || '');
      if (name.length + rightCol.length + 2 <= W) {
        lines.push(padLR(name, rightCol));
      } else {
        lines.push(name);
        lines.push(' '.repeat(Math.max(0, W - rightCol.length)) + rightCol);
      }
      const variant = it.variant || it.variant_name;
      if (variant) {
        lines.push(` (${variant})`);
      }
    });
  } else {
    // 80mm Termal Kağıt (42 / 48 Karakter)
    lines.push(padLR('ÜRÜN', 'ADET   BİRİM    TUTAR'));
    lines.push(line);
    (doc.items || []).forEach((it: any) => {
      const name = String(it.product_name || '').slice(0, 20).padEnd(20, ' ');
      const qtyNum = Number(it.quantity || 0);
      const qtyStr = (Number.isInteger(qtyNum) ? String(qtyNum) : qtyNum.toFixed(2)).padStart(5, ' ');
      const unitStr = Number(it.unit_price || 0).toFixed(2).padStart(8, ' ');
      const totalStr = Number(it.total_price || 0).toFixed(2).padStart(9, ' ');
      lines.push(`${name}${qtyStr} ${unitStr}${totalStr}`);
      const variant = it.variant || it.variant_name;
      if (variant) {
        lines.push(` (${variant})`);
      }
    });
  }

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
  if (design?.show_vat_breakdown !== false) {
    if (vatBreakdown.vat1 > 0) lines.push(padLR('KDV (%1 Dahil):', `₺${vatBreakdown.vat1.toFixed(2)}`));
    if (vatBreakdown.vat10 > 0) lines.push(padLR('KDV (%10 Dahil):', `₺${vatBreakdown.vat10.toFixed(2)}`));
    if (vatBreakdown.vat20 > 0) lines.push(padLR('KDV (%20 Dahil):', `₺${vatBreakdown.vat20.toFixed(2)}`));
    lines.push(padLR('Toplam KDV:', `₺${vatBreakdown.totalTax.toFixed(2)}`));
  }
  lines.push(line);
  lines.push(padLR('GENEL TOPLAM:', `₺${Number(doc.grand_total || 0).toFixed(2)}`));

  if (design?.show_payment_details !== false && Array.isArray(doc.payments) && doc.payments.length > 0) {
    lines.push(line);
    doc.payments.forEach((p: any) => {
      const pLbl = formatPaymentLabel(p.label || p.method);
      lines.push(padLR(`✓ ÖDEME (${pLbl}):`, `₺${Number(p.amount || 0).toFixed(2)}`));
    });
  }

  if (design?.show_qr_code && doc.qr_code_content) {
    lines.push(line);
    lines.push(centerText('E-ADİSYON GİB QR KODU'));
    lines.push(String(doc.qr_code_content));
  }

  lines.push(line);
  if (design?.custom_note) lines.push(centerText(String(design.custom_note)));
  if (design?.wifi_name) {
    lines.push(centerText(`WiFi: ${design.wifi_name}${design.wifi_password ? ` • Şifre: ${design.wifi_password}` : ''}`));
  }
  if (design?.instagram) lines.push(centerText(`Instagram: ${design.instagram}`));
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
  const headerTitle = (customHeader || activeRestName || docHeader || 'BONCORE POS').toLocaleUpperCase('tr-TR');

  const formattedDate = formatReceiptDate(doc.date);
  const formattedTime = formatReceiptTime(doc.time);
  const grandTotalNum = Number(doc.grand_total || 0);
  const vatBreakdown = computeVatBreakdown(doc, grandTotalNum);

  const footerMsg = design?.footer_message || 'TEŞEKKÜR EDERİZ • AFİYET OLSUN!';
  const footerSub = design?.footer_sub || 'Mali değeri yoktur, bilgi fişidir.';

  // 1. Kasa bilgisayarında kayıtlı FİZİKSEL termal yazıcılar varsa her yazıcının kendi genişliğine göre formatlayıp yazdır
  const selectedPrinters = (targetPrinters && targetPrinters.length > 0)
    ? targetPrinters
    : localHardware.getSelectedPrinters();

  const physicalPrinters = (selectedPrinters || []).filter(p => !isVirtualPrinterTarget(p));

  if (physicalPrinters.length > 0) {
    let anySuccess = false;
    for (const prKey of physicalPrinters) {
      const printerLineWidth = localHardware.getPrinterLineWidth(prKey);
      const rawTextForPrinter = buildThermalRawText(
        doc,
        headerTitle,
        formattedDate,
        formattedTime,
        vatBreakdown,
        footerMsg,
        footerSub,
        printerLineWidth,
        design
      );
      const copies = localHardware.getPostPaymentCopies(prKey);
      try {
        for (let copyIdx = 0; copyIdx < copies; copyIdx++) {
          const res = await localHardware.printReceipt({
            printers: [prKey],
            document: doc,
            rawText: rawTextForPrinter
          });
          if (res && res.success) {
            anySuccess = true;
          }
        }
      } catch (e) {
        console.warn(`Fiziksel termal yazdırma hatası (${prKey}):`, e);
      }
    }
    if (anySuccess) {
      return;
    }
  }

  // 2. Ajan veya fiziksel yazıcı yoksa tarayıcı üzerinden görsel şablonla yazdır
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

    const defaultPrKey = physicalPrinters[0] || (selectedPrinters && selectedPrinters[0]);
    const configuredPaperWidth = localHardware.getPrinterPaperWidth(defaultPrKey);
    const paperWidth = design?.paper_width || configuredPaperWidth || '80mm';
    const bodyWidth = paperWidth === '58mm' ? '50mm' : '74mm';
    const headerFontPx = mapHeaderSizePx(design?.header_size);
    const headerWeightCss = mapFontWeightCss(design?.header_weight, '800');
    const bodyFontPx = mapBodySizePx(design?.body_size);
    const bodyWeightCss = mapFontWeightCss(design?.body_weight, '600');
    const subFontPx = mapSubSizePx(design?.sub_size);
    const subWeightCss = mapFontWeightCss(design?.sub_weight, '600');
    const totalWeightCss = mapFontWeightCss(design?.total_weight, '900');
    const dividerStyleCss = design?.divider_style === 'dashed' || design?.divider_style === 'dotted' ? design.divider_style : 'solid';
    const dividerThicknessPx = Math.max(1, Math.min(4, Number(design?.divider_thickness ?? 2)));

    const itemsRows = (doc.items || [])
      .map((it: any) => {
        const qtyNum = Number(it.quantity || 0);
        const qtyDisplay = Number.isInteger(qtyNum) ? String(qtyNum) : `${Number(qtyNum.toFixed(3))} Kg`;
        const variant = it.variant || it.variant_name;
        return `
        <div class="item-block">
          <div class="item-row">
            <span class="col-name">${escapeHtml(it.product_name)}</span>
            <span class="col-qty">${escapeHtml(qtyDisplay)}</span>
            <span class="col-unit">${Number(it.unit_price || 0).toFixed(2)}</span>
            <span class="col-total">${Number(it.total_price || 0).toFixed(2)}</span>
          </div>
          ${variant ? `<div class="item-variant">(${escapeHtml(variant)})</div>` : ''}
        </div>`;
      })
      .join('');

    const paymentsRows = design?.show_payment_details === false
      ? ''
      : (doc.payments || [])
          .map((p: any) => {
            const pLbl = formatPaymentLabel(p.label || p.method);
            return `
        <div class="row pay-row">
          <span>✓ ÖDEME (${escapeHtml(pLbl)}):</span>
          <span>₺${Number(p.amount || 0).toFixed(2)}</span>
        </div>`;
          })
          .join('');

    const showAddressPhone = design?.show_address_phone !== false;
    const vatRowsHtml = design?.show_vat_breakdown === false
      ? ''
      : `
        ${vatBreakdown.vat1 > 0 ? `<div class="row vat-row"><span>KDV (%1 Dahil):</span><span>₺${vatBreakdown.vat1.toFixed(2)}</span></div>` : ''}
        ${vatBreakdown.vat10 > 0 ? `<div class="row vat-row"><span>KDV (%10 Dahil):</span><span>₺${vatBreakdown.vat10.toFixed(2)}</span></div>` : ''}
        ${vatBreakdown.vat20 > 0 ? `<div class="row vat-row"><span>KDV (%20 Dahil):</span><span>₺${vatBreakdown.vat20.toFixed(2)}</span></div>` : ''}
        <div class="row vat-row"><span>Toplam KDV:</span><span>₺${vatBreakdown.totalTax.toFixed(2)}</span></div>`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>BonCore Adisyon Fişi - ${escapeHtml(doc.doc_no || '')}</title>
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
      font-size: ${bodyFontPx};
      font-weight: ${bodyWeightCss};
      line-height: 1.45;
    }
    .center { text-align: center; }
    .receipt-logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: 2px solid #0f172a;
      border-radius: 6px;
      font-weight: 900;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .receipt-header {
      font-size: ${headerFontPx};
      font-weight: ${headerWeightCss};
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .header-sub {
      font-size: ${subFontPx};
      font-weight: ${subWeightCss};
      color: #475569;
      margin-bottom: 3px;
    }
    .e-adisyon-badge {
      display: inline-block;
      border: 1px solid #0f172a;
      padding: 1px 6px;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.05em;
      margin-top: 3px;
    }
    .divider {
      border-top: ${dividerThicknessPx}px ${dividerStyleCss} #0f172a;
      margin: 8px 0;
    }
    .meta-section {
      font-size: ${subFontPx};
      font-weight: ${subWeightCss};
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
      font-size: ${subFontPx};
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
      font-size: ${bodyFontPx};
      font-weight: ${bodyWeightCss};
    }
    .item-variant {
      font-size: ${subFontPx};
      color: #64748b;
      padding-left: 6px;
      margin-top: 1px;
    }
    .subtotals {
      font-size: ${subFontPx};
      font-weight: ${subWeightCss};
    }
    .vat-row {
      color: #475569;
    }
    .receipt-total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 15px;
      font-weight: ${totalWeightCss};
      padding: 2px 0;
    }
    .pay-row {
      font-size: ${subFontPx};
      font-weight: 700;
      margin: 3px 0;
    }
    .qr-box {
      margin-top: 6px;
      padding: 4px;
      border: 1px dashed #94a3b8;
      font-size: 8px;
      word-break: break-all;
      color: #334155;
    }
    .extra-note {
      font-size: ${subFontPx};
      font-weight: ${subWeightCss};
      color: #334155;
      margin-top: 3px;
    }
    .footer-msg {
      font-size: ${subFontPx};
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .footer-sub {
      font-size: ${subFontPx};
      font-weight: ${subWeightCss};
      color: #64748b;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="center">
    ${design?.show_logo ? '<div class="receipt-logo">B</div>' : ''}
    <div class="receipt-header">${escapeHtml(headerTitle)}</div>
    ${design?.header_sub ? `<div class="header-sub">${escapeHtml(design.header_sub)}</div>` : ''}
    ${design?.show_vkn && doc.vkn ? `<div class="header-sub">VKN: ${escapeHtml(doc.vkn)}</div>` : ''}
    ${showAddressPhone && doc.address ? `<div class="header-sub">${escapeHtml(doc.address)}</div>` : ''}
    ${showAddressPhone && doc.phone ? `<div class="header-sub">Tel: ${escapeHtml(doc.phone)}</div>` : ''}
    ${design?.show_e_adisyon_title ? `<div class="e-adisyon-badge">${escapeHtml(design.e_adisyon_title_text || 'E-ADİSYON FİŞİ')}</div>` : ''}
  </div>
  <div class="divider"></div>
  <div class="meta-section">
    ${design?.show_order_no !== false && doc.doc_no ? `<div class="row"><span>Fiş No: ${escapeHtml(doc.doc_no)}</span><span></span></div>` : ''}
    ${(design?.show_table_name !== false || design?.show_date_time !== false) ? `
    <div class="row">
      <span>${design?.show_table_name !== false ? `Masa: ${escapeHtml(doc.table_name || 'Masa')}` : ''}</span>
      <span>${design?.show_date_time !== false ? `Tarih: ${escapeHtml(formattedDate)}` : ''}</span>
    </div>` : ''}
    ${(design?.show_waiter_name !== false || design?.show_date_time !== false) ? `
    <div class="row">
      <span>${design?.show_waiter_name !== false ? `Garson: ${escapeHtml(doc.waiter_name || '-')}` : ''}</span>
      <span>${design?.show_date_time !== false ? `Saat: ${escapeHtml(formattedTime)}` : ''}</span>
    </div>` : ''}
    <div class="row">
      <span>Kasiyer: ${escapeHtml(doc.cashier_name || 'Kasiyer')}</span>
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
    ${vatRowsHtml}
  </div>
  <div class="divider"></div>
  <div class="receipt-total">
    <span>GENEL TOPLAM:</span>
    <span>₺${grandTotalNum.toFixed(2)}</span>
  </div>
  ${paymentsRows ? `<div class="divider"></div><div>${paymentsRows}</div>` : ''}
  ${design?.show_qr_code && doc.qr_code_content ? `<div class="center qr-box"><strong>GİB E-ADİSYON QR</strong><br/>${escapeHtml(doc.qr_code_content)}</div>` : ''}
  <div class="divider"></div>
  ${design?.custom_note ? `<div class="center extra-note">${escapeHtml(design.custom_note)}</div>` : ''}
  ${design?.wifi_name ? `<div class="center extra-note">WiFi: ${escapeHtml(design.wifi_name)}${design.wifi_password ? ` • Şifre: ${escapeHtml(design.wifi_password)}` : ''}</div>` : ''}
  ${design?.instagram ? `<div class="center extra-note">Instagram: ${escapeHtml(design.instagram)}</div>` : ''}
  <div class="center footer-msg">${escapeHtml(footerMsg)}</div>
  ${footerSub ? `<div class="center footer-sub">${escapeHtml(footerSub)}</div>` : ''}
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
  const [fiscalError, setFiscalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && orderId) {
      loadFiscalData(orderId);
    }
  }, [isOpen, orderId]);

  const loadFiscalData = async (id: number) => {
    setLoading(true);
    setFiscalError(null);
    try {
      const [doc, slip] = await Promise.all([
        api.getEAdisyon(id),
        api.getEscposReceipt(id, true)
      ]);
      setFiscalDoc(doc);
      setEscposText(slip.slip_text);
    } catch (e: any) {
      console.warn('Failed to load fiscal doc', e);
      setFiscalError(e?.message || 'Belge verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleDownloadXml = async () => {
    sound.beep();
    setFiscalError(null);
    try {
      await api.downloadAuthenticatedFile(`/api/fiscal/e-adisyon/${orderId}/xml`, `e-adisyon-${orderId}.xml`);
    } catch (e: any) {
      console.warn('XML download failed', e);
      setFiscalError(e?.message || 'GİB XML dosyası indirilemedi.');
    }
  };

  const handleDownloadPdf = async () => {
    sound.beep();
    setFiscalError(null);
    try {
      await api.downloadAuthenticatedFile(`/api/fiscal/e-adisyon/${orderId}/pdf`, `e-adisyon-${orderId}.pdf`, true);
    } catch (e: any) {
      console.warn('PDF download failed', e);
      setFiscalError(e?.message || 'PDF dosyası indirilemedi.');
    }
  };

  if (!fiscalDoc) {
    return (
      <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 text-center space-y-4">
          <div className="text-sm font-bold text-white">
            {loading ? 'E-Adisyon belgesi hazırlanıyor...' : (fiscalError || 'Belge yüklenemedi.')}
          </div>
          {!loading && fiscalError && (
            <button
              type="button"
              onClick={() => orderId && loadFiscalData(orderId)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
            >
              Tekrar Dene
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    );
  }

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
              <h3 className="text-lg font-extrabold text-white">E-Adisyon Ön İzleme & Termal Bilgi Fişi</h3>
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
              Resmi / E-Adisyon Önizleme
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

        {/* Error Notice */}
        {fiscalError && (
          <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center justify-between gap-2">
            <span>{fiscalError}</span>
            <button type="button" onClick={() => setFiscalError(null)} className="text-rose-300 hover:text-white cursor-pointer">
              Kapat
            </button>
          </div>
        )}

        {/* Body View */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex justify-center">
          {viewMode === 'e_adisyon' ? (
            /* Official GİB E-Adisyon Document Card */
            <div className="w-full max-w-lg bg-white text-slate-950 rounded-2xl p-6 shadow-2xl border border-slate-300 text-xs space-y-4">
              {/* Top Banner */}
              <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between">
                <div>
                  <div className="font-black text-sm uppercase tracking-wider">{fiscalDoc.company_title}</div>
                  <div className="text-[10px] text-slate-600">
                    {[
                      fiscalDoc.vkn ? `VKN: ${fiscalDoc.vkn}` : '',
                      fiscalDoc.address || '',
                      fiscalDoc.phone ? `Tel: ${fiscalDoc.phone}` : ''
                    ].filter(Boolean).join(' • ') || 'VKN: -'}
                  </div>
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
                {Number(fiscalDoc.vat_summary?.vat_1?.tax || 0) > 0 && (
                  <div>KDV (%1): <span className="font-mono">₺{Number(fiscalDoc.vat_summary.vat_1.tax).toFixed(2)}</span></div>
                )}
                {Number(fiscalDoc.vat_summary?.vat_10?.tax || fiscalDoc.vat_summary?.vat_10 || 0) > 0 && (
                  <div>KDV (%10): <span className="font-mono">₺{Number(fiscalDoc.vat_summary?.vat_10?.tax || fiscalDoc.vat_summary?.vat_10 || 0).toFixed(2)}</span></div>
                )}
                {Number(fiscalDoc.vat_summary?.vat_20?.tax || 0) > 0 && (
                  <div>KDV (%20): <span className="font-mono">₺{Number(fiscalDoc.vat_summary.vat_20.tax).toFixed(2)}</span></div>
                )}
                <div>Toplam KDV: <span className="font-mono">₺{computeVatBreakdown(fiscalDoc, Number(fiscalDoc.grand_total || 0)).totalTax.toFixed(2)}</span></div>
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
                  <div className="font-bold text-slate-700">
                    {fiscalDoc?.gib_uuid || fiscalDoc?.official_status === 'approved'
                      ? 'Bu belge 509 Sıra No.lu VUK Genel Tebliği uyarınca düzenlenmiştir.'
                      : 'BİLGİ AMAÇLI BELGE — MALİ DEĞERİ YOKTUR (Ön İzleme / Bilgi Fişi)'}
                  </div>
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
