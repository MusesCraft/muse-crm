'use client';

import { useState } from 'react';
import Link from 'next/link';
import { contactsApi, type Contact, type PaginatedResponse } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Avatar } from '@/components/avatar';
import { ChannelBadge } from '@/components/channel-icon';
import { LoadingSpinner, EmptyState } from '@/components/loading';
import { Search, ChevronLeft, ChevronRight, Users, ExternalLink } from 'lucide-react';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ContactsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [sourceType, setSourceType] = useState('');

  const { data, loading, error } = useAsync<PaginatedResponse<Contact>>(
    () =>
      contactsApi.getContacts({
        page,
        per_page: 20,
        search: search || undefined,
        channel: channel || undefined,
        source_type: sourceType || undefined,
      }),
    [page, search, channel, sourceType]
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">客戶管理</h1>
        <p className="text-sm text-zinc-400 mt-1">查看和管理所有客戶資訊</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="搜尋客戶名稱..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <select
          value={channel}
          onChange={(e) => { setChannel(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">全部渠道</option>
          <option value="messenger">Messenger</option>
          <option value="instagram">Instagram</option>
          <option value="line">LINE</option>
        </select>
        <select
          value={sourceType}
          onChange={(e) => { setSourceType(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">全部來源</option>
          <option value="organic">自然流量</option>
          <option value="ad">廣告</option>
          <option value="referral">推薦</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg overflow-hidden">
        {loading && !data ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="p-6 text-red-400 text-sm text-center">{error}</div>
        ) : !data || data.data.length === 0 ? (
          <EmptyState icon={Users} title="沒有客戶" description="目前沒有符合條件的客戶" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  客戶
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  渠道
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  標籤
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  最後活躍
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  對話數
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={contact.name} url={contact.avatar_url} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-zinc-100">{contact.name}</p>
                        {contact.display_name && contact.display_name !== contact.name && (
                          <p className="text-xs text-zinc-500">{contact.display_name}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ChannelBadge channel={contact.channel} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags && contact.tags.length > 0 ? (
                        contact.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                          >
                            {tag.tag_name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                      {contact.tags && contact.tags.length > 3 && (
                        <span className="text-xs text-zinc-500">
                          +{contact.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-zinc-400">{formatDate(contact.last_seen)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-zinc-300">{contact.conversation_count}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      查看
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-500">共 {data.pagination.total} 位客戶</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4 text-zinc-400" />
              </button>
              <span className="text-xs text-zinc-400 px-2">
                {page} / {data.pagination.pages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= data.pagination.pages}
                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30"
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
