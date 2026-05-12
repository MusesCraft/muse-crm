'use client';

import { StickyNote } from 'lucide-react';

interface Props {
  content: string;
  authorName?: string;
  timestamp?: string;
  mentions?: string[];
}

/**
 * 內部備註訊息泡泡（PRD §F6）。
 * 視覺上以黃底框 + StickyNote 圖示區分。
 */
export function InternalNoteBubble({ content, authorName, timestamp, mentions }: Props) {
  return (
    <div className="my-1.5 max-w-2xl rounded-md bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1 text-[10px] text-yellow-700 dark:text-yellow-400">
        <StickyNote className="w-3 h-3" />
        <span className="font-medium">內部備註</span>
        {authorName && <span>· {authorName}</span>}
        {timestamp && <span>· {timestamp}</span>}
      </div>
      <p className="text-xs text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">{content}</p>
      {mentions && mentions.length > 0 && (
        <p className="mt-1 text-[10px] text-yellow-700 dark:text-yellow-400">
          @{mentions.length} 位被提及
        </p>
      )}
    </div>
  );
}
