import { useEffect, useRef, useCallback, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';

export type WsMessageType = 'chunk' | 'architecture' | 'done' | 'error';

export interface WsMessage {
  type: WsMessageType;
  payload: string;
}

interface UseWebSocketOptions {
  projectId: string | undefined;
  onChunk?: (text: string) => void;
  onArchitecture?: (data: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

const RECONNECT_DELAYS = [3000, 5000];

export function useWebSocket({
  projectId,
  onChunk,
  onArchitecture,
  onDone,
  onError,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const [connected, setConnected] = useState(false);

  const connect = useCallback(async () => {
    if (!projectId) return;
    const wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) return;

    let token: string | null = null;
    try {
      const session = await fetchAuthSession();
      token = session.tokens?.idToken?.toString() ?? null;
    } catch {
      // auth not available
    }

    const url = `${wsUrl}?projectId=${encodeURIComponent(projectId)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'chunk':
            onChunk?.(msg.payload);
            break;
          case 'architecture':
            onArchitecture?.(msg.payload);
            break;
          case 'done':
            onDone?.();
            break;
          case 'error':
            onError?.(msg.payload);
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (reconnectAttempt.current < RECONNECT_DELAYS.length) {
        const delay = RECONNECT_DELAYS[reconnectAttempt.current]!;
        reconnectAttempt.current++;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [projectId, onChunk, onArchitecture, onDone, onError]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
      return true;
    }
    return false;
  }, []);

  return { connected, send };
}
