"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "error";

type RealtimeEnvelope = {
  event: string;
  payload: Record<string, unknown>;
  timestamp?: string;
};

type UseRealtimeSocketOptions = {
  token?: string;
  enabled?: boolean;
  onEvent?: (message: RealtimeEnvelope) => void;
};

function buildRealtimeWsUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  const normalized = base.replace(/^http/i, "ws").replace(/\/$/, "");
  return `${normalized}/api/realtime/ws?token=${encodeURIComponent(token)}`;
}

export function useRealtimeSocket({ token, enabled = true, onEvent }: UseRealtimeSocketOptions) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const reconnectAttemptRef = useRef(0);

  // Keep a stable ref to the latest onEvent callback so the WebSocket effect
  // doesn't reconnect every time the parent re-renders with a new inline function.
  const onEventRef = useRef(onEvent);
  useLayoutEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    if (!enabled || !token) {
      setConnectionState("idle");
      return;
    }

    let stopped = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const cleanupTimers = () => {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    };

    const connect = () => {
      if (stopped) return;
      setConnectionState(reconnectAttemptRef.current === 0 ? "connecting" : "reconnecting");
      const wsUrl = buildRealtimeWsUrl(token);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionState("connected");
        setLastError(null);
        heartbeatTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
        }, 25000);
      };

      ws.onmessage = (evt) => {
        // Backend sends pong as JSON; ignore plain-text non-JSON frames gracefully.
        try {
          const parsed = JSON.parse(evt.data) as RealtimeEnvelope;
          // Don't surface internal pong events to consumers.
          if (parsed.event === "pong") return;
          onEventRef.current?.(parsed);
        } catch {
          console.warn("[useRealtimeSocket] Non-JSON frame received:", evt.data);
        }
      };

      ws.onerror = (err) => {
        console.warn("[useRealtimeSocket] WebSocket error:", err);
        setLastError("Realtime connection error");
      };

      ws.onclose = () => {
        cleanupTimers();
        if (stopped) return;
        reconnectAttemptRef.current += 1;
        setConnectionState("error");
        const delayMs = Math.min(10000, 1000 * (2 ** Math.min(reconnectAttemptRef.current, 4)));
        reconnectTimer = setTimeout(connect, delayMs);
      };
    };

    connect();

    return () => {
      stopped = true;
      cleanupTimers();
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [token, enabled]); // onEvent intentionally excluded — updated via ref above

  return { connectionState, lastError };
}
