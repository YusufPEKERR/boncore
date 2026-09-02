import { useEffect, useRef, useState } from 'react';
import { sound } from './sound';

export type WSEventCallback = (type: string, data: any) => void;

export function useWebSocket(channel: string = 'pos', onEvent?: WSEventCallback) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const onEventRef = useRef<WSEventCallback | undefined>(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/${channel}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          if (unmounted) return;
          try {
            const parsed = JSON.parse(event.data);
            const type = parsed.type;
            const data = parsed.data;

            // Audio chime based on real-time event
            if (type === 'WAITER_CALL_ALERT') {
              sound.waiterBuzzer();
            } else if (type === 'KDS_NEW_ORDER' || type === 'KDS_ITEMS_FIRED') {
              sound.kitchenBell();
            } else if (type === 'KITCHEN_ORDER_READY_ALERT') {
              sound.kitchenBell();
            } else if (type === 'CASH_DRAWER_KICK' || type === 'ORDER_PAID') {
              sound.cashDrawer();
            } else if (type === 'KDS_ITEM_VOIDED') {
              sound.warning();
            } else if (type === 'ONLINE_ORDER_INCOMING' || type === 'CALLER_ID_INCOMING') {
              sound.waiterBuzzer();
            }

            if (onEventRef.current) {
              onEventRef.current(type, data);
            }
          } catch (e) {
            console.warn('[WebSocket] Error parsing message:', e);
          }
        };

        ws.onclose = () => {
          if (unmounted) return;
          setIsConnected(false);
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        };
      } catch (err) {
        if (!unmounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [channel]);

  return { isConnected };
}
