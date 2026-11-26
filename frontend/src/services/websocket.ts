import { useEffect, useRef, useState } from 'react';
import { sound } from './sound';

export type WSEventCallback = (type: string, data: any) => void;

interface SingletonChannel {
  key: string;
  channel: string;
  rc: string;
  ws: WebSocket | null;
  connected: boolean;
  closedByRefCount: boolean;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  subscribers: Set<(type: string, data: any) => void>;
  statusListeners: Set<(connected: boolean) => void>;
}

const channelPool = new Map<string, SingletonChannel>();

function dispatchSoundForEvent(type: string) {
  if (type === 'WAITER_CALL_ALERT') {
    sound.waiterBuzzer();
  } else if (type === 'KDS_NEW_ORDER' || type === 'KDS_ITEMS_FIRED' || type === 'KDS_HOLD_FIRE_TOGGLED') {
    sound.kitchenBell();
  } else if (type === 'KITCHEN_ORDER_READY_ALERT') {
    sound.kitchenBell();
  } else if (type === 'CASH_DRAWER_KICK' || type === 'ORDER_PAID') {
    sound.cashDrawer();
  } else if (type === 'KDS_ITEM_VOIDED') {
    sound.warning();
  } else if (
    type === 'ONLINE_ORDER_INCOMING' ||
    type === 'ONLINE_ORDER_INGESTED' ||
    type === 'CALLER_ID_INCOMING' ||
    type === 'CALLER_ID_RINGING'
  ) {
    sound.waiterBuzzer();
  }
}

async function fetchWSTicket(rc: string): Promise<string | null> {
  try {
    const isMaster = localStorage.getItem('boncore_master_auth') === 'true';
    const token = isMaster
      ? (localStorage.getItem('boncore_master_token') || localStorage.getItem('boncore_token') || '')
      : (localStorage.getItem('boncore_token') || localStorage.getItem('boncore_master_token') || '');
    if (!token) return null;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (rc && !isMaster) headers['X-Restaurant-Code'] = rc;
    const res = await fetch('/api/auth/ws-ticket', { method: 'POST', headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ticket || null;
  } catch {
    return null;
  }
}

async function connectEntry(entry: SingletonChannel) {
  if (entry.closedByRefCount || entry.ws) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const params = new URLSearchParams();
  if (entry.rc) params.set('restaurant_code', entry.rc);
  if (!entry.channel.startsWith('table/')) {
    const ticket = await fetchWSTicket(entry.rc);
    if (entry.closedByRefCount) return;
    if (ticket) params.set('ticket', ticket);
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  const wsUrl = `${protocol}//${host}/ws/${entry.channel}${qs}`;

  try {
    const ws = new WebSocket(wsUrl);
    entry.ws = ws;

    ws.onopen = () => {
      if (entry.closedByRefCount) {
        ws.close();
        return;
      }
      entry.reconnectAttempts = 0;
      entry.connected = true;
      entry.statusListeners.forEach((fn) => fn(true));
    };

    ws.onmessage = (event) => {
      if (entry.closedByRefCount) return;
      try {
        const parsed = JSON.parse(event.data);
        const type = parsed.type;
        const data = parsed.data;
        dispatchSoundForEvent(type);
        entry.subscribers.forEach((cb) => {
          try {
            cb(type, data);
          } catch (cbErr) {
            console.warn('[WebSocket] Subscriber error:', cbErr);
          }
        });
      } catch (e) {
        console.warn('[WebSocket] Error parsing message:', e);
      }
    };

    ws.onclose = () => {
      entry.ws = null;
      entry.connected = false;
      entry.statusListeners.forEach((fn) => fn(false));
      if (!entry.closedByRefCount && entry.subscribers.size > 0) {
        const delay = Math.min(30000, 3000 * Math.pow(2, Math.min(entry.reconnectAttempts, 4)));
        entry.reconnectAttempts += 1;
        entry.reconnectTimer = setTimeout(() => {
          entry.reconnectTimer = null;
          connectEntry(entry);
        }, delay);
      }
    };

    ws.onerror = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  } catch {
    if (!entry.closedByRefCount && entry.subscribers.size > 0) {
      const delay = Math.min(30000, 3000 * Math.pow(2, Math.min(entry.reconnectAttempts, 4)));
      entry.reconnectAttempts += 1;
      entry.reconnectTimer = setTimeout(() => {
        entry.reconnectTimer = null;
        connectEntry(entry);
      }, delay);
    }
  }
}

export function useWebSocket(channel: string = 'pos', onEvent?: WSEventCallback, enabled: boolean = true) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const onEventRef = useRef<WSEventCallback | undefined>(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      return;
    }

    let rc = '';
    try {
      rc = (localStorage.getItem('boncore_restaurant_code') || '').trim();
    } catch {}
    const poolKey = `${channel}::${rc}`;

    let entry = channelPool.get(poolKey);
    if (!entry) {
      entry = {
        key: poolKey,
        channel,
        rc,
        ws: null,
        connected: false,
        closedByRefCount: false,
        reconnectAttempts: 0,
        reconnectTimer: null,
        subscribers: new Set(),
        statusListeners: new Set(),
      };
      channelPool.set(poolKey, entry);
    }
    entry.closedByRefCount = false;

    const subscriber = (type: string, data: any) => {
      if (onEventRef.current) {
        onEventRef.current(type, data);
      }
    };
    const statusListener = (conn: boolean) => setIsConnected(conn);

    entry.subscribers.add(subscriber);
    entry.statusListeners.add(statusListener);
    setIsConnected(entry.connected);

    if (!entry.ws && !entry.reconnectTimer) {
      connectEntry(entry);
    }

    return () => {
      if (!entry) return;
      entry.subscribers.delete(subscriber);
      entry.statusListeners.delete(statusListener);
      if (entry.subscribers.size === 0) {
        entry.closedByRefCount = true;
        if (entry.reconnectTimer) {
          clearTimeout(entry.reconnectTimer);
          entry.reconnectTimer = null;
        }
        if (entry.ws) {
          try {
            entry.ws.close();
          } catch {}
          entry.ws = null;
        }
        channelPool.delete(poolKey);
      }
    };
  }, [channel, enabled]);

  return { isConnected };
}
