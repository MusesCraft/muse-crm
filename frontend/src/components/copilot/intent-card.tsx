'use client';

interface Props {
  intent?: string;
  identity?: string;
  sentiment?: string;
  urgency?: string;
}

export function IntentCard({ intent, identity, sentiment, urgency }: Props) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 space-y-1">
      <h4 className="text-[10px] uppercase tracking-wider text-zinc-400">客戶意圖</h4>
      <div className="text-xs space-y-0.5">
        <p><span className="text-zinc-500">意圖：</span><span className="text-zinc-700 dark:text-zinc-200">{intent || '—'}</span></p>
        <p><span className="text-zinc-500">身份：</span><span className="text-zinc-700 dark:text-zinc-200">{identity || '—'}</span></p>
        {sentiment && <p><span className="text-zinc-500">情緒：</span><span>{sentiment}</span></p>}
        {urgency && <p><span className="text-zinc-500">緊急度：</span><span>{urgency}</span></p>}
      </div>
    </div>
  );
}
