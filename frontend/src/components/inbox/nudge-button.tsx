'use client';

import { useState } from 'react';
import { conversationOpsApi, ApiError } from '@/lib/api';
import { Bell, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  conversationId: string | number;
  /** 預設要 nudge 的 agent id（通常為對話的 current_handler_id） */
  defaultAgentId?: string | null;
  /** 推完之後通知父層（例如刷新對話事件 timeline） */
  onSent?: () => void;
  className?: string;
}

/**
 * 主管專用「推 nudge」按鈕（PRD v1.1 §F3.3）。
 *
 * 主管不直接對客戶發訊，但可以推一則簡短提醒給 agent，
 * agent 端會收到 toast 通知 + inbox 紅點。
 */
export function NudgeButton({ conversationId, defaultAgentId, onSent, className }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const msg = message.trim();
    if (!msg) {
      setError('請填寫 nudge 訊息');
      return;
    }
    if (!defaultAgentId) {
      setError('對話無 handler，無法推 nudge');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await conversationOpsApi.sendNudge(conversationId, defaultAgentId, msg);
      onSent?.();
      setOpen(false);
      setMessage('');
    } catch (e) {
      const apiErr = e as ApiError;
      setError(apiErr.message || '推送失敗');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/40 dark:hover:bg-indigo-500/30"
        title="推一則提醒給負責客服"
      >
        <Bell className="w-3.5 h-3.5" />
        推 Nudge
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl">
          <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">推 Nudge 給負責客服</span>
            <button
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              aria-label="關閉"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-3 space-y-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="例：客戶提到投訴關鍵字，請優先回覆並用道歉語氣"
              rows={3}
              maxLength={200}
              className="w-full text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">{message.length}/200</span>
              {error && <span className="text-[10px] text-red-500">{error}</span>}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="text-xs px-3 py-1.5 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !message.trim()}
                className="text-xs px-3 py-1.5 rounded-md bg-indigo-500 text-white hover:bg-indigo-600 disabled:bg-indigo-300 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                推送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
