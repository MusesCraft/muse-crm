'use client';

import { cn } from '@/lib/utils';

// PR-2 對話狀態 + 既有 action / 衍生狀態
const statusStyles: Record<string, string> = {
  // Conversation 新 enum
  unassigned: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  waiting_customer: 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400',
  escalated: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
  supervisor_taken: 'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400',
  resolved: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-400',
  closed: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400',
  // 衍生狀態（前端 list 篩選用）
  silent: 'bg-zinc-500/10 text-zinc-500 border-zinc-400/20 dark:text-zinc-400',
  unanswered: 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400',
  // Action 狀態
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  completed: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-400',
  overdue: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
};

const statusLabels: Record<string, string> = {
  unassigned: '待認領',
  active: '活躍',
  waiting_customer: '等待客戶',
  escalated: '已求援',
  supervisor_taken: '主管接管',
  resolved: '已解決',
  closed: '已關閉',
  silent: '沉默',
  unanswered: '未回',
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
