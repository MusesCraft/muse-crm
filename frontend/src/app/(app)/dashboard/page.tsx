'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  dashboardApi,
  type DashboardStats,
  type FirstResponseTime,
  type ResolutionRate,
  type EscalationRate,
  type ActivityPoint,
} from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { DashboardSkeleton } from '@/components/skeletons';
import {
  MessagesSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Globe,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── KPI Card ─────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  trendLabel,
  color,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down' | null;
  trendLabel?: string;
  color: string;
  href?: string;
}) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : null;
  const trendColor = trend === 'up'
    ? 'text-emerald-500'
    : trend === 'down'
      ? 'text-red-500'
      : 'text-zinc-400';

  const body = (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5 hover:shadow-md transition-shadow h-full">
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white tabular-nums">{value}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
          {sub && <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
          {TrendIcon && trendLabel && (
            <p className={cn('text-[11px] mt-1 font-medium flex items-center gap-0.5', trendColor)}>
              <TrendIcon className="w-3 h-3" />
              {trendLabel}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

// ── Activity Chart ───────────────────────────────────

function ActivityChart({ data }: { data: ActivityPoint[] }) {
  // 補齊 30 天
  const days = useMemo(() => {
    const today = new Date();
    const dataMap = new Map(data.map((d) => [d.date, d.conversations]));
    const out: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      out.push({ date: key, count: dataMap.get(key) ?? 0 });
    }
    return out;
  }, [data]);

  const max = Math.max(...days.map((d) => d.count), 1);
  const total = days.reduce((s, d) => s + d.count, 0);

  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          對話流入趨勢（30 天）
        </h3>
        <span className="text-xs text-zinc-400">共 {total} 個對話</span>
      </div>
      <div className="flex items-end gap-[3px] h-24">
        {days.map((d) => {
          const h = (d.count / max) * 100;
          return (
            <div key={d.date} className="flex-1 min-w-0 group relative">
              <div
                className={cn(
                  'w-full rounded-t-sm transition-colors',
                  d.count > 0
                    ? 'bg-indigo-400 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400'
                    : 'bg-zinc-100 dark:bg-zinc-800'
                )}
                style={{ height: `${Math.max(h, 2)}%` }}
              />
              {d.count > 0 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                  <div className="bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-800 text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
                    {d.date.slice(5)} : {d.count}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-zinc-400">{days[0]?.date.slice(5)}</span>
        <span className="text-[10px] text-zinc-400">今天</span>
      </div>
    </div>
  );
}

// ── Channel Distribution ────────────────────────────

const channelConfig: Record<string, { label: string; color: string }> = {
  messenger: { label: 'Messenger', color: 'bg-blue-500' },
  instagram: { label: 'Instagram', color: 'bg-pink-500' },
  line: { label: 'LINE', color: 'bg-emerald-500' },
  walk_in: { label: '門市', color: 'bg-amber-500' },
  phone: { label: '電話', color: 'bg-purple-500' },
  referral: { label: '轉介', color: 'bg-cyan-500' },
  exhibition: { label: '展覽', color: 'bg-rose-500' },
  other: { label: '其他', color: 'bg-zinc-400' },
};

function ChannelCard({ data }: { data: { channel: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-4 flex items-center gap-2">
        <Globe className="w-4 h-4 text-blue-400" />
        渠道分佈
      </h3>
      <div className="h-3 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-zinc-800 mb-3">
        {data.map((d) => {
          const cfg = channelConfig[d.channel] || channelConfig.other;
          const pct = (d.count / total) * 100;
          return pct > 0 ? (
            <div key={d.channel} className={cn('h-full', cfg.color)} style={{ width: `${pct}%` }} />
          ) : null;
        })}
      </div>
      <div className="space-y-1.5">
        {data.map((d) => {
          const cfg = channelConfig[d.channel] || channelConfig.other;
          const pct = ((d.count / total) * 100).toFixed(1);
          return (
            <div key={d.channel} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn('w-2.5 h-2.5 rounded-full', cfg.color)} />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{cfg.label}</span>
              </div>
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {d.count.toLocaleString()} <span className="text-zinc-400">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Conversation Status Distribution ─────────────────

const statusOrder: { key: string; label: string; color: string }[] = [
  { key: 'unassigned', label: '待認領', color: 'bg-amber-500' },
  { key: 'active', label: '活躍', color: 'bg-emerald-500' },
  { key: 'waiting_customer', label: '等待客戶', color: 'bg-sky-500' },
  { key: 'escalated', label: '已求援', color: 'bg-red-500' },
  { key: 'supervisor_taken', label: '主管接管', color: 'bg-purple-500' },
  { key: 'resolved', label: '已解決', color: 'bg-indigo-500' },
  { key: 'closed', label: '已關閉', color: 'bg-zinc-400' },
];

function ConversationStatusBar({ data }: { data: Record<string, number> }) {
  const entries = statusOrder.map((s) => ({ ...s, count: data[s.key] || 0 }));
  const total = entries.reduce((s, e) => s + e.count, 0) || 1;
  const openCount = ['unassigned', 'active', 'waiting_customer', 'escalated', 'supervisor_taken']
    .reduce((s, k) => s + (data[k] || 0), 0);

  return (
    <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
          <MessagesSquare className="w-4 h-4 text-emerald-400" />
          對話狀態分佈
        </h3>
        <span className="text-xs text-zinc-400">開放中 {openCount} / 全部 {total}</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-zinc-800 mb-3">
        {entries.map((e) => {
          const pct = (e.count / total) * 100;
          return pct > 0 ? (
            <div key={e.key} className={cn('h-full', e.color)} style={{ width: `${pct}%` }} title={`${e.label}: ${e.count}`} />
          ) : null;
        })}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
        {entries.map((e) => (
          <Link
            key={e.key}
            href={`/inbox?status=${e.key}`}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className={cn('w-2 h-2 rounded-full', e.color)} />
            <span className="text-zinc-500 dark:text-zinc-400">{e.label}</span>
            <span className="ml-auto font-medium text-zinc-700 dark:text-zinc-200">{e.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────

function formatMinutes(m: number | null): string {
  if (m == null) return '--';
  if (m < 1) return '< 1 分';
  if (m < 60) return `${Math.round(m)} 分`;
  return `${(m / 60).toFixed(1)} 小時`;
}

function formatPercent(rate: number | null | undefined): string {
  if (rate == null) return '--';
  return `${(rate * 100).toFixed(1)}%`;
}

// ── Main Dashboard ───────────────────────────────────

export default function DashboardPage() {
  const { data: stats, loading: statsLoading, error: statsError, refetch } = useAsync<DashboardStats>(
    () => dashboardApi.getStats(),
    []
  );
  const { data: frt } = useAsync<FirstResponseTime>(() => dashboardApi.getFirstResponseTime(), []);
  const { data: resolution } = useAsync<ResolutionRate>(() => dashboardApi.getResolutionRate(30), []);
  const { data: escalation } = useAsync<EscalationRate>(() => dashboardApi.getEscalationRate(30), []);
  const { data: today } = useAsync(() => dashboardApi.getTodayConversations(), []);
  const { data: convStatus } = useAsync(() => dashboardApi.getConversationStatus(), []);
  const { data: activity } = useAsync<ActivityPoint[]>(() => dashboardApi.getActivity(30), []);

  if (statsLoading) return <div className="p-4 md:p-6 max-w-7xl mx-auto"><DashboardSkeleton /></div>;

  if (statsError) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center py-8">
        <p className="text-red-500 text-sm mb-3">{statsError}</p>
        <button onClick={() => refetch()} className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors">
          重試
        </button>
      </div>
    </div>
  );

  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  // 計算今日對話 vs 昨日的趨勢
  const todayDiff = today ? today.today - today.yesterday : 0;
  const todayPct = today && today.yesterday > 0
    ? Math.abs(Math.round((todayDiff / today.yesterday) * 100))
    : null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{dateStr}</p>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">主管儀表板</h1>
      </div>

      {/* Row 1：主管最關心的四張 KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          icon={MessagesSquare}
          label="今日新對話"
          value={today ? String(today.today) : '--'}
          sub={today ? `昨日 ${today.yesterday}` : undefined}
          trend={todayDiff === 0 ? null : todayDiff > 0 ? 'up' : 'down'}
          trendLabel={todayPct != null ? `${todayPct}%` : undefined}
          color="bg-indigo-500"
          href="/inbox"
        />
        <KpiCard
          icon={Clock}
          label="首次回覆時間"
          value={frt ? formatMinutes(frt.p50_minutes) : '--'}
          sub={frt ? `P90 ${formatMinutes(frt.p90_minutes)}（樣本 ${frt.sample_count}）` : undefined}
          color="bg-amber-500"
        />
        <KpiCard
          icon={CheckCircle2}
          label="解決率（30 天）"
          value={resolution ? formatPercent(resolution.resolution_rate) : '--'}
          sub={resolution ? `${resolution.resolved} / ${resolution.total}` : undefined}
          color="bg-emerald-500"
        />
        <KpiCard
          icon={AlertTriangle}
          label="求援率（30 天）"
          value={escalation ? formatPercent(escalation.escalation_rate) : '--'}
          sub={escalation ? `${escalation.escalated} / ${escalation.total} 已升級` : undefined}
          color="bg-red-500"
        />
      </div>

      {/* Row 2：對話狀態分佈 */}
      {convStatus && (
        <ConversationStatusBar data={convStatus} />
      )}

      {/* Row 3：對話流入趨勢 + 渠道分佈 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <div className="lg:col-span-2">
          <ActivityChart data={activity || []} />
        </div>
        {stats?.channel_distribution && stats.channel_distribution.length > 0 ? (
          <ChannelCard data={stats.channel_distribution} />
        ) : (
          <div className="bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-5 text-xs text-zinc-400">
            尚無渠道資料
          </div>
        )}
      </div>

      {/* Row 4：總量摘要（提供脈絡） */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={TrendingUp}
          label="總對話數"
          value={stats?.total_conversations.toLocaleString() ?? '--'}
          sub={`${stats?.active_conversations ?? 0} 活躍中`}
          color="bg-blue-500"
        />
        <KpiCard
          icon={MessagesSquare}
          label="總訊息數"
          value={stats?.total_messages.toLocaleString() ?? '--'}
          color="bg-purple-500"
        />
        <KpiCard
          icon={CheckCircle2}
          label="待辦事項"
          value={stats?.pending_actions.toLocaleString() ?? '--'}
          color="bg-amber-500"
          href="/actions"
        />
        <KpiCard
          icon={Clock}
          label="平均回覆時間"
          value={stats?.avg_response_hours != null ? `${stats.avg_response_hours}h` : '--'}
          color="bg-cyan-500"
        />
      </div>
    </div>
  );
}
