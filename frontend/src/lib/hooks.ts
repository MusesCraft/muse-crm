'use client';

import { useState, useEffect, useCallback, useRef, type DependencyList } from 'react';
import { getWs } from './ws';

interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList = []
): UseAsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || '發生錯誤');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, ...deps]);

  return { data, loading, error, refetch };
}

/**
 * 訂閱 WebSocket 事件。元件卸載時自動退訂。
 *
 * @example
 *   useWebSocketEvent<{ conversation_id: string }>('conversation.assigned', (data) => {
 *     refetchList();
 *   });
 */
export function useWebSocketEvent<T = unknown>(
  event: string,
  callback: (data: T) => void,
): void {
  // 用 ref 鎖最新的 callback，避免每次重渲染都重新訂閱
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const ws = getWs();
    const handler = (data: unknown) => cbRef.current(data as T);
    ws.on(event, handler);
    return () => ws.off(event, handler);
  }, [event]);
}
