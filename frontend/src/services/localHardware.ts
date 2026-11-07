/**
 * BonCore Yerel Donanım Köprüsü (Local Hardware Bridge Client)
 * ============================================================
 * Kullanıcı bulut/uzak sunucudan sisteme girdiğinde, dükkanındaki
 * CAS CL-3000 terazisine ve termal yazıcılara erişmek için
 * kendi bilgisayarında çalışan 127.0.0.1:9099 ajanına bağlanır.
 */

import { api } from './api';
import { PrinterConfig } from '../types';

const LOCAL_AGENT_URL = 'http://127.0.0.1:9099';

const isVirtualPrinterName = (name: string): boolean => {
  const low = (name || '').toLowerCase();
  return [
    'microsoft print to pdf',
    'microsoft xps',
    'onenote',
    'fax',
    'anydesk printer',
    'send to onenote'
  ].some(k => low.includes(k));
};

/**
 * Eski otomatik oluşturulmuş sahte/bozuk yazıcı profillerini temizler.
 */
export const sanitizePrinterConfigs = (rawList: any[], validCategoryNames?: string[]): PrinterConfig[] => {
  if (!Array.isArray(rawList)) return [];

  const validUpperSet = validCategoryNames && validCategoryNames.length > 0
    ? new Set(validCategoryNames.map(c => c.trim().toLocaleUpperCase('tr-TR')))
    : null;

  const byTarget = new Map<string, PrinterConfig>();

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const target = String(item.target_printer || '').trim();
    if (!target) continue;

    const rawGroups: string[] = Array.isArray(item.kitchen_groups)
      ? item.kitchen_groups.map((g: any) => String(g).trim()).filter(Boolean)
      : [];

    const cleanedGroups = validUpperSet
      ? rawGroups.filter(g => validUpperSet.has(g.toLocaleUpperCase('tr-TR')))
      : rawGroups;

    // Eski otomatik üretilen (printer-1, printer-2 vb.) ve hiç kategori seçilmemiş sanal yazıcı kayıtlarını atla
    const isAutoLegacyId = /^printer-\d+$/.test(String(item.id || ''));
    if (isAutoLegacyId && cleanedGroups.length === 0 && isVirtualPrinterName(target)) {
      continue;
    }

    const hasKitchenGroups = cleanedGroups.length > 0;
    const cleanCfg: PrinterConfig = {
      id: String(item.id || target),
      name: String(item.name || (target.includes('::') ? target.split('::')[1] : target)).trim(),
      target_printer: target,
      printer_types: {
        adisyon: Boolean(item.printer_types?.adisyon),
        kitchen: hasKitchenGroups ? true : Boolean(item.printer_types?.kitchen && hasKitchenGroups),
        abiyer: Boolean(item.printer_types?.abiyer),
        courier: Boolean(item.printer_types?.courier),
      },
      revenue_center: {
        main_channel: item.revenue_center?.main_channel ?? true,
      },
      kitchen_groups: cleanedGroups,
      settings: {
        print_on_order_save: Boolean(item.settings?.print_on_order_save && !isAutoLegacyId),
        print_on_integration_approved: Boolean(item.settings?.print_on_integration_approved),
        copies: {
          table_order: Math.max(1, Number(item.settings?.copies?.table_order) || 1),
          takeaway_order: Math.max(1, Number(item.settings?.copies?.takeaway_order) || 1),
          delivery_order: Math.max(1, Number(item.settings?.copies?.delivery_order) || 1),
          post_payment: Math.max(1, Number(item.settings?.copies?.post_payment) || 1),
        },
        assign_to_this_device: item.settings?.assign_to_this_device ?? true,
      },
    };

    byTarget.set(target, cleanCfg);
  }

  return Array.from(byTarget.values());
};

export interface ScaleReadResult {
  success: boolean;
  weight: number;
  unit?: string;
  grams?: number;
  is_stable?: boolean;
  raw?: string;
  ip?: string;
  error?: string;
  bridge?: string;
  simulated?: boolean;
  message?: string;
}

