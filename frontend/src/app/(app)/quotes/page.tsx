'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { quotesApi, type Quote, type PaginatedResponse } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { LoadingSpinner, EmptyState } from '@/components/loading';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
} from 'lucide-react';

// -- 狀態 Badge --

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20' },
  sent: { label: '已發送', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  accepted: { label: '已接受', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  rejected: { label: '已拒絕', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
  expired: { label: '已過期', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
};

function QuoteStatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', c.color)}>
      {c.label}
    </span>
  );
}

export default function QuotesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { data, loading, error, refetch } = useAsync<PaginatedResponse<Quote>>(
    () =>
      quotesApi.getQuotes({
        page,
        per_page: 20,
        search: search || undefined,
        status: status || undefined,
      }),
    [page, search, status]
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">報價管理</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">建立與管理客戶報價單</p>
        </div>
        <Link
          href="/quotes/create"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增報價
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="搜尋報價編號、客戶或標題..."
            aria-label="搜尋報價"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          aria-label="篩選狀態"
          className="px-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">全部狀態</option>
          <option value="draft">草稿</option>
          <option value="sent">已發送</option>
          <option value="accepted">已接受</option>
          <option value="rejected">已拒絕</option>
          <option value="expired">已過期</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg overflow-hidden">
        {loading && !data ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500 text-sm mb-3">{error}</p>
            <button
              onClick={() => refetch()}
              className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
            >
              重試
            </button>
          </div>
        ) : !data || data.data.length === 0 ? (
          <EmptyState icon={FileText} title="沒有報價單" description="目前沒有符合條件的報價單" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                    報價編號
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                    客戶
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                    標題
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                    狀態
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                    金額
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                    有效期
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                    建立日期
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((quote) => (
                  <tr
                    key={quote.id}
                    onClick={() => router.push(`/quotes/${quote.id}`)}
                    className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{quote.quote_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-zinc-700 dark:text-zinc-200">{quote.contact_name || '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-zinc-700 dark:text-zinc-200">{quote.title}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <QuoteStatusBadge status={quote.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        ${quote.total.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(quote.valid_until)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDateTime(quote.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-500">共 {data.pagination.total} 筆報價</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4 text-zinc-400" />
              </button>
              <span className="text-xs text-zinc-400 px-2">
                {page} / {data.pagination.pages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= data.pagination.pages}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
