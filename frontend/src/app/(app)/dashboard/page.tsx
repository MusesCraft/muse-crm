'use client';

import Link from 'next/link';
import { dashboardApi, contactsApi, type Contact, type DashboardStats } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { DashboardSkeleton } from '@/components/skeletons';
import { Avatar } from '@/components/avatar';
import {
  Users,
  MessagesSquare,
  TrendingUp,
  CheckSquare,
  Mail,
  ArrowUpRight,
  ArrowDownRight,
  MessageCircle,
  Instagram,
  Phone,
  Globe,
  UserCheck,
  UserPlus,
  ShoppingCart,
  Eye,
  Target,
  Award,
  XCircle,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Stat Card ─────────────────────────────────────────

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
      <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-3">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</p>
    </div>
  );
}

// ── Channel Distribution ──────────────────────────────

const channelConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  messenger: { label: 'Messenger', color: 'bg-blue-500', icon: MessageCircle },
  instagram: { label: 'Instagram', color: 'bg-pink-500', icon: Instagram },
  line: { label: 'LINE', color: 'bg-emerald-500', icon: Phone },
  referral: { label: '轉介', color: 'bg-amber-500', icon: Users },
  other: { label: '其他', color: 'bg-zinc-400', icon: Globe },
};

function ChannelCard({ data }: { data: { channel: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-4 flex items-center gap-2">
        <Globe className="w-4 h-4 text-blue-400" />
        渠道分布
      </h3>
      {/* Bar */}
      <div className="h-3 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-zinc-800 mb-3">
        {data.map((d) => {
          const cfg = channelConfig[d.channel] || channelConfig.other;
          const pct = (d.count / total) * 100;
          return pct > 0 ? (
            <div key={d.channel} className={cn('h-full', cfg.color)} style={{ width: `${pct}%` }} title={`${cfg.label}: ${d.count}`} />
          ) : null;
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d) => {
          const cfg = channelConfig[d.channel] || channelConfig.other;
          return (
            <div key={d.channel} className="flex items-center gap-1.5">
              <div className={cn('w-2.5 h-2.5 rounded-full', cfg.color)} />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {cfg.label} <span className="font-medium text-zinc-700 dark:text-zinc-200">{d.count.toLocaleString()}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Contact Status ────────────────────────────────────

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  following_up: { label: '跟進中', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', icon: UserCheck },
  new: { label: '新客戶', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', icon: UserPlus },
  quoted: { label: '已報價', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', icon: FileText },
  won: { label: '已成交', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400', icon: Award },
  lost: { label: '已流失', color: 'bg-red-500/10 text-red-600 dark:text-red-400', icon: XCircle },
};

function ContactStatusCard({ data }: { data: Record<string, number> }) {
  const order = ['following_up', 'new', 'quoted', 'won', 'lost'];
  const entries = order
    .filter((k) => data[k] !== undefined && data[k] > 0)
    .map((k) => ({ key: k, count: data[k], ...(statusConfig[k] || statusConfig.new) }));

  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-4 flex items-center gap-2">
        <UserCheck className="w-4 h-4 text-blue-400" />
        客戶跟進狀態
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {entries.map((e) => (
          <div key={e.key} className={cn('text-center p-2.5 rounded-xl', e.color)}>
            <p className="text-lg font-bold">{e.count.toLocaleString()}</p>
            <p className="text-[10px] opacity-70">{e.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Intent Distribution ───────────────────────────────

const intentConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  browsing: { label: '瀏覽中', color: 'bg-zinc-400', icon: Eye },
  interested: { label: '有興趣', color: 'bg-amber-500', icon: Target },
  ready_to_buy: { label: '準備購買', color: 'bg-emerald-500', icon: ShoppingCart },
  purchased: { label: '已購買', color: 'bg-indigo-500', icon: Award },
};

function IntentCard({ data }: { data: Record<string, number> }) {
  const order = ['browsing', 'interested', 'ready_to_buy', 'purchased'];
  const total = order.reduce((s, k) => s + (data[k] || 0), 0) || 1;

  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-4 flex items-center gap-2">
        <Target className="w-4 h-4 text-amber-400" />
        購買意向
      </h3>
      <div className="space-y-2.5">
        {order.map((key) => {
          const count = data[key] || 0;
          if (count === 0) return null;
          const cfg = intentConfig[key] || intentConfig.browsing;
          const pct = (count / total) * 100;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{cfg.label}</span>
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{count.toLocaleString()} <span className="text-zinc-400 font-normal">({pct.toFixed(1)}%)</span></span>
              </div>
              <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', cfg.color)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Today Messages ────────────────────────────────────

function TodayMessagesCard({ data }: { data: { count: number; yesterdayCount: number } }) {
  const diff = data.count - data.yesterdayCount;
  const pct = data.yesterdayCount > 0 ? Math.round((diff / data.yesterdayCount) * 100) : 0;
  const isUp = diff >= 0;

  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-4 flex items-center gap-2">
        <Mail className="w-4 h-4 text-indigo-400" />
        今日新訊息
      </h3>
      <div className="flex items-end gap-2">
        <p className="text-3xl font-bold text-zinc-900 dark:text-white">{data.count}</p>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">則</span>
      </div>
      {data.yesterdayCount > 0 && (
        <p className={cn('text-xs mt-1 font-medium', isUp ? 'text-emerald-500' : 'text-red-500')}>
          {isUp ? '↑' : '↓'} {Math.abs(pct)}% 對比昨天（{data.yesterdayCount} 則）
        </p>
      )}
    </div>
  );
}

// ── Recent Customers ──────────────────────────────────

function RecentCustomersCard({ contacts = [] }: { contacts?: Contact[] }) {
  const recentContacts = contacts.slice(0, 5);

  const contactStatusLabels: Record<string, { label: string; color: string }> = {
    following_up: { label: '跟進中', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
    new: { label: '新客戶', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
    quoted: { label: '已報價', color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' },
    won: { label: '已成交', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' },
    lost: { label: '已流失', color: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' },
  };

  if (recentContacts.length === 0) return null;

  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5 col-span-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">最近客戶</h3>
        <Link href="/contacts" className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 font-medium">
          查看全部 →
        </Link>
      </div>
      <div className="space-y-2">
        {recentContacts.map((contact) => {
          const st = contactStatusLabels[contact.contact_status || ''] || contactStatusLabels.new;
          return (
            <Link
              key={contact.id}
              href={`/contacts/${contact.id}`}
              className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <Avatar name={contact.display_name || contact.name} url={contact.avatar_url} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{contact.display_name || contact.name}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                  {contact.source_channel && <span className="capitalize">{contact.source_channel}</span>}
                  {contact.phone && <span className="ml-2">{contact.phone}</span>}
                </p>
              </div>
              <span className={cn('text-[10px] font-medium rounded-full px-2.5 py-1 flex-shrink-0', st.color)}>
                {st.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Dashboard Page ───────────────────────────────

export default function DashboardPage() {
  const { data: stats, loading: loadingStats, error: statsError, refetch: refetchStats } = useAsync<DashboardStats>(
    () => dashboardApi.getStats(),
    []
  );

  const { data: contactsRes } = useAsync(
    () => contactsApi.getContacts({ per_page: 5 }),
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

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{dateStr}</p>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">業務總覽</h1>
      </div>

      {/* Row 1: Key metrics */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <StatCard icon={Users} label="總客戶數" value={stats.total_contacts} color="bg-indigo-500" />
          <StatCard icon={MessagesSquare} label="總訊息數" value={stats.total_messages} color="bg-emerald-500" />
          <StatCard icon={TrendingUp} label="對話數" value={stats.total_conversations} color="bg-blue-500" />
          <StatCard icon={CheckSquare} label="待辦事項" value={stats.pending_actions} color="bg-amber-500" />
        </div>
      )}

      {/* Row 2: Distributions */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-6">
          {stats.channel_distribution && stats.channel_distribution.length > 0 && (
            <ChannelCard data={stats.channel_distribution} />
          )}
          {stats.contact_status && Object.keys(stats.contact_status).length > 0 && (
            <ContactStatusCard data={stats.contact_status} />
          )}
          {stats.intent_distribution && Object.keys(stats.intent_distribution).length > 0 && (
            <IntentCard data={stats.intent_distribution} />
          )}
          <TodayMessagesCard data={stats.today_messages || { count: 0, yesterdayCount: 0 }} />
        </div>
      )}

      {/* Row 3: Recent customers */}
      <RecentCustomersCard contacts={contactsRes?.data} />
    </div>
  );
}
