/**
 * BonCore Yerel Donanım Köprüsü (Local Hardware Bridge Client)
 * ============================================================
 * Kullanıcı bulut/uzak sunucudan sisteme girdiğinde, dükkanındaki
 * CAS CL-3000 terazisine ve termal yazıcılara erişmek için
 * kendi bilgisayarında çalışan 127.0.0.1:9099 ajanına bağlanır.
 */

import { api } from './api';

const LOCAL_AGENT_URL = 'http://127.0.0.1:9099';
const TIMEOUT_MS = 3000;

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
   */
  async checkAgentStatus(): Promise<{ isOnline: boolean; version?: string; localIp?: string }> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${LOCAL_AGENT_URL}/health`, {
        signal: controller.signal
      });
      clearTimeout(id);
      if (res.ok) {
        const data = await res.json();
        return { isOnline: true, version: data.version, localIp: data.local_pc_ip };
      }
    } catch {
      // Yerel ajan çalışmıyor
    }
    return { isOnline: false };
  },

  /**
   * Terazi ağırlığını okur:
   * 1. Önce kullanıcının kendi bilgisayarındaki yerel ajana (127.0.0.1:9099) sorar (aynı yerel ağ).
   * 2. Ajan çalışmıyorsa ana sunucunun backend'ine (/api/scale/weight) sorar.
   */
  async getWeight(ip: string = '192.168.1.150', port: number = 2004): Promise<ScaleReadResult> {
    // 1. Yerel Donanım Ajanını dene (Kullanıcı bilgisayarındaki ağ)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const localRes = await fetch(`${LOCAL_AGENT_URL}/scale/weight?ip=${encodeURIComponent(ip)}&port=${port}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (localRes.ok) {
        const data = await localRes.json();
        return {
          ...data,
          bridge: 'Yerel Donanım Ajanı (Dükkan Ağı)'
        };
      }
    } catch {
      // Yerel ajan yanıt vermedi veya kapalı, ana backend'e yönel
    }

    // 2. Ana Backend Fallback (Aynı sunucuda veya yerel kurulumda çalışırken)
    try {
      const backendRes = await api.getScaleWeight(ip, port);
      return {
        ...backendRes,
        bridge: 'BonCore Bulut / Ana Sunucu'
      };
    } catch (err: any) {
      return {
        success: false,
        weight: 0.0,
        error: `Teraziye ulaşılamadı. Uzak bağlantı kullanıyorsanız lütfen masaüstünüzdeki BonCore Ajanı'nı başlatınız. (${err.message || 'Zaman aşımı'})`
      };
    }
  },

  /**
   * Terazi bağlantısını test eder
   */
  async testConnection(ip: string = '192.168.1.150', port: number = 2004): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(`${LOCAL_AGENT_URL}/scale/test?ip=${encodeURIComponent(ip)}&port=${port}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        return {
          ...data,
          bridge: 'Yerel Donanım Ajanı'
        };
      }
    } catch {
      // fallback
    }

    return await api.testScaleConnection({ ip_address: ip, port });
  }
};
