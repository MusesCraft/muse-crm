'use client';

import { useState } from 'react';
import { conversationOpsApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  conversationId: string | number;
  onEscalated?: () => void;
}

/**
 * 求援按鈕（PRD §F3.4）。
 * 客服在對話中按下後，要求填寫 ≤ 200 字的求援原因，並送至後端。
 */
export function EscalationButton({ conversationId, onEscalated }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('請填寫求援原因');
      return;
    }
    if (trimmed.length > 200) {
      setError('求援原因不可超過 200 字');
      return;
    }
    setSubmitting(true);
    try {
      await conversationOpsApi.escalate(conversationId, trimmed);
      setOpen(false);
      setReason('');
      onEscalated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        求援
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>請求主管支援</DialogTitle>
          </DialogHeader>
          <textarea
            rows={4}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="請說明需要主管協助的原因（≤ 200 字）"
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500 resize-none"
          />
          <p className="text-xs text-zinc-400">{reason.length}/200</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="text-xs text-zinc-500 px-4 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !reason.trim()}
              className="flex items-center gap-1 text-xs font-medium bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
              送出求援
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
