'use client';

import { BookOpen } from 'lucide-react';

interface Props {
  title: string;
  excerpt: string;
  category?: string | null;
}

export function KbCard({ title, excerpt, category }: Props) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate flex items-center gap-1">
          <BookOpen className="w-3 h-3 text-indigo-500" />
          {title}
        </h4>
        {category && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600">
            {category}
          </span>
        )}
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">{excerpt}</p>
    </div>
  );
}
