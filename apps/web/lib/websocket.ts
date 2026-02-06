import { useEffect, useRef, useState, useCallback } from 'react';
import type { StatsSummary } from '@clashmaster/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface WebSocketMessage {
  type: 'stats' | 'ping' | 'pong';
  data?: StatsSummary;
  timestamp: string;
}

interface UseWebSocketOptions {
  onMessage?: (data: StatsSummary) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function useStatsWebSocket(options: UseWebSocketOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<StatsSummary | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPingTimeRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (typeof window === 'undefined') return;

    setStatus('connecting');

    // Support dynamic WebSocket URL configuration
    // Priority: NEXT_PUBLIC_WS_URL > host-relative WS > default localhost
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || '3002';
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL 
      ? process.env.NEXT_PUBLIC_WS_URL
      : typeof window !== 'undefined' 
        ? `ws://${window.location.hostname}:${wsPort}`
        : `ws://localhost:${wsPort}`;
    
    console.log('[WebSocket] Connecting to:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
        options.onConnect?.();

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            lastPingTimeRef.current = Date.now();
            ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;

          if (message.type === 'stats' && message.data) {
            setLastMessage(message.data);
            options.onMessage?.(message.data);
          } else if (message.type === 'pong') {
            if (lastPingTimeRef.current > 0) {
              setLatency(Date.now() - lastPingTimeRef.current);
            }
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] Disconnected. Code: ${event.code}, Reason: ${event.reason}`);
        setStatus('disconnected');
        options.onDisconnect?.();

        // Clear intervals
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Auto reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(3000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.log('[WebSocket] Max reconnection attempts reached, giving up');
          setStatus('error');
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Connection error. URL:', wsUrl);
        setStatus('error');
        options.onError?.(error);
      };
    } catch (err) {
      console.error('[WebSocket] Failed to create connection:', err);
      setStatus('error');
    }
  }, [options]);

  const disconnect = useCallback(() => {
    reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent auto reconnect
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    status,
    lastMessage,
    latency,
    connect,
    disconnect,
  };
}
