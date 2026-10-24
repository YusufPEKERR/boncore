/**
 * BonCore Yerel Donanım Köprüsü (Local Hardware Bridge Client)
 * ============================================================
 * Kullanıcı bulut/uzak sunucudan sisteme girdiğinde, dükkanındaki
 * CAS CL-3000 terazisine ve termal yazıcılara erişmek için
 * kendi bilgisayarında çalışan 127.0.0.1:9099 ajanına bağlanır.
 */

import { api } from './api';

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
  async getWeight(ip?: string, port?: number): Promise<ScaleReadResult> {
    try {
      // Backend API'si eğer kasa bilgisayarında ajan açıksa otomatik olarak o ajana yönlendirir!
      const backendRes = await api.getScaleWeight(ip, port);
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
  async testConnection(ip?: string, port?: number): Promise<any> {
    return await api.testScaleConnection({
      ip_address: ip || '192.168.1.150',
      port: port || 2004
    });
  }
};
