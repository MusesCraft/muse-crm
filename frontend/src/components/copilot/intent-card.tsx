'use client';

interface Props {
  intent?: string;
  identity?: string;
  sentiment?: string;
  urgency?: string;
}

function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'blue' | 'orange' | 'red' | 'green' | 'purple' }) {
  const tones = {
    neutral: 'bg-zinc-100 text-[#6B7280] border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    blue: 'bg-blue-50 text-[#2563EB] border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20',
    orange: 'bg-[#FEF3C7] text-[#92400E] border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
    red: 'bg-red-50 text-[#DC2626] border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20',
    green: 'bg-green-50 text-[#16A34A] border-green-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
    purple: 'bg-[#F5F3FF] text-[#7C3AED] border-[#DDD6FE] dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {label}
    </span>
  );
}

export function IntentCard({ intent, identity, sentiment, urgency }: Props) {
  const urgencyTone = urgency === 'high' ? 'red' : urgency === 'medium' ? 'orange' : 'neutral';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#E5E7EB] dark:border-zinc-800 rounded-lg p-3 space-y-2">
      <h4 className="text-[10px] uppercase tracking-wider text-[#6B7280] dark:text-zinc-400">意圖與身分</h4>
      <div className="flex flex-wrap gap-1.5">
        <Badge label={`意圖：${intent || '待判讀'}`} tone="blue" />
        <Badge label={`身分：${identity || '未分類'}`} tone="neutral" />
        {urgency && <Badge label={`急迫度：${urgency}`} tone={urgencyTone} />}
        {sentiment && <Badge label={`情緒：${sentiment}`} tone="purple" />}
      </div>
    </div>
  );
}
