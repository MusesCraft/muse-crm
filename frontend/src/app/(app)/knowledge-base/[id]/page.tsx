'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, Trash2 } from 'lucide-react';

interface KbEntry {
  id: string;
  title: string;
  content: string;
  category: string | null;
  source_url: string | null;
  tags: string[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api/v1';

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('muse_token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export default function KbEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const isNew = id === 'new';

  const [entry, setEntry] = useState<KbEntry>({
    id: '',
    title: '',
    content: '',
    category: '',
    source_url: '',
    tags: [],
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/knowledge-base/${id}`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setEntry({ ...data });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const url = isNew ? `${API_BASE}/knowledge-base` : `${API_BASE}/knowledge-base/${id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(entry),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '儲存失敗');
        return;
      }
      router.push('/knowledge-base');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定刪除此知識庫條目？')) return;
    await fetch(`${API_BASE}/knowledge-base/${id}`, { method: 'DELETE', headers: authHeaders() });
    router.push('/knowledge-base');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/knowledge-base" className="inline-flex items-center gap-1 text-sm text-zinc-500 mb-4 hover:text-zinc-700">
        <ArrowLeft className="w-4 h-4" />
        返回知識庫
      </Link>

      <h1 className="text-lg font-semibold mb-4">{isNew ? '新增條目' : '編輯條目'}</h1>

      <div className="space-y-4 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">標題 *</label>
          <input
            value={entry.title}
            onChange={(e) => setEntry({ ...entry, title: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">類別</label>
          <select
            value={entry.category || ''}
            onChange={(e) => setEntry({ ...entry, category: e.target.value || null })}
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm"
          >
            <option value="">未分類</option>
            <option value="product">產品</option>
            <option value="faq">FAQ</option>
            <option value="policy">政策</option>
            <option value="spec">規格</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">內容 *</label>
          <textarea
            rows={10}
            value={entry.content}
            onChange={(e) => setEntry({ ...entry, content: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">來源 URL</label>
          <input
            value={entry.source_url || ''}
            onChange={(e) => setEntry({ ...entry, source_url: e.target.value || null })}
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm"
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center justify-between pt-2">
          {!isNew && (
            <button onClick={handleDelete} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600">
              <Trash2 className="w-3.5 h-3.5" />
              刪除
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !entry.title || !entry.content}
            className="flex items-center gap-1.5 ml-auto px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}
