'use client';

import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** watchers 陣列（後端 conversation.watchers，user_id 字串） */
  watchers?: string[] | null;
  /** 補充 user_id → 顯示名稱的對應（可選） */
  nameMap?: Record<string, string>;
  className?: string;
}

/**
 * 顯示「N 位主管正在監看此對話」的橫幅（PRD v1.1 §F3.3）。
 *
 * 出現在 conversation-detail 頂部，讓 agent 知道有主管在看，但不打擾。
 */
export function WatchingIndicator({ watchers, nameMap, className }: Props) {
  const list = (watchers || []).filter(Boolean);
  if (list.length === 0) return null;

  const labels = list.map((uid) => nameMap?.[uid] || `主管 ${uid.slice(0, 6)}`);
  const display = labels.length <= 2 ? labels.join('、') : `${labels.slice(0, 2).join('、')} 等 ${labels.length} 人`;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-1.5 text-xs border-b',
        'bg-sky-50 border-sky-200 text-sky-700',
        'dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-300',
        className
      )}
    >
      <Eye className="w-3.5 h-3.5 flex-shrink-0" />
      <span>
        {display} 正在監看此對話
      </span>
    </div>
  );
}
