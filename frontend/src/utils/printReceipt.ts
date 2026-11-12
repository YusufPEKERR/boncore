import { localHardware } from '../services/localHardware';

/**
 * Termal Fiş & Rapor Yazdırma Yardımcısı (80mm / 58mm)
 * Sayfadaki gereksiz tüm menü, buton ve navigasyonları engelleyip
 * YALNIZCA ilgili rapor veya adisyon fişini yazdırır.
 * Hedef yazıcının yapılandırılmış genişliğine göre (80mm / 58mm) otomatik boyutlanır.
 */
export const printThermalSlipById = (
  elementId: string,
  title: string = 'Rapor',
  targetPrinterOrWidth?: string | number | '80mm' | '58mm'
) => {
  const sourceEl = document.getElementById(elementId);
  if (!sourceEl) {
    console.error(`Yazdırılacak element bulunamadı: #${elementId}`);
    return;
  }

  // Genişliği hedef yazıcıdan veya varsayılan adisyon yazıcısından belirle
  let resolvedWidth: '80mm' | '58mm' = '80mm';
  if (typeof targetPrinterOrWidth === 'string' && (targetPrinterOrWidth === '80mm' || targetPrinterOrWidth === '58mm')) {
    resolvedWidth = targetPrinterOrWidth;
  } else if (typeof targetPrinterOrWidth === 'number') {
    resolvedWidth = targetPrinterOrWidth <= 34 ? '58mm' : '80mm';
  } else if (typeof targetPrinterOrWidth === 'string' && targetPrinterOrWidth) {
    resolvedWidth = localHardware.getPrinterPaperWidth(targetPrinterOrWidth);
  } else {
    resolvedWidth = localHardware.getPrinterPaperWidth();
  }

  const pageSize = resolvedWidth === '58mm' ? '58mm auto' : '80mm auto';
  const bodyWidth = resolvedWidth === '58mm' ? '48mm' : '72mm';
  const maxWidth = resolvedWidth === '58mm' ? '58mm' : '80mm';
  const fontSize = resolvedWidth === '58mm' ? '10px' : '11px';
  const padding = resolvedWidth === '58mm' ? '4px 6px' : '8px 10px';

  // Gizli bir iframe oluştur
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  // HTML içeriğini al ve renkleri siyah-beyaz termal formata çevir
  const content = sourceEl.innerHTML;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @page {
            size: ${pageSize};
            margin: 0mm;
          }
          * {
            box-sizing: border-box;
            background: transparent !important;
            color: #000000 !important;
            text-shadow: none !important;
            filter: none !important;
          }
          body {
            margin: 0;
            padding: ${padding};
            width: ${bodyWidth};
            max-width: ${maxWidth};
            font-family: 'Courier New', Courier, Consolas, Monaco, monospace;
            font-size: ${fontSize};
            line-height: 1.35;
            color: #000000;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print, button, svg {
            display: none !important;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-bold { font-weight: bold; }
          .font-black { font-weight: 900; }
          .flex {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .border-b, .border-t, .border-dashed {
            border-color: #000000 !important;
          }
          hr {
            border: none;
            border-top: 1px dashed #000000;
            margin: 6px 0;
          }
        </style>
      </head>
      <body>
        ${content}
      </body>
    </html>
  `);
  doc.close();

  // Yazdırmayı tetikle
  iframe.contentWindow?.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('Iframe print failed, falling back to window.print', e);
      window.print();
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }
  }, 300);
};
