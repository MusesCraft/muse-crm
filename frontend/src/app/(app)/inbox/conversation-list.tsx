'use client';

import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { ChannelIcon } from '@/components/channel-icon';
import { StatusBadge } from '@/components/status-badge';
import { LoadingSpinner, EmptyState } from '@/components/loading';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/lib/api';
import { Inbox } from 'lucide-react';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    return `${diffDays} 天前`;
  }
  return d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

interface ConversationListProps {
  conversations: Conversation[];
  pagination?: { page: number; pages: number; total: number };
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  page: number;
  onPageChange: (p: number) => void;
  status: string;
  onStatusChange: (v: string) => void;
  channel: string;
  onChannelChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
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
}: ConversationListProps) {
  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 space-y-3">
        <h1 className="text-lg font-semibold text-white">收件匣</h1>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="搜尋對話..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">全部狀態</option>
            <option value="active">進行中</option>
            <option value="closed">已關閉</option>
          </select>
          <select
            value={channel}
            onChange={(e) => onChannelChange(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
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
          <LoadingSpinner />
        ) : error ? (
          <div className="p-4 text-center text-sm text-red-400">{error}</div>
        ) : conversations.length === 0 ? (
          <EmptyState icon={Inbox} title="沒有對話" description="目前沒有符合條件的對話" />
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                'w-full flex items-start gap-3 p-4 text-left border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30',
                selectedId === conv.id && 'bg-zinc-800/50 border-l-2 border-l-blue-500'
              )}
            >
              <Avatar
                name={conv.contact?.name || '未知'}
                url={conv.contact?.avatar_url}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-100 truncate">
                    {conv.contact?.name || '未知客戶'}
                  </span>
                  <span className="text-xs text-zinc-500 flex-shrink-0">
                    {conv.last_message ? formatTime(conv.last_message.timestamp) : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <ChannelIcon channel={conv.channel} size={12} />
                  <StatusBadge status={conv.status} />
                </div>
                <p className="text-xs text-zinc-400 mt-1 truncate">
                  {conv.last_message ? truncate(conv.last_message.content, 40) : '尚無訊息'}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="p-3 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            共 {pagination.total} 筆
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-400" />
            </button>
            <span className="text-xs text-zinc-400 px-2">
              {page} / {pagination.pages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pagination.pages}
              className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
