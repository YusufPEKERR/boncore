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
const TIMEOUT_MS = 4000;

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
    // 1. Bulut Sunucu Rölesi üzerinden kontrol et (HTTPS ile %100 uyumlu, Mixed-Content engeline takılmaz!)
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

    // 2. Doğrudan yerel HTTP soketini dene (Eğer sayfa localhost üzerindeyse)
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
   * Kullanıcının bu tarayıcıda seçtiği yazıcı listesini getirir.
   */
  getSelectedPrinters(): string[] {
    try {
      const saved = localStorage.getItem('boncore_selected_printers');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  },

  /**
   * Seçilen yazıcıları tarayıcı hafızasına kaydeder.
   */
  setSelectedPrinters(printers: string[]): void {
    try {
      localStorage.setItem('boncore_selected_printers', JSON.stringify(printers));
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}

    const selected = this.getSelectedPrinters();
    if (selected.length > 0) {
      return selected.map((p, idx) => ({
        id: `printer-${idx + 1}`,
        name: p.includes('::') ? p.split('::')[1] : p,
        target_printer: p,
        printer_types: {
          adisyon: true,
          kitchen: true,
          abiyer: false,
          courier: false
        },
        revenue_center: {
          main_channel: true
        },
        kitchen_groups: [],
        settings: {
          print_on_order_save: true,
          print_on_integration_approved: true,
          copies: {
            table_order: 1,
            takeaway_order: 1,
            delivery_order: 1,
            post_payment: 1
          },
          assign_to_this_device: true
        }
      }));
    }

    return [];
  },

  /**
   * Yazıcı profillerini yerel depolamaya ve sunucu ayarlarına kaydeder.
   */
  async savePrinterConfigs(configs: PrinterConfig[]): Promise<void> {
    try {
      localStorage.setItem('boncore_printer_configs', JSON.stringify(configs));
      const activeTargets = configs.map(c => c.target_printer).filter(Boolean);
      this.setSelectedPrinters(activeTargets);
      try {
        await api.updateSettings({ printer_configs: configs });
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
    if (adisyonConfigs.length > 0) {
      return adisyonConfigs;
    }
    const selected = this.getSelectedPrinters();
    return selected.map(p => ({
      id: `default-${p}`,
      name: p.includes('::') ? p.split('::')[1] : p,
      target_printer: p,
      printer_types: { adisyon: true, kitchen: false, abiyer: false, courier: false },
      revenue_center: { main_channel: true },
      kitchen_groups: [],
      settings: {
        print_on_order_save: false,
        print_on_integration_approved: false,
        copies: { table_order: 1, takeaway_order: 1, delivery_order: 1, post_payment: 1 },
        assign_to_this_device: true
      }
    }));
  },

  /**
   * Mutfak sipariş fişini, kategori/mutfak grubu eşleşmelerine göre ilgili yazıcılara otomatik yönlendirir.
   */
  async printKitchenTicketsForOrder(params: {
    orderNo: string;
    tableName: string;
    waiterName: string;
    orderType: string;
    items: Array<{
      product_id?: number;
      product_name: string;
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

    const catMap = new Map<number, string>();
    if (params.categories && Array.isArray(params.categories)) {
      params.categories.forEach(c => {
        (c.products || []).forEach((p: any) => {
          catMap.set(p.id, c.name);
        });
      });
    }

    for (const cfg of configs) {
      if (!cfg.target_printer) continue;

      const isKitchen = !!cfg.printer_types?.kitchen;
      const printOnSave = !!cfg.settings?.print_on_order_save;

      if (!isKitchen && !printOnSave) continue;

      const matchingItems = params.items.filter(it => {
        if (printOnSave) return true;

        if (!cfg.kitchen_groups || cfg.kitchen_groups.length === 0) return true;

        const itemCatName = it.product_id ? (catMap.get(it.product_id) || '') : '';
        const normItemCat = itemCatName.trim().toUpperCase();

        return cfg.kitchen_groups.some(g => {
          const normG = g.trim().toUpperCase();
          return normG === normItemCat || it.product_name.toUpperCase().includes(normG);
        });
      });

      if (matchingItems.length === 0) continue;

      let copies = 1;
      const copySettings = cfg.settings?.copies;
      if (copySettings) {
        if (params.orderType === 'dine_in' && copySettings.table_order) {
          copies = Math.max(1, copySettings.table_order);
        } else if (params.orderType === 'takeaway' && copySettings.takeaway_order) {
          copies = Math.max(1, copySettings.takeaway_order);
        } else if (params.orderType === 'delivery' && copySettings.delivery_order) {
          copies = Math.max(1, copySettings.delivery_order);
        }
      }

      const lines: string[] = [];
      lines.push('================================');
      lines.push(`     *** ${cfg.name.toUpperCase()} SİPARİŞİ ***     `);
      lines.push('================================');
      lines.push(`Masa:    ${params.tableName}`);
      lines.push(`Adisyon: #${params.orderNo}`);
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
