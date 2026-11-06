/**
 * BonCore Web Native Notifications Service
 * Tarayıcı ve İşletim Sistemi Seviyesinde Doğrudan Cihaz Bildirimleri (Web Notification API & PWA Service Worker)
 */

export interface NativeNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
  requireInteraction?: boolean;
  silent?: boolean;
  url?: string;
}

export function isNativeNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNativeNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Kullanıcıdan tarayıcı / işletim sistemi bildirim izni ister
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNativeNotificationSupported()) {
    console.warn('[BonCore] Native notifications not supported in this environment.');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      sendNativeNotification({
        title: '🔔 BonCore Bildirimleri Aktif Edildi',
        body: 'Mutfak hazır siparişleri, garson çağrıları ve duyurular artık doğrudan cihazınıza iletilecek.',
        tag: 'boncore-welcome-notification'
      });
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[BonCore] Notification permission request error:', err);
    return false;
  }
}

/**
 * Tarayıcı / Masaüstü / Android cihaz bildirimini gönderir
 */
export async function sendNativeNotification(options: NativeNotificationOptions): Promise<void> {
  if (!isNativeNotificationSupported()) return;

  // Henüz izin verilmediyse izin istemeyi dene
  if (Notification.permission === 'default') {
    const granted = await requestNotificationPermission();
    if (!granted) return;
  } else if (Notification.permission !== 'granted') {
    return;
  }

  const {
    title,
    body,
    icon = '/icon-192.png',
    badge = '/icon-192.png',
    tag,
    data,
    requireInteraction = false,
    silent = false,
    url = window.location.href
  } = options;

  // Cihaz titreşimi (mobil)
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {}

  // 1. Tercih: Service Worker showNotification (PWA, arka plan ve Android Chrome için en güvenilir yöntem)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          icon,
          badge,
          tag: tag || `boncore-${Date.now()}`,
          requireInteraction,
          silent,
          data: { url, ...(data || {}) }
        } as any);
        return;
      }
    } catch (e) {
      console.warn('[BonCore] Service Worker showNotification fallback:', e);
    }
  }

  // 2. Tercih: Standart window.Notification (Masaüstü Chrome/Edge/Firefox Safari)
  try {
    const notif = new Notification(title, {
      body,
      icon,
      badge,
      tag: tag || `boncore-${Date.now()}`,
      requireInteraction,
      silent,
      data: { url, ...(data || {}) }
    } as any);

    notif.onclick = () => {
      try {
        window.focus();
        notif.close();
      } catch {}
    };
  } catch (err) {
    console.warn('[BonCore] Native Notification creation error:', err);
  }
}

// Global Custom Event Dinleyicisi
if (typeof window !== 'undefined') {
  window.addEventListener('boncore_send_native_notification', (e: Event) => {
    const ce = e as CustomEvent<NativeNotificationOptions>;
    if (ce.detail && ce.detail.title) {
      sendNativeNotification(ce.detail);
    }
  });
}
