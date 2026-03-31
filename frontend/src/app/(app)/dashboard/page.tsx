'use client';

import Link from 'next/link';
import { dashboardApi, contactsApi, type Contact } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { DashboardSkeleton } from '@/components/skeletons';
import { Avatar } from '@/components/avatar';
import {
  Users,
  MessagesSquare,
  TrendingUp,
  AlertTriangle,
  Activity,
  Mail,
  BarChart3,
  CheckSquare,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function StatCard({
  icon: Icon,
  label,
  value,
  change,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  change?: { value: string; positive: boolean };
  color: string;
}) {
  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {change && (
          <span className={cn(
            'flex items-center gap-0.5 text-xs font-semibold',
            change.positive ? 'text-emerald-500' : 'text-red-500'
          )}>
            {change.value}
            {change.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-3">{value}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</p>
    </div>
  );
}

function UrgencyCard({ data }: { data: { high: number; medium: number; low: number } }) {
  const total = data.high + data.medium + data.low || 1;
  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">緊急度分布</h3>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-zinc-800 mb-3">
        <div className="h-full bg-red-500 rounded-l-full" style={{ width: `${(data.high / total) * 100}%` }} />
        <div className="h-full bg-amber-500" style={{ width: `${(data.medium / total) * 100}%` }} />
        <div className="h-full bg-zinc-300 dark:bg-zinc-600 rounded-r-full" style={{ width: `${(data.low / total) * 100}%` }} />
      </div>
      <div className="flex gap-4">
        {[
          { label: '高', count: data.high, color: 'bg-red-500' },
          { label: '中', count: data.medium, color: 'bg-amber-500' },
          { label: '低', count: data.low, color: 'bg-zinc-300 dark:bg-zinc-600' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={cn('w-2.5 h-2.5 rounded-full', item.color)} />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.label} {item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusCard({ data }: { data: { active: number; silent: number; unanswered: number } }) {
  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">活躍 vs 沉默</h3>
      </div>
      <div className="flex gap-3">
        {[
          { label: '活躍', value: data.active, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
          { label: '沉默', value: data.silent, color: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
          { label: '未回', value: data.unanswered, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
        ].map((item) => (
          <div key={item.label} className={cn('flex-1 text-center p-3 rounded-xl', item.color)}>
            <p className="text-lg font-bold">{item.value}</p>
            <p className="text-[10px] opacity-70">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TodayMessagesCard({ data }: { data: { count: number; yesterdayCount: number } }) {
  const diff = data.count - data.yesterdayCount;
  const pct = data.yesterdayCount > 0 ? Math.round((diff / data.yesterdayCount) * 100) : 0;
  const isUp = diff >= 0;

  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">今日新訊息</h3>
      </div>
      <div className="flex items-end gap-2">
        <p className="text-3xl font-bold text-zinc-900 dark:text-white">{data.count}</p>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">則</span>
      </div>
      <p className={cn('text-xs mt-1 font-medium', isUp ? 'text-emerald-500' : 'text-red-500')}>
        {isUp ? '↑' : '↓'} {Math.abs(pct)}% 對比昨天
      </p>
    </div>
  );
}

function SourceCard({ data }: { data: { organic: number; ad: number; referral: number } }) {
  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-purple-400" />
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">來源分析</h3>
      </div>
      <div className="space-y-3">
        {[
          { label: '自然流量', value: data.organic, total: data.organic + data.ad + data.referral, color: 'bg-indigo-500' },
          { label: '廣告', value: data.ad, total: data.organic + data.ad + data.referral, color: 'bg-purple-500' },
          { label: '推薦', value: data.referral, total: data.organic + data.ad + data.referral, color: 'bg-cyan-500' },
        ].map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.label}</span>
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{item.value}</span>
            </div>
            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', item.color)} style={{ width: `${(item.value / (item.total || 1)) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentCustomersCard({ contacts = [] }: { contacts?: Contact[] }) {
  const recentContacts = contacts.slice(0, 4);
  const statusLabels: Record<string, { label: string; color: string }> = {
    high: { label: '活躍', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
    medium: { label: '洽談中', color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' },
    low: { label: '成交', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' },
  };

  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5 col-span-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">最近客戶</h3>
        <Link href="/contacts" className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 font-medium">
          查看全部 →
        </Link>
      </div>
      <div className="space-y-3">
        {recentContacts.map((contact) => {
          const status = statusLabels[contact.priority || 'low'];
          return (
            <Link
              key={contact.id}
              href={`/contacts/${contact.id}`}
              className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <Avatar name={contact.name} url={contact.avatar_url} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{contact.name}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{contact.display_name}</p>
              </div>
              <span className={cn('text-[10px] font-medium rounded-full px-2.5 py-1', status.color)}>
                {status.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats, loading: loadingStats, error: statsError, refetch: refetchStats } = useAsync(
    () => dashboardApi.getStats(),
    []
  );

  const { data: contactsRes } = useAsync(
    () => contactsApi.getContacts({ per_page: 4 }),
    []
  );

  if (loadingStats) return <div className="p-6 max-w-7xl mx-auto"><DashboardSkeleton /></div>;

  if (statsError) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center py-8">
        <p className="text-red-500 text-sm mb-3">{statsError}</p>
        <button
          onClick={() => refetchStats()}
          className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
        >
          重試
        </button>
      </div>
    </div>
  );

  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const defaultUrgency = { high: 0, medium: 0, low: 0 };
  const defaultStatus = { active: 0, silent: 0, unanswered: 0 };
  const defaultToday = { count: 0, yesterdayCount: 0 };
  const defaultSource = { organic: 0, ad: 0, referral: 0 };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{dateStr}</p>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
          歡迎回來 👋
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">以下是您今天的業務總覽</p>
      </div>

      {/* Top stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Users} label="總客戶數" value={stats.total_contacts} color="bg-indigo-500" />
          <StatCard icon={TrendingUp} label="總對話數" value={stats.total_conversations} color="bg-emerald-500" />
          <StatCard icon={CheckSquare} label="待辦事項" value={stats.pending_actions} color="bg-amber-500" />
          <StatCard icon={MessagesSquare} label="活躍案件" value={stats.active_conversations} color="bg-indigo-500" />
        </div>
      )}

      {/* Detail cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <UrgencyCard data={stats.urgency_distribution || defaultUrgency} />
          <StatusCard data={stats.status_distribution || defaultStatus} />
          <TodayMessagesCard data={stats.today_messages || defaultToday} />
          <SourceCard data={stats.source_analysis || defaultSource} />
        </div>
      )}

      {/* Recent customers */}
      <RecentCustomersCard contacts={contactsRes?.data} />
    </div>
  );
}
