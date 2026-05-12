'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { actionsApi, type Action } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Avatar } from '@/components/avatar';
import { ContactPreview } from '@/components/contact-preview';
import { PriorityBadge, TypeBadge } from '@/components/badges';
import { LoadingSpinner, EmptyState } from '@/components/loading';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  CheckSquare,
  Circle,
  CheckCircle2,
  Calendar,
  ArrowUpDown,
  Filter,
  ClipboardList,
  Plus,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// -- Helpers --

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

// -- Status Select --

const statusOptions = [
  { value: 'pending', label: '\u5F85\u8655\u7406' },
  { value: 'assigned', label: '\u5DF2\u6307\u6D3E' },
  { value: 'in_progress', label: '\u9032\u884C\u4E2D' },
  { value: 'completed', label: '\u5DF2\u5B8C\u6210' },
  { value: 'cancelled', label: '\u5DF2\u53D6\u6D88' },
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
      aria-label="變更狀態"
      className={cn(
        'px-2 py-1 rounded-md text-xs font-medium border focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer appearance-none bg-no-repeat',
        status === 'completed'
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
          : status === 'cancelled'
          ? 'bg-zinc-500/10 text-zinc-500 border-zinc-400 dark:border-zinc-600'
          : status === 'in_progress'
          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
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

// -- Action Card --

function ActionCard({
  action,
  onToggleComplete,
  onStatusChange,
  onClick,
}: {
  action: Action;
  onToggleComplete: () => void;
  onStatusChange: (status: string) => void;
  onClick: () => void;
}) {
  const completed = action.status === 'completed';
  const cancelled = action.status === 'cancelled';
  const overdue = !completed && !cancelled && isOverdue(action.due_date);

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white border border-zinc-200 shadow-sm dark:bg-zinc-800/50 dark:border-transparent dark:shadow-none rounded-lg p-4 transition-all duration-200 cursor-pointer',
        completed && 'opacity-60',
        action.priority === 'high' && !completed && 'border-l-2 border-l-red-500',
        action.priority !== 'high' && 'border-l-2 border-l-transparent'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
          className="mt-0.5 flex-shrink-0"
        >
          {completed ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <Circle className="w-5 h-5 text-zinc-400 dark:text-zinc-500 hover:text-indigo-400 transition-colors" />
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
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Avatar name={action.contact.name} url={action.contact.avatar_url} size="sm" className="!w-5 !h-5 !text-[8px]" />
                <ContactPreview contactId={action.contact_id}>
                  <Link
                    href={`/contacts/${action.contact_id}`}
                    className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                  >
                    {action.contact.name}
                  </Link>
                </ContactPreview>
              </div>
            )}

            {action.due_date && (
              <span className={cn(
                'flex items-center gap-1 text-xs',
                overdue ? 'text-red-500 dark:text-red-400' : 'text-zinc-400 dark:text-zinc-500'
              )}>
                <Calendar className="w-3 h-3" />
                {formatDateTime(action.due_date)}
                {overdue && <span className="text-[10px]">(逾期)</span>}
              </span>
            )}
          </div>
        </div>

        {/* Status Select */}
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <StatusSelect
            status={action.status}
            onChange={onStatusChange}
          />
        </div>
      </div>
    </div>
  );
}

// -- Main Page --

type SortKey = 'priority' | 'due_date' | 'created_at';

const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function ActionsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [sort, setSort] = useState<SortKey>('priority');

  // Create action dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newActionType, setNewActionType] = useState('followup');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newContactId, setNewContactId] = useState('');

  // Local state for optimistic updates
  const [localActions, setLocalActions] = useState<Action[] | null>(null);

  const { data: fetchedActions, loading, error, refetch } = useAsync<Action[]>(
    () => actionsApi.getActions(),
    []
  );

  const actions = useMemo(() => localActions ?? fetchedActions ?? [], [localActions, fetchedActions]);

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

  const resetCreateForm = useCallback(() => {
    setNewDescription('');
    setNewActionType('followup');
    setNewPriority('medium');
    setNewDueDate('');
    setNewContactId('');
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newDescription.trim() || !newContactId.trim()) return;
    setCreateSubmitting(true);
    try {
      await actionsApi.createAction({
        description: newDescription.trim(),
        action_type: newActionType,
        priority: newPriority,
        due_date: newDueDate || undefined,
        contact_id: newContactId.trim(),
      });
      setCreateOpen(false);
      resetCreateForm();
      setLocalActions(null);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : '建立失敗');
    } finally {
      setCreateSubmitting(false);
    }
  }, [newDescription, newActionType, newPriority, newDueDate, newContactId, resetCreateForm, refetch]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-indigo-400" />
            待辦事項
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            <span className="text-amber-500 dark:text-amber-400 font-medium">{pendingCount}</span> 待處理
            {' \u00B7 '}
            <span className="text-emerald-500 dark:text-emerald-400 font-medium">{completedCount}</span> 已完成
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              新增待辦
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>新增待辦事項</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">描述 *</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="輸入待辦描述..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">類型</label>
                <select
                  value={newActionType}
                  onChange={(e) => setNewActionType(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="quote">報價</option>
                  <option value="visit">參觀</option>
                  <option value="call">通話</option>
                  <option value="sample">寄樣</option>
                  <option value="followup">跟進</option>
                  <option value="measure">丈量</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">優先度</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">到期日</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">客戶 ID *</label>
                <input
                  type="text"
                  value={newContactId}
                  onChange={(e) => setNewContactId(e.target.value)}
                  placeholder="輸入客戶 ID..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreateForm(); }}>
                取消
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createSubmitting || !newDescription.trim() || !newContactId.trim()}
              >
                {createSubmitting ? '建立中...' : '建立'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
          aria-label="篩選狀態"
          className="px-3 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
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
          aria-label="篩選優先度"
          className="px-3 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
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
          aria-label="篩選類型"
          className="px-3 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
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
          aria-label="排序方式"
          className="px-3 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
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
        <div className="text-center py-8">
          <p className="text-red-500 text-sm mb-3">{error}</p>
          <button
            onClick={() => refetch()}
            className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
          >
            重試
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={statusFilter || priorityFilter || typeFilter ? '沒有符合條件的待辦事項' : '目前沒有待辦事項'}
          description={statusFilter || priorityFilter || typeFilter ? '試試調整篩選條件' : '所有工作都完成了！'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onToggleComplete={() => handleToggleComplete(action)}
              onStatusChange={(s) => handleStatusChange(action, s)}
              onClick={() => router.push(`/contacts/${action.contact_id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
