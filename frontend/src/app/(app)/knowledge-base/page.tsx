'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { BookOpen, Plus, Search, Loader2 } from 'lucide-react';

// 後端 KB API 在 PR-5 已實裝；type 為避免 build 失敗，本檔內部定義
interface KbEntry {
  id: string;
  title: string;
  content: string;
  category: string | null;
  source_url: string | null;
  tags: string[];
  updated_at: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api/v1';

async function fetchKb(q: string): Promise<KbEntry[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('muse_token') : null;
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  const res = await fetch(`${API_BASE}/knowledge-base?${qs.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

export default function KnowledgeBasePage() {
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchKb(q);
      setEntries(items);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            知識庫
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">產品 FAQ、規格表，供 AI Copilot 檢索</p>
        </div>
        <Link
          href="/knowledge-base/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600"
        >
          <Plus className="w-4 h-4" />
          新增
        </Link>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋標題或內容..."
          className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="bg-white border border-zinc-200 dark:bg-zinc-950/50 dark:border-zinc-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-sm text-zinc-400">沒有資料</div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {entries.map((kb) => (
              <li key={kb.id}>
                <Link
                  href={`/knowledge-base/${kb.id}`}
                  className="block px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{kb.title}</h3>
                    {kb.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                        {kb.category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 truncate">
                    {kb.content.slice(0, 120)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
