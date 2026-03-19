'use client';

import { dashboardApi, type DashboardStats } from '@/lib/api';
import {
  mockUrgencyDistribution,
  mockStatusDistribution,
  mockTodayMessages,
  mockSourceAnalysis,
} from '@/lib/mock-data';
import { useAsync } from '@/lib/hooks';
import { LoadingSpinner } from '@/components/loading';
import {
  Users,
  MessagesSquare,
  TrendingUp,
  AlertTriangle,
  Activity,
  Mail,
  BarChart3,
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

function UrgencyCard({ data }: { data: { high: number; medium: number; low: number } }) {
  const total = data.high + data.medium + data.low || 1;
  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">緊急度分布</h3>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex bg-zinc-200 dark:bg-zinc-800 mb-3">
        <div className="h-full bg-red-500" style={{ width: `${(data.high / total) * 100}%` }} />
        <div className="h-full bg-orange-500" style={{ width: `${(data.medium / total) * 100}%` }} />
        <div className="h-full bg-zinc-400 dark:bg-zinc-600" style={{ width: `${(data.low / total) * 100}%` }} />
      </div>
      <div className="flex gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">高 {data.high}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">中 {data.medium}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-400 dark:bg-zinc-600" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">低 {data.low}</span>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ data }: { data: { active: number; silent: number; unanswered: number } }) {
  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">活躍 vs 沉默</h3>
      </div>
      <div className="flex gap-3">
        <div className="flex-1 text-center p-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/5">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{data.active}</p>
          <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">活躍</p>
        </div>
        <div className="flex-1 text-center p-2 rounded-lg bg-zinc-500/10 dark:bg-zinc-500/5">
          <p className="text-lg font-bold text-zinc-500 dark:text-zinc-400">{data.silent}</p>
          <p className="text-[10px] text-zinc-500/70 dark:text-zinc-400/70">沉默</p>
        </div>
        <div className="flex-1 text-center p-2 rounded-lg bg-orange-500/10 dark:bg-orange-500/5">
          <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{data.unanswered}</p>
          <p className="text-[10px] text-orange-600/70 dark:text-orange-400/70">未回</p>
        </div>
      </div>
    </div>
  );
}

function TodayMessagesCard({ data }: { data: { count: number; yesterdayCount: number } }) {
  const diff = data.count - data.yesterdayCount;
  const pct = data.yesterdayCount > 0 ? Math.round((diff / data.yesterdayCount) * 100) : 0;
  const isUp = diff >= 0;

  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <Mail className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">今日新訊息</h3>
      </div>
      <div className="flex items-end gap-2">
        <p className="text-3xl font-bold text-zinc-900 dark:text-white">{data.count}</p>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">則</span>
      </div>
      <p className={cn('text-xs mt-1', isUp ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
        {isUp ? '↑' : '↓'} {Math.abs(pct)}% 對比昨天
      </p>
    </div>
  );
}

function SourceCard({ data }: { data: { organic: number; ad: number; referral: number } }) {
  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-purple-400" />
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">來源分析</h3>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">自然流量</span>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{data.organic}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">廣告</span>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{data.ad}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">推薦</span>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{data.referral}</span>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats, loading: loadingStats } = useAsync<DashboardStats>(
    () => dashboardApi.getStats(),
    []
  );

  if (loadingStats) return <LoadingSpinner className="min-h-screen" />;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          儀表板
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">系統總覽與統計數據</p>
      </div>

      {/* Top stats: total contacts + total conversations */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <StatCard icon={Users} label="總客戶數" value={stats.total_contacts} color="bg-blue-500" />
          <StatCard icon={MessagesSquare} label="總對話數" value={stats.total_conversations} color="bg-emerald-500" />
        </div>
      )}

      {/* New 4-card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <UrgencyCard data={mockUrgencyDistribution} />
        <StatusCard data={mockStatusDistribution} />
        <TodayMessagesCard data={mockTodayMessages} />
        <SourceCard data={mockSourceAnalysis} />
      </div>
    </div>
  );
}