export const localHardware = {
  /**
   * Kasa bilgisayarında BonCore Donanım Ajanının çalışıp çalışmadığını kontrol eder.
   * Tarayıcı HTTPS kısıtlamalarını aşmak için önce Sunucu Bulut Rölesini kontrol eder.
   */
  async checkAgentStatus(): Promise<{ isOnline: boolean; version?: string; localIp?: string }> {
    try {
      const cloudStatus = await api.getAgentStatus();
      if (cloudStatus && cloudStatus.isOnline) {
        return {
          isOnline: true,
          version: cloudStatus.version,
          localIp: cloudStatus.localIp
        };
      }
    } catch {
      // cloud relay check failed, try direct
    }

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1000);
      const res = await fetch(`${LOCAL_AGENT_URL}/health`, {
        signal: controller.signal
      });
      clearTimeout(id);
      if (res.ok) {
        const data = await res.json();
        return { isOnline: true, version: data.version, localIp: data.local_pc_ip };
      }
    } catch {
      // Yerel ajan doğrudan ulaşılamıyor
    }

    return { isOnline: false };
  },

  /**
   * Terazi ağırlığını okur:
   * Sunucu Bulut Rölesi veya Kasa Ajanı üzerinden CAS CL-3000'i sorgular.
   */
  async getWeight(ip?: string, port?: number, terminalId?: string): Promise<ScaleReadResult> {
    try {
      const backendRes = await api.getScaleWeight(ip, port, terminalId);
      return backendRes;
    } catch (err: any) {
      return {
        success: false,
        weight: 0.0,
        error: `Teraziye ulaşılamadı. Lütfen kasa bilgisayarınızda BonCore Ajanı'nın açık olduğunu kontrol edin. (${err.message || 'Zaman aşımı'})`
      };
    }
  },

  /**
   * Terazi bağlantısını test eder
   */
  async testConnection(ip?: string, port?: number, terminalId?: string): Promise<any> {
    return await api.testScaleConnection({
      ip_address: ip || '192.168.1.150',
      port: port || 2004,
      terminal_id: terminalId
    } as any);
  },

  /**
   * Tanımlı tüm kasaları ve anlık durumlarını getirir
   */
  async getTerminals() {
    return await api.getTerminals();
  },

  /**
   * Kasa ismini veya varsayılan durumunu günceller
   */
  async updateTerminal(terminalId: string, payload: { name?: string; scale_ip?: string; scale_port?: number; is_default?: boolean }) {
    return await api.updateTerminal(terminalId, payload);
  },

  /**
   * Kasayı listeden kaldırır
   */
  async deleteTerminal(terminalId: string) {
    return await api.deleteTerminal(terminalId);
  },

  /**
   * Kullanıcının bu tarayıcıda seçtiği aktif yazıcı listesini getirir.
   */
  getSelectedPrinters(): string[] {
    try {
      const saved = localStorage.getItem('boncore_selected_printers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(p => typeof p === 'string' && p.trim().length > 0);
        }
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Seçilen yazıcıları tarayıcı hafızasına kaydeder.
   */
  setSelectedPrinters(printers: string[]): void {
    try {
      const unique = Array.from(new Set(printers.filter(Boolean)));
      localStorage.setItem('boncore_selected_printers', JSON.stringify(unique));
    } catch {}
  },

  /**
   * Seçili veya belirtilen yazıcılara adisyon / fiş yazdırır.
   */
  async printReceipt(payload: {
    terminalId?: string;
    printers?: string[];
    document?: any;
    rawText?: string;
    docType?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    results?: Array<{ printer: string; success: boolean }>;
    terminal_id?: string;
    terminal_name?: string;
  }> {
    const printersToUse = (payload.printers && payload.printers.length > 0)
      ? payload.printers
      : this.getSelectedPrinters();

    return await api.printReceipt({
      terminal_id: payload.terminalId,
      printers: printersToUse,
      document: payload.document,
      raw_text: payload.rawText,
      doc_type: payload.docType || 'adisyon'
    });
  },

  /**
   * Tanımlanmış gelişmiş yazıcı profillerini getirir.
   */
  getPrinterConfigs(): PrinterConfig[] {
    try {
      const saved = localStorage.getItem('boncore_printer_configs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return sanitizePrinterConfigs(parsed);
        }
      }
    } catch {}

    return [];
  },

  /**
   * Yazıcı profillerini yerel depolamaya ve sunucu ayarlarına kaydeder.
   */
  async savePrinterConfigs(configs: PrinterConfig[]): Promise<void> {
    try {
      const sanitized = sanitizePrinterConfigs(configs);
      localStorage.setItem('boncore_printer_configs', JSON.stringify(sanitized));

      // Yalnızca aktif bir görevi (Adisyon, Kategori seçili Mutfak, Kurye veya Abiyer) olan yazıcıları seçili listesine ekle
      const activeTargets = sanitized
        .filter(c =>
          c.target_printer && (
            c.printer_types?.adisyon ||
            (c.kitchen_groups && c.kitchen_groups.length > 0) ||
            c.printer_types?.courier ||
            c.printer_types?.abiyer
          )
        )
        .map(c => c.target_printer);

      this.setSelectedPrinters(activeTargets);

      try {
        await api.updateSettings({ printer_configs: sanitized });
      } catch (err) {
        console.warn('Yazıcı profilleri sunucuya eşitlenemedi:', err);
      }
    } catch (e) {
      console.warn('Yazıcı profilleri kaydedilemedi:', e);
    }
  },

  /**
   * Adisyon fişi yazdıracak hedef yazıcı listesini döndürür.
   */
  getAdisyonPrinters(): string[] {
    const configs = this.getPrinterConfigs();
    const adisyonTargets = configs
      .filter(c => c.printer_types?.adisyon && c.target_printer)
      .map(c => c.target_printer);

    if (adisyonTargets.length > 0) {
      return Array.from(new Set(adisyonTargets));
    }
    return this.getSelectedPrinters();
  },

  /**
   * Adisyon yazdıracak profilleri döndürür (Nüsha ayarlarıyla birlikte).
   */
  getAdisyonPrinterConfigs(): PrinterConfig[] {
    const configs = this.getPrinterConfigs();
    const adisyonConfigs = configs.filter(c => c.printer_types?.adisyon && c.target_printer);
    return adisyonConfigs;
  },

  /**
   * Mutfak sipariş fişini, kategori eşleşmelerine göre ilgili yazıcılara otomatik yönlendirir.
   * KURAL:
   * 1. Siparişe eklenen her ürünün hangi kategoride olduğuna bakılır.
   * 2. Yazıcılardan hangisi o kategoriyi (kitchen_groups) seçmişse ona bakılır.
   * 3. İkisi de aynıysa o yazıcıdan fiş yazdırılır; eşleşme yoksa kesinlikle yazdırılmaz.
   */
  async printKitchenTicketsForOrder(params: {
    orderNo: string;
    tableName: string;
    waiterName: string;
    orderType: string;
    items: Array<{
      product_id?: number;
      product_name: string;
      category_name?: string;
      quantity: number;
      variant?: string;
      variant_name?: string;
      selected_modifiers?: any[];
      kitchen_note?: string;
      course_stage?: number;
    }>;
    orderNote?: string;
    categories?: any[];
  }): Promise<{ success: boolean; dispatchedPrinters: string[] }> {
    const configs = this.getPrinterConfigs();
    if (!configs || configs.length === 0 || !params.items || params.items.length === 0) {
      return { success: false, dispatchedPrinters: [] };
    }

    const dispatchedPrinters: string[] = [];
    const dateStr = new Date().toLocaleDateString('tr-TR');
    const timeStr = new Date().toLocaleTimeString('tr-TR');

    // Ürün ID -> Kategori Adı ve Ürün Adı -> Kategori Adı haritalarını hazırla
    const catByIdMap = new Map<number, string>();
    const catByNameMap = new Map<string, string>();
    if (params.categories && Array.isArray(params.categories)) {
      params.categories.forEach(c => {
        const catName = String(c.name || '').trim();
        if (!catName) return;
        (c.products || []).forEach((p: any) => {
          if (p.id !== undefined && p.id !== null) {
            catByIdMap.set(Number(p.id), catName);
          }
          if (p.name) {
            catByNameMap.set(String(p.name).trim().toLocaleUpperCase('tr-TR'), catName);
          }
        });
      });
    }

    for (const cfg of configs) {
      if (!cfg.target_printer) continue;

      // Bu yazıcıda seçili olan kategorileri al
      const selectedPrinterCategories = Array.isArray(cfg.kitchen_groups)
        ? cfg.kitchen_groups
            .map(g => String(g || '').trim().toLocaleUpperCase('tr-TR'))
            .filter(Boolean)
        : [];

      // Yazıcıda hiçbir kategori seçilmemişse bu yazıcıdan fiş çıkarma!
      if (selectedPrinterCategories.length === 0) {
        continue;
      }

      // Siparişteki ürünlerin kategorisine bak ve yazıcının seçtiği kategorilerle birebir karşılaştır
      const matchingItems = params.items.filter(it => {
        const rawItemCat =
          it.category_name ||
          (it.product_id !== undefined && it.product_id !== null ? catByIdMap.get(Number(it.product_id)) : '') ||
          catByNameMap.get(String(it.product_name || '').trim().toLocaleUpperCase('tr-TR')) ||
          '';

        const normItemCat = String(rawItemCat).trim().toLocaleUpperCase('tr-TR');
        if (!normItemCat) return false;

        // İkisi de aynı kategoriyse true, değilse false
        return selectedPrinterCategories.includes(normItemCat);
      });

      // Eşleşen ürün yoksa bu yazıcıya kesinlikle yazdırma!
      if (matchingItems.length === 0) {
        continue;
      }

      let copies = 1;
      const copySettings = cfg.settings?.copies;
      if (copySettings) {
        if ((params.orderType === 'dine_in' || params.orderType === 'table') && copySettings.table_order) {
          copies = Math.max(1, copySettings.table_order);
        } else if (params.orderType === 'takeaway' && copySettings.takeaway_order) {
          copies = Math.max(1, copySettings.takeaway_order);
        } else if (params.orderType === 'delivery' && copySettings.delivery_order) {
          copies = Math.max(1, copySettings.delivery_order);
        }
      }

      const lines: string[] = [];
      lines.push('================================');
      lines.push(`     *** ${cfg.name.toLocaleUpperCase('tr-TR')} SİPARİŞİ ***     `);
      lines.push('================================');
      lines.push(`Masa:    ${params.tableName}`);
      lines.push(`Adisyon: ${params.orderNo.startsWith('#') ? params.orderNo : '#' + params.orderNo}`);
      lines.push(`Garson:  ${params.waiterName}`);
      lines.push(`Tarih:   ${dateStr} ${timeStr}`);
      lines.push('--------------------------------');
      lines.push('ÜRÜN                        ADET');
      lines.push('--------------------------------');

      matchingItems.forEach(it => {
        const qty = Number.isInteger(Number(it.quantity)) ? it.quantity : Number(it.quantity).toFixed(3);
        const vName = it.variant || it.variant_name ? ` (${it.variant || it.variant_name})` : '';
        lines.push(`[x${qty}] ${it.product_name}${vName}`);

        if (it.selected_modifiers && Array.isArray(it.selected_modifiers) && it.selected_modifiers.length > 0) {
          const modText = it.selected_modifiers.map(m => m.name || m).join(', ');
          lines.push(`    + ${modText}`);
        }
        if (it.kitchen_note) {
          lines.push(`    * Not: ${it.kitchen_note}`);
        }
      });

      lines.push('--------------------------------');
      if (params.orderNote) {
        lines.push(`Sipariş Notu: ${params.orderNote}`);
        lines.push('--------------------------------');
      }
      lines.push(`Yazıcı: ${cfg.name}`);
      lines.push('================================\n\n\n\n');

      const rawText = lines.join('\n');

      for (let c = 0; c < copies; c++) {
        try {
          await this.printReceipt({
            printers: [cfg.target_printer],
            rawText,
            docType: 'mutfak_siparis'
          });
        } catch (printErr) {
          console.warn(`Mutfak yazıcısı (${cfg.name}) yazdırma uyarısı:`, printErr);
        }
      }

      dispatchedPrinters.push(cfg.name);
    }

    return {
      success: dispatchedPrinters.length > 0,
      dispatchedPrinters
    };
  }
};
