'use client';

import { dashboardApi, type DashboardStats, type ChannelDistribution } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { LoadingSpinner } from '@/components/loading';
import {
  Users,
  MessageSquare,
  MessagesSquare,
  ListTodo,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-5">
      <div className="flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-zinc-500">{label}</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ChannelBar({
  distributions,
}: {
  distributions: ChannelDistribution[];
}) {
  const total = distributions.reduce((sum, d) => sum + d.count, 0) || 1;
  const colors: Record<string, string> = {
    messenger: 'bg-[#0084FF]',
    instagram: 'bg-[#E1306C]',
    line: 'bg-[#06C755]',
  };
  const labels: Record<string, string> = {
    messenger: 'Messenger',
    instagram: 'Instagram',
    line: 'LINE',
  };

  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-5">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-4">渠道分布</h3>

      {/* Bar */}
      <div className="h-4 rounded-full overflow-hidden flex bg-zinc-200 dark:bg-zinc-800 mb-4">
        {distributions.map((d) => (
          <div
            key={d.channel}
            className={cn('h-full transition-all', colors[d.channel] || 'bg-zinc-400 dark:bg-zinc-600')}
            style={{ width: `${(d.count / total) * 100}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {distributions.map((d) => (
          <div key={d.channel} className="flex items-center gap-2">
            <div className={cn('w-3 h-3 rounded-full', colors[d.channel] || 'bg-zinc-400 dark:bg-zinc-600')} />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {labels[d.channel] || d.channel}: {d.count} ({Math.round((d.count / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats, loading: loadingStats } = useAsync<DashboardStats>(
    () => dashboardApi.getStats(),
    []
  );

  const { data: channels, loading: loadingChannels } = useAsync<ChannelDistribution[]>(
    () => dashboardApi.getChannelDistribution(),
    []
  );

  if (loadingStats || loadingChannels) return <LoadingSpinner className="min-h-screen" />;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          儀表板
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">系統總覽與統計數據</p>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Users} label="總客戶數" value={stats.total_contacts} color="bg-blue-500" />
          <StatCard icon={MessagesSquare} label="總對話數" value={stats.total_conversations} color="bg-emerald-500" />
          <StatCard icon={MessageSquare} label="進行中對話" value={stats.active_conversations} color="bg-amber-500" />
          <StatCard icon={ListTodo} label="待辦事項" value={stats.pending_actions} color="bg-purple-500" />
        </div>
      )}

      {/* Channel distribution */}
      {channels && channels.length > 0 && <ChannelBar distributions={channels} />}
    </div>
  );
}
