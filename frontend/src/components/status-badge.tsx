'use client';

import { cn } from '@/lib/utils';

// PR-2 對話狀態 + 既有 action / 衍生狀態
const statusStyles: Record<string, string> = {
  // Conversation 新 enum
  unassigned: 'bg-[#F5F3FF] text-[#7C3AED] border-[#DDD6FE] dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20',
  active: 'bg-[#EFF6FF] text-[#2563EB] border-blue-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
  waiting_customer: 'bg-[#EFF6FF] text-[#2563EB] border-blue-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
  escalated: 'bg-red-50 text-[#DC2626] border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
  supervisor_taken: 'bg-[#F5F3FF] text-[#7C3AED] border-[#DDD6FE] dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
  resolved: 'bg-green-50 text-[#16A34A] border-green-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  closed: 'bg-zinc-100 text-[#6B7280] border-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20',
  // 衍生狀態（前端 list 篩選用）
  silent: 'bg-zinc-100 text-[#6B7280] border-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20',
  unanswered: 'bg-[#FEF3C7] text-[#92400E] border-amber-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20',
  // Action 狀態
  pending: 'bg-[#FEF3C7] text-[#92400E] border-amber-200 dark:text-amber-400',
  completed: 'bg-green-50 text-[#16A34A] border-green-200 dark:text-emerald-400',
  overdue: 'bg-red-50 text-[#DC2626] border-red-200 dark:text-red-400',
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
