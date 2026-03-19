'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { actionsApi, type Action } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Avatar } from '@/components/avatar';
import { LoadingSpinner, EmptyState } from '@/components/loading';
import { cn } from '@/lib/utils';
import {
  CheckSquare,
  Circle,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  ArrowUpDown,
  Filter,
  ChevronDown,
  ClipboardList,
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric',
  });
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

// ── Type Badge ─────────────────────────────────────────

const typeConfig: Record<string, { label: string; color: string }> = {
  quote: { label: '報價', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  visit: { label: '參觀', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  call: { label: '通話', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  sample: { label: '寄樣', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
  service: { label: '維修', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  followup: { label: '跟進', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' },
  delivery: { label: '出貨', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  processing: { label: '加工', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
  proposal: { label: '提案', color: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20' },
  dispatch: { label: '派工中', color: 'bg-blue-600/10 text-blue-700 dark:text-blue-300 border-blue-600/20' },
  dispatched: { label: '已派工', color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' },
  construction: { label: '施工中', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
  measure: { label: '待丈量', color: 'bg-yellow-700/10 text-yellow-700 dark:text-yellow-400 border-yellow-700/20' },
  after_sales: { label: '售後處理', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
};

function TypeBadge({ type }: { type: string }) {
  const config = typeConfig[type] || { label: type, color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20' };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', config.color)}>
      {config.label}
    </span>
  );
}

// ── Priority Badge ─────────────────────────────────────

const priorityConfig: Record<string, { label: string; color: string }> = {
  high: { label: '高', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
  medium: { label: '中', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  low: { label: '低', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20' },
};

function PriorityBadge({ priority }: { priority: string }) {
  const config = priorityConfig[priority] || priorityConfig.low;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-medium', config.color)}>
      {priority === 'high' && <AlertTriangle className="w-2.5 h-2.5" />}
      {config.label}
    </span>
  );
}

// ── Status Select ──────────────────────────────────────

const statusOptions = [
  { value: 'pending', label: '待處理' },
  { value: 'assigned', label: '已指派' },
  { value: 'in_progress', label: '進行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

function StatusSelect({
  status,
  onChange,
}: {
  status: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'px-2 py-1 rounded-md text-xs font-medium border focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none bg-no-repeat',
        status === 'completed'
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
          : status === 'cancelled'
          ? 'bg-zinc-500/10 text-zinc-500 border-zinc-400 dark:border-zinc-600'
          : status === 'in_progress'
          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
          : status === 'assigned'
          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
      )}
    >
      {statusOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ── Action Card ────────────────────────────────────────

function ActionCard({
  action,
  onToggleComplete,
  onStatusChange,
}: {
  action: Action;
  onToggleComplete: () => void;
  onStatusChange: (status: string) => void;
}) {
  const completed = action.status === 'completed';
  const cancelled = action.status === 'cancelled';
  const overdue = !completed && !cancelled && isOverdue(action.due_date);

  return (
    <div
      className={cn(
        'bg-white border border-zinc-200 shadow-sm dark:bg-zinc-800/50 dark:border-transparent dark:shadow-none rounded-lg p-4 transition-all duration-200',
        completed && 'opacity-60',
        action.priority === 'high' && !completed && 'border-l-2 border-l-red-500',
        action.priority !== 'high' && 'border-l-2 border-l-transparent'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={onToggleComplete}
          className="mt-0.5 flex-shrink-0"
        >
          {completed ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <Circle className="w-5 h-5 text-zinc-400 dark:text-zinc-500 hover:text-blue-400 transition-colors" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm text-zinc-700 dark:text-zinc-200',
            completed && 'line-through text-zinc-400 dark:text-zinc-500'
          )}>
            {action.description}
          </p>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <TypeBadge type={action.action_type} />
            <PriorityBadge priority={action.priority} />
          </div>

          {/* Contact + Due Date */}
          <div className="flex items-center gap-4 mt-2.5">
            {action.contact && (
              <Link
                href={`/contacts/${action.contact_id}`}
                className="flex items-center gap-1.5 group"
              >
                <Avatar name={action.contact.name} url={action.contact.avatar_url} size="sm" className="!w-5 !h-5 !text-[8px]" />
                <span className="text-xs text-zinc-500 dark:text-zinc-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                  {action.contact.name}
                </span>
              </Link>
            )}

            {action.due_date && (
              <span className={cn(
                'flex items-center gap-1 text-xs',
                overdue ? 'text-red-500 dark:text-red-400' : 'text-zinc-400 dark:text-zinc-500'
              )}>
                <Calendar className="w-3 h-3" />
                {formatDate(action.due_date)}
                {overdue && <span className="text-[10px]">(逾期)</span>}
              </span>
            )}
          </div>
        </div>

        {/* Status Select */}
        <div className="flex-shrink-0">
          <StatusSelect
            status={action.status}
            onChange={onStatusChange}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────

type SortKey = 'priority' | 'due_date' | 'created_at';

const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function ActionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [sort, setSort] = useState<SortKey>('priority');

  // Local state for optimistic updates
  const [localActions, setLocalActions] = useState<Action[] | null>(null);

  const { data: fetchedActions, loading, error, refetch } = useAsync<Action[]>(
    () => actionsApi.getActions(),
    []
  );

  const actions = localActions ?? fetchedActions ?? [];

  // Apply filters + sort
  const filtered = useMemo(() => {
    let result = [...actions];

    if (statusFilter) {
      result = result.filter((a) => a.status === statusFilter);
    }
    if (priorityFilter) {
      result = result.filter((a) => a.priority === priorityFilter);
    }
    if (typeFilter) {
      result = result.filter((a) => a.action_type === typeFilter);
    }

    result.sort((a, b) => {
      switch (sort) {
        case 'priority':
          return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
        case 'due_date':
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        case 'created_at':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [actions, statusFilter, priorityFilter, typeFilter, sort]);

  // Stats
  const pendingCount = actions.filter((a) => !['completed', 'cancelled'].includes(a.status)).length;
  const completedCount = actions.filter((a) => a.status === 'completed').length;

  // Handlers
  const handleToggleComplete = useCallback(async (action: Action) => {
    const newStatus = action.status === 'completed' ? 'pending' : 'completed';
    // Optimistic update
    setLocalActions((prev) => {
      const list = prev ?? fetchedActions ?? [];
      return list.map((a) =>
        a.id === action.id
          ? { ...a, status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null }
          : a
      );
    });
    try {
      await actionsApi.updateAction(action.id, { status: newStatus });
    } catch {
      // Revert on failure
      setLocalActions(null);
      refetch();
    }
  }, [fetchedActions, refetch]);

  const handleStatusChange = useCallback(async (action: Action, newStatus: string) => {
    setLocalActions((prev) => {
      const list = prev ?? fetchedActions ?? [];
      return list.map((a) =>
        a.id === action.id
          ? { ...a, status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null }
          : a
      );
    });
    try {
      await actionsApi.updateAction(action.id, { status: newStatus });
    } catch {
      setLocalActions(null);
      refetch();
    }
  }, [fetchedActions, refetch]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-blue-400" />
            待辦事項
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            <span className="text-amber-500 dark:text-amber-400 font-medium">{pendingCount}</span> 待處理
            {' · '}
            <span className="text-emerald-500 dark:text-emerald-400 font-medium">{completedCount}</span> 已完成
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
          <Filter className="w-3.5 h-3.5" />
          篩選
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">全部狀態</option>
          <option value="pending">待處理</option>
          <option value="assigned">已指派</option>
          <option value="in_progress">進行中</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">全部優先度</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">全部類型</option>
          <option value="quote">報價</option>
          <option value="visit">參觀</option>
          <option value="call">通話</option>
          <option value="sample">寄樣</option>
          <option value="dispatch">派工中</option>
          <option value="dispatched">已派工</option>
          <option value="construction">施工中</option>
          <option value="measure">待丈量</option>
          <option value="after_sales">售後處理</option>
          <option value="followup">跟進</option>
          <option value="delivery">出貨</option>
          <option value="processing">加工</option>
          <option value="proposal">提案</option>
        </select>

        {/* Sort */}
        <div className="flex items-center gap-1.5 ml-auto text-xs text-zinc-400 dark:text-zinc-500">
          <ArrowUpDown className="w-3.5 h-3.5" />
          排序
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="px-3 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-blue-500"
        >
          <option value="priority">按優先度</option>
          <option value="due_date">按到期日</option>
          <option value="created_at">按建立時間</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="p-6 text-red-400 text-sm text-center">{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={statusFilter || priorityFilter || typeFilter ? '沒有符合條件的待辦事項' : '目前沒有待辦事項'}
          description={statusFilter || priorityFilter || typeFilter ? '試試調整篩選條件' : '🎉 所有工作都完成了！'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onToggleComplete={() => handleToggleComplete(action)}
              onStatusChange={(s) => handleStatusChange(action, s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
