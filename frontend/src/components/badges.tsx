'use client';

import { AlertTriangle, Smile, Meh, Frown } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Priority Badge ────────────────────────────────────

const priorityConfig: Record<string, { label: string; color: string }> = {
  high: { label: '高', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
  medium: { label: '中', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  low: { label: '低', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20' },
};

export function PriorityBadge({ priority }: { priority?: string }) {
  const config = priorityConfig[priority || 'low'] || priorityConfig.low;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-medium', config.color)}>
      {priority === 'high' && <AlertTriangle className="w-2.5 h-2.5" />}
      {config.label}
    </span>
  );
}

// ── Urgency Badge ─────────────────────────────────────

export function UrgencyBadge({ urgency }: { urgency?: string }) {
  if (!urgency || urgency === 'low') return null;
  const config: Record<string, { color: string; label: string }> = {
    high: { color: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25', label: '高' },
    medium: { color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25', label: '中' },
  };
  const c = config[urgency];
  if (!c) return null;

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', c.color)}>
      <AlertTriangle className="w-3 h-3" />
      緊急度：{c.label}
    </span>
  );
}

// ── Compact Urgency Badge (for conversation list) ─────

export function UrgencyBadgeCompact({ urgency }: { urgency?: string }) {
  if (!urgency || urgency === 'low') return null;
  if (urgency === 'high') {
    return (
      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white dark:bg-red-600">
        急
      </span>
    );
  }
  if (urgency === 'medium') {
    return (
      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-orange-500 text-white dark:bg-orange-600">
        中
      </span>
    );
  }
  return null;
}

// ── Sentiment Badge ───────────────────────────────────

export function SentimentBadge({ sentiment }: { sentiment: string }) {
  const config: Record<string, { icon: typeof Smile; color: string; label: string }> = {
    positive: { icon: Smile, color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25', label: '正面' },
    neutral: { icon: Meh, color: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25', label: '中性' },
    negative: { icon: Frown, color: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25', label: '負面' },
  };
  const c = config[sentiment] || config.neutral;
  const Icon = c.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', c.color)}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

// ── Type Badge ────────────────────────────────────────

const typeConfig: Record<string, { label: string; color: string }> = {
  quote: { label: '報價', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  visit: { label: '參觀', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  call: { label: '通話', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
  sample: { label: '寄樣', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
  service: { label: '維修', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  followup: { label: '跟進', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' },
  delivery: { label: '出貨', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  processing: { label: '加工', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
  proposal: { label: '提案', color: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20' },
  dispatch: { label: '派工中', color: 'bg-indigo-600/10 text-indigo-700 dark:text-indigo-300 border-indigo-600/20' },
  dispatched: { label: '已派工', color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' },
  construction: { label: '施工中', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
  measure: { label: '待丈量', color: 'bg-yellow-700/10 text-yellow-700 dark:text-yellow-400 border-yellow-700/20' },
  after_sales: { label: '售後處理', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
};

export function TypeBadge({ type }: { type: string }) {
  const config = typeConfig[type] || { label: type, color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20' };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', config.color)}>
      {config.label}
    </span>
  );
}
