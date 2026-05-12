'use client';

/**
 * MUSE CRM — Server-Sent Events Client（PR-6）
 *
 * 用於接收 AI Copilot 回覆草稿串流。
 *
 * 為什麼不用 EventSource：EventSource 不支援自訂 headers（無法帶 Authorization）。
 * 改用 fetch + ReadableStream 手動解析 SSE 串流，確保 Bearer token 能傳遞。
 *
 * 用法：
 *   const close = openSse('/ai/suggestions?conversation_id=xxx&stream=1', {
 *     onSuggestion: (idx, sug) => { ... },
 *     onDone: () => { ... },
 *   });
 *   // 之後可呼叫 close() 中止連線
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api/v1';

export interface SuggestionEventData {
  index: number;
  suggestion: { text: string; confidence?: number; kb_refs?: string[] };
}

export interface OpenSseOptions {
  onSuggestion?: (idx: number, sug: SuggestionEventData['suggestion']) => void;
  onDone?: (recordId?: string) => void;
  onError?: (err: unknown) => void;
}

interface SseEvent {
  event: string;
  data: string;
}

/**
 * 將 SSE wire format 切成事件物件。
 * SSE 規範：事件之間以「空行」（\n\n）分隔，每行 `field: value`。
 */
function parseSseChunk(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  let rest = buffer;

  // 標準化換行（CRLF / CR → LF）
  rest = rest.replace(/\r\n?/g, '\n');

  while (true) {
    const sep = rest.indexOf('\n\n');
    if (sep === -1) break;
    const block = rest.slice(0, sep);
    rest = rest.slice(sep + 2);

    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      // SSE 規範：冒號後可選空白
      const value = colon === -1
        ? ''
        : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') dataLines.push(value);
    }
    if (dataLines.length > 0) {
      events.push({ event, data: dataLines.join('\n') });
    }
  }

  return { events, rest };
}

export function openSse(path: string, opts: OpenSseOptions = {}): () => void {
  const token = typeof window !== 'undefined' ? localStorage.getItem('muse_token') : null;
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!res.ok || !res.body) {
        opts.onError?.(new Error(`SSE 連線失敗：HTTP ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseChunk(buffer);
        buffer = rest;
        for (const evt of events) {
          if (evt.event === 'suggestion') {
            try {
              const payload = JSON.parse(evt.data) as SuggestionEventData;
              opts.onSuggestion?.(payload.index, payload.suggestion);
            } catch (err) {
              opts.onError?.(err);
            }
          } else if (evt.event === 'done') {
            try {
              const payload = JSON.parse(evt.data) as { record_id?: string };
              opts.onDone?.(payload.record_id);
            } catch {
              opts.onDone?.();
            }
          }
        }
      }
      // 流結束但沒收到 done 事件 — 仍視為完成
      opts.onDone?.();
    } catch (err) {
      // AbortError 是主動關閉，不視為錯誤
      if ((err as Error)?.name !== 'AbortError') {
        opts.onError?.(err);
      }
    }
  })();

  return () => controller.abort();
}
