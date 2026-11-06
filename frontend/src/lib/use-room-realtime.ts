"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { openSocket } from "@/lib/api";
import type { ChatMessage, PresenceMember, Timer } from "@/lib/types";

export type RoomEvent = "members_changed" | "room_updated" | "kicked" | "room_deleted";

export type RoomHandlers = {
  onEvent: (e: RoomEvent) => void;
  onTimer: (timer: Timer, serverNow: string) => void;
  onChat: (msg: ChatMessage) => void;
  onChatDeleted: (id: string) => void;
  /** Called on every (re)connect, e.g. to reload anything missed while offline. */
  onConnected: () => void;
};

/**
 * Keeps a WebSocket joined to a room, reconnecting with backoff, and exposes
 * live presence. Everything else is passed to the handlers.
 */
export function useRoomRealtime(roomId: string, handlers: RoomHandlers) {
  const [presence, setPresence] = useState<PresenceMember[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const h = useRef(handlers);

  useEffect(() => {
    h.current = handlers;
  });

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const retry = () => {
      if (stopped) return;
      attempt += 1;
      timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt));
    };

    async function connect() {
      let ws: WebSocket;
      try {
        ws = await openSocket();
      } catch {
        retry();
        return;
      }
      if (stopped) {
        ws.close();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        ws.send(JSON.stringify({ type: "join", roomId }));
        h.current.onConnected();
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case "presence":
            setPresence(msg.members);
            break;
          case "chat":
            h.current.onChat(msg);
            break;
          case "chat_deleted":
            h.current.onChatDeleted(msg.id);
            break;
          case "timer":
            h.current.onTimer(msg.timer, msg.serverNow);
            break;
          case "error":
            setError(msg.message);
            break;
          case "kicked":
          case "left":
          case "room_deleted":
            stopped = true;
            ws.close();
            h.current.onEvent(msg.type === "left" ? "kicked" : msg.type);
            break;
          case "members_changed":
          case "room_updated":
            h.current.onEvent(msg.type);
            break;
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        setConnected(false);
        retry();
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [roomId]);

  const sendChat = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    setError(null);
    ws.send(JSON.stringify({ type: "chat", text }));
    return true;
  }, []);

  return { presence, connected, error, sendChat };
}
