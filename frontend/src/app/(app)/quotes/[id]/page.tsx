'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { quotesApi, type Quote } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { LoadingSpinner } from '@/components/loading';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  Loader2,
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
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', c.color)}>
      {c.label}
    </span>
  );
}

// -- 品相 Badge --

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-xs text-zinc-400 dark:text-zinc-600">&mdash;</span>;
  const config: Record<string, string> = {
    A: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    B: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    C: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    D: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', config[grade] || 'bg-zinc-100 text-zinc-500')}>
      {grade}
    </span>
  );
}

export default function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState('');

  const { data: quote, loading, error, refetch } = useAsync<Quote>(
    () => quotesApi.getQuote(id),
    [id]
  );

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(newStatus);
    try {
      await quotesApi.updateStatus(id, newStatus);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除此報價單？此操作無法復原。')) return;
    setActionLoading('delete');
    try {
      await quotesApi.deleteQuote(id);
      router.push('/quotes');
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) return <LoadingSpinner className="min-h-screen" />;
  if (error) return <div className="p-6 text-red-500">{error}</div>;
  if (!quote) return null;

  const discountAmount = quote.subtotal * (quote.discount_pct / 100);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back */}
      <Link
        href="/quotes"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回報價列表
      </Link>

      {/* Accepted banner */}
      {quote.status === 'accepted' && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              此報價已被客戶接受
            </span>
            {quote.accepted_at && (
              <span className="text-xs text-emerald-500/70 ml-auto">{formatDateTime(quote.accepted_at)}</span>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-6 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{quote.title}</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">{quote.quote_number}</p>
            </div>
          </div>
          <QuoteStatusBadge status={quote.status} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
          <div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">客戶</span>
            {quote.contact_id ? (
              <Link
                href={`/contacts/${quote.contact_id}`}
                className="block text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5"
              >
                {quote.contact_name || '\u2014'}
              </Link>
            ) : (
              <p className="text-zinc-700 dark:text-zinc-200 mt-0.5">{quote.contact_name || '\u2014'}</p>
            )}
          </div>
          <div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">有效期限</span>
            <p className="text-zinc-700 dark:text-zinc-200 mt-0.5">{formatDate(quote.valid_until)}</p>
          </div>
          <div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">建立日期</span>
            <p className="text-zinc-700 dark:text-zinc-200 mt-0.5">{formatDateTime(quote.created_at)}</p>
          </div>
          <div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {quote.sent_at ? '發送日期' : '最後更新'}
            </span>
            <p className="text-zinc-700 dark:text-zinc-200 mt-0.5">
              {formatDateTime(quote.sent_at || quote.updated_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            報價項目
            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-normal ml-2">({quote.item_count} 項)</span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="text-left px-4 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50">描述</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50">尺寸</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50">品相</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50">單價</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50">數量</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50">小計</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => (
                <tr key={item.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="px-4 py-3">
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">{item.description}</span>
                    {item.notes && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{item.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.dimensions || '\u2014'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <GradeBadge grade={item.grade} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">${item.unit_price.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.quantity}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">${item.line_total.toLocaleString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4 mb-4">
        <div className="max-w-xs ml-auto space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">小計</span>
            <span className="text-zinc-700 dark:text-zinc-200">${quote.subtotal.toLocaleString()}</span>
          </div>
          {quote.discount_pct > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">折扣 ({quote.discount_pct}%)</span>
              <span className="text-red-500">-${discountAmount.toLocaleString()}</span>
            </div>
          )}
          {quote.installation_fee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">安裝費用</span>
              <span className="text-zinc-700 dark:text-zinc-200">${quote.installation_fee.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <span className="text-zinc-900 dark:text-white">總計</span>
            <span className="text-indigo-600 dark:text-indigo-400">${quote.total.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {quote.notes && (
        <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-2">備註</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3">
        {quote.status === 'draft' && (
          <>
            <Link
              href={`/quotes/create?edit=${quote.id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 text-sm font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              編輯
            </Link>
            <button
              onClick={() => handleStatusChange('sent')}
              disabled={!!actionLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'sent' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              發送給客戶
            </button>
            <button
              onClick={handleDelete}
              disabled={!!actionLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-500/30 text-red-500 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/5 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              刪除
            </button>
          </>
        )}
        {quote.status === 'sent' && (
          <>
            <button
              onClick={() => handleStatusChange('accepted')}
              disabled={!!actionLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'accepted' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              標記已接受
            </button>
            <button
              onClick={() => handleStatusChange('rejected')}
              disabled={!!actionLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-500/30 text-red-500 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/5 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'rejected' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              標記已拒絕
            </button>
          </>
        )}
      </div>
    </div>
  );
}
