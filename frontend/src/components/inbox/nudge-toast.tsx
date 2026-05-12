'use client';

import { useEffect, useReducer, useRef, useCallback } from 'react';
import { Bell, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NudgePayload {
  conversation_id: string;
  supervisor_id: string;
  supervisor_name: string;
  message: string;
  created_at?: string;
}

interface NudgeItem extends NudgePayload {
  _uid: string;
}

type Action =
  | { type: 'add'; item: NudgeItem }
  | { type: 'remove'; uid: string };

function reducer(state: NudgeItem[], action: Action): NudgeItem[] {
  switch (action.type) {
    case 'add':
      return [...state.slice(-2), action.item];
    case 'remove':
      return state.filter((i) => i._uid !== action.uid);
    default:
      return state;
  }
}

interface Props {
  /** 收到的新 nudge（每次外部 setter 更新就視為新一筆） */
  incoming?: NudgePayload | null;
  /** 點擊跳轉到對話時的回呼 */
  onOpenConversation?: (conversationId: string) => void;
}

const AUTO_DISMISS_MS = 12000;

/**
 * 主管 nudge toast 通知（PRD v1.1 §F8.1）。
 *
 * 顯示在右下角，最多堆 3 則，12 秒自動消失或手動關閉。
 * 點擊跳到對話。
 *
 * 用 useReducer + ref-比對的方式判斷 incoming 是否真的變化，
 * 避開 React 19「不可在 useEffect 中 setState」的限制。
 */
export function NudgeToast({ incoming, onOpenConversation }: Props) {
  const [items, dispatch] = useReducer(reducer, [] as NudgeItem[]);
  const lastIncomingRef = useRef<NudgePayload | null>(null);

  // 用 useEffect 監聽 incoming 變化；以 ref 比對避免重覆 dispatch
  useEffect(() => {
    if (!incoming || incoming === lastIncomingRef.current) return;
    lastIncomingRef.current = incoming;

    const uid = `${incoming.conversation_id}-${incoming.created_at || Date.now()}-${Math.random()}`;
    dispatch({ type: 'add', item: { ...incoming, _uid: uid } });

    const timer = setTimeout(() => {
      dispatch({ type: 'remove', uid });
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [incoming]);

  const dismiss = useCallback((uid: string) => {
    dispatch({ type: 'remove', uid });
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-[60] flex flex-col gap-2 max-w-xs">
      {items.map((n) => (
        <div
          key={n._uid}
          className={cn(
            'rounded-xl border shadow-lg px-3 py-2.5 flex gap-2.5 items-start animate-in slide-in-from-right-4',
            'bg-indigo-50 border-indigo-300 dark:bg-indigo-500/15 dark:border-indigo-500/40'
          )}
        >
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center">
            <Bell className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-200">
              主管 {n.supervisor_name} 提醒你
            </p>
            <p className="text-xs text-zinc-700 dark:text-zinc-200 mt-0.5 whitespace-pre-wrap break-words">
              {n.message}
            </p>
            {onOpenConversation && (
              <button
                onClick={() => {
                  onOpenConversation(n.conversation_id);
                  dismiss(n._uid);
                }}
                className="mt-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-300 hover:underline"
              >
                打開對話
              </button>
            )}
          </div>
          <button
            onClick={() => dismiss(n._uid)}
            className="flex-shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="關閉"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
