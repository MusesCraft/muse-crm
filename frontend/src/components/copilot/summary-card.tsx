'use client';

interface Props {
  summary?: string;
}

export function SummaryCard({ summary }: Props) {
  return (
    <div className="bg-[#F5F3FF] dark:bg-purple-500/10 border border-[#DDD6FE] dark:border-purple-500/20 rounded-lg p-3">
      <h4 className="text-[10px] uppercase tracking-wider text-[#7C3AED] dark:text-purple-300 mb-1">AI 摘要</h4>
      <p className="text-xs text-[#312E81] dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
        {summary || '尚無摘要'}
      </p>
    </div>
  );
}
