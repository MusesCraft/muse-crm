'use client';

interface Props {
  summary?: string;
}

export function SummaryCard({ summary }: Props) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
      <h4 className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">對話摘要</h4>
      <p className="text-xs text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
        {summary || '尚無摘要'}
      </p>
    </div>
  );
}
