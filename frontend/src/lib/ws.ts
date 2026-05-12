'use client';

/**
 * MUSE CRM — WebSocket Client（PR-4 / 真實連線）
 *
 * 包裝 socket.io-client，連到後端 `/notifications` namespace。
 *
 * 用法：
 *   import { getWs } from '@/lib/ws';
 *   const ws = getWs();
 *   ws.on('conversation.assigned', (data) => {...});
 *   ws.off('conversation.assigned', handler);
 */

import { io, type Socket } from 'socket.io-client';

type Handler = (data: unknown) => void;

function deriveSocketBase(): string {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api/v1';
  // 去掉 `/api/v1` 後綴拿到 socket 連線根
  return apiBase.replace(/\/api\/v[0-9]+\/?$/, '');
}

class WsClient {
  private listeners = new Map<string, Set<Handler>>();
  private socket: Socket | null = null;
  private connecting = false;

  /** 建立連線（同一個 token 重複呼叫安全）。 */
  connect(): void {
    if (this.socket || this.connecting) return;
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('muse_token');
    if (!token) return;

    this.connecting = true;
    const base = deriveSocketBase();
    const socket = io(`${base}/notifications`, {
      transports: ['websocket', 'polling'],
      // 後端 events.py 從 query.auth 或 Authorization header 取 token
      auth: { token },
      query: { auth: token },
      // 自動重連
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.onAny((event: string, data: unknown) => this.dispatch(event, data));
    socket.on('connect', () => {
      this.connecting = false;
    });
    socket.on('disconnect', () => {
      // socket.io 會自動重連，不需重置 socket
    });
    socket.on('connect_error', (err) => {
      // 401 / token 失效等情況，後端會立刻 disconnect。在 console 留紀錄即可。
      // 不丟到 listeners，避免影響業務邏輯。
      console.warn('[ws] connect_error:', err.message);
    });

    this.socket = socket;
  }

  on(event: string, handler: Handler): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    this.connect();
  }

  off(event: string, handler?: Handler): void {
    if (!handler) {
      this.listeners.delete(event);
      return;
    }
    this.listeners.get(event)?.delete(handler);
  }

  private dispatch(event: string, data: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const h of set) {
      try {
        h(data);
      } catch (err) {
        console.error(`[ws] handler error for ${event}:`, err);
      }
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connecting = false;
  }
}

let singleton: WsClient | null = null;

export function getWs(): WsClient {
  if (!singleton) singleton = new WsClient();
  return singleton;
}
