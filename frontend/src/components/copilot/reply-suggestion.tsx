'use client';

import { Copy } from 'lucide-react';

interface Props {
  text: string;
  confidence?: number;
  onUse?: () => void;
}

export function ReplySuggestion({ text, confidence, onUse }: Props) {
  const handleCopy = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard?.writeText(text);
    }
    onUse?.();
  };

  return (
    <div className="border border-[#DDD6FE] dark:border-purple-500/20 rounded-md p-2 bg-[#F5F3FF] dark:bg-purple-500/10">
      <p className="text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">{text}</p>
      <div className="flex items-center justify-between mt-1.5">
        {confidence !== undefined && (
          <span className="text-[10px] text-zinc-400">信心 {Math.round(confidence * 100)}%</span>
        )}
        <button
          onClick={handleCopy}
          className="ml-auto flex items-center gap-1 text-[10px] text-[#7C3AED] hover:text-[#6D28D9]"
        >
          <Copy className="w-3 h-3" />
          採用
        </button>
      </div>
    </div>
  );
}
