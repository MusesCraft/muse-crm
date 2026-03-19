'use client';

import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  closed: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400',
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  completed: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
  overdue: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
};

const statusLabels: Record<string, string> = {
  active: '進行中',
  closed: '已關閉',
  pending: '待處理',
  completed: '已完成',
  overdue: '已逾期',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        statusStyles[status] || 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400',
        className
      )}
    >
      {statusLabels[status] || status}
    </span>
  );
}
