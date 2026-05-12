'use client';

import Link from 'next/link';
import { Search, ChevronLeft, ChevronRight, AlertTriangle, Eye } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { ChannelIcon } from '@/components/channel-icon';
import { UrgencyBadgeCompact as UrgencyBadge } from '@/components/badges';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/loading';
import { ConversationListSkeleton } from '@/components/skeletons';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/lib/api';
import { Inbox } from 'lucide-react';

function truncate(str: string | null | undefined, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

interface ConversationListProps {
  conversations: Conversation[];
  pagination?: { page: number; pages: number; total: number };
  loading: boolean;
  error: string | null;
  selectedId: string | number | null;
  onSelect: (id: string | number) => void;
  page: number;
  onPageChange: (p: number) => void;
  status: string;
  onStatusChange: (v: string) => void;
  channel: string;
  onChannelChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onRetry?: () => void;
}

export function ConversationList({
  conversations,
  pagination,
  loading,
  error,
  selectedId,
  onSelect,
  page,
  onPageChange,
  status,
  onStatusChange,
  channel,
  onChannelChange,
  search,
  onSearchChange,
  onRetry,
}: ConversationListProps) {
  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">收件匣</h1>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="搜尋對話..."
            aria-label="搜尋對話"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            aria-label="篩選狀態"
            className="flex-1 px-2 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="">全部狀態</option>
            <option value="unassigned">待認領</option>
            <option value="active">活躍</option>
            <option value="waiting_customer">等待客戶</option>
            <option value="escalated">已求援</option>
            <option value="resolved">已解決</option>
            <option value="closed">已關閉</option>
          </select>
          <select
            value={channel}
            onChange={(e) => onChannelChange(e.target.value)}
            aria-label="篩選渠道"
            className="flex-1 px-2 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="">全部渠道</option>
            <option value="messenger">Messenger</option>
            <option value="instagram">Instagram</option>
            <option value="line">LINE</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <ConversationListSkeleton />
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500 text-sm mb-3">{error}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
              >
                重試
              </button>
            )}
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState icon={Inbox} title="沒有對話" description="目前沒有符合條件的對話" />
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                'w-full flex items-start gap-3 p-4 text-left border-b border-zinc-100 dark:border-zinc-800/50 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/30',
                selectedId === conv.id && 'bg-zinc-100 dark:bg-zinc-800/50 border-l-2 border-l-indigo-500'
              )}
            >
              {conv.contact_id ? (
                <Link
                  href={`/contacts/${conv.contact_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0"
                >
                  <Avatar
                    name={conv.contact?.name || '未知'}
                    url={conv.contact?.avatar_url}
                    size="md"
                  />
                </Link>
              ) : (
                <Avatar
                  name={conv.contact?.name || '未知'}
                  url={conv.contact?.avatar_url}
                  size="md"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  {conv.contact_id ? (
                    <Link
                      href={`/contacts/${conv.contact_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                    >
                      {conv.contact?.name || '未知客戶'}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {conv.contact?.name || '未知客戶'}
                    </span>
                  )}
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0">
                    {conv.last_message?.timestamp ? formatTime(conv.last_message.timestamp) : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <ChannelIcon channel={conv.channel} size={12} />
                  <StatusBadge status={conv.status} />
                  <UrgencyBadge urgency={conv.urgency} />
                  {conv.status === 'escalated' && (
                    <AlertTriangle
                      className="w-3 h-3 text-red-500"
                      aria-label="已求援"
                    />
                  )}
                  {/* v1.1：主管在監看（watchers 非空） */}
                  {conv.watchers && conv.watchers.length > 0 && (
                    <Eye
                      className="w-3 h-3 text-sky-500"
                      aria-label="主管正在監看"
                    />
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 truncate">
                  {conv.last_message
                    ? (conv.last_message.content
                        ? truncate(conv.last_message.content, 40)
                        : conv.last_message.message_type === 'image' ? '[圖片]'
                        : conv.last_message.message_type === 'sticker' ? '[貼圖]'
                        : conv.last_message.message_type === 'attachment' ? '[附件]'
                        : '...')
                    : '尚無訊息'}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            共 {pagination.total} 筆
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-2 md:p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-400" />
            </button>
            <span className="text-xs text-zinc-400 px-2">
              {page} / {pagination.pages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pagination.pages}
              className="p-2 md:p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
