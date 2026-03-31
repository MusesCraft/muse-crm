'use client';

import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { contactsApi, type Contact, type PaginatedResponse } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Avatar } from '@/components/avatar';
import { ChannelBadge } from '@/components/channel-icon';
import { PriorityBadge } from '@/components/badges';
import { LoadingSpinner, EmptyState } from '@/components/loading';
import { formatDateTime } from '@/lib/format';
import { Search, ChevronLeft, ChevronRight, Users, ExternalLink, ArrowUpDown } from 'lucide-react';

type SortKey = 'last_seen' | 'priority' | 'conversation_count' | 'name';
const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function ContactsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [sort, setSort] = useState<SortKey>('last_seen');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  };

  const { data, loading, error, refetch } = useAsync<PaginatedResponse<Contact>>(
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

  const sortedContacts = useMemo(() => {
    if (!data?.data) return [];
    const list = [...data.data];
    list.sort((a, b) => {
      switch (sort) {
        case 'priority':
          return (priorityOrder[a.priority || 'low'] ?? 2) - (priorityOrder[b.priority || 'low'] ?? 2);
        case 'conversation_count':
          return b.conversation_count - a.conversation_count;
        case 'name':
          return a.name.localeCompare(b.name, 'zh-TW');
        case 'last_seen':
        default:
          return (new Date(b.last_seen || 0).getTime()) - (new Date(a.last_seen || 0).getTime());
      }
    });
    return list;
  }, [data, sort]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">客戶管理</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">查看和管理所有客戶資訊</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="搜尋客戶名稱..."
            aria-label="搜尋客戶名稱"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <select
          value={channel}
          onChange={(e) => { setChannel(e.target.value); setPage(1); }}
          aria-label="篩選渠道"
          className="px-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">全部渠道</option>
          <option value="messenger">Messenger</option>
          <option value="instagram">Instagram</option>
          <option value="line">LINE</option>
        </select>
        <select
          value={sourceType}
          onChange={(e) => { setSourceType(e.target.value); setPage(1); }}
          aria-label="篩選來源"
          className="px-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">全部來源</option>
          <option value="organic">自然流量</option>
          <option value="ad">廣告</option>
          <option value="referral">推薦</option>
        </select>

        {/* Sort */}
        <div className="flex items-center gap-1.5 ml-auto text-xs text-zinc-400 dark:text-zinc-500">
          <ArrowUpDown className="w-3.5 h-3.5" />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="排序方式"
          className="px-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="last_seen">按最後活躍</option>
          <option value="priority">按優先級</option>
          <option value="conversation_count">按對話數</option>
          <option value="name">按名稱</option>
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
          <EmptyState icon={Users} title="沒有客戶" description="目前沒有符合條件的客戶" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                  客戶
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                  渠道
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                  優先級
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                  標籤
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                  最後活躍
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50">
                  對話數
                </th>
                <th className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50"></th>
              </tr>
            </thead>
            <tbody>
              {sortedContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={contact.name} url={contact.avatar_url} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{contact.name}</p>
                        {contact.display_name && contact.display_name !== contact.name && (
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">{contact.display_name}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ChannelBadge channel={contact.channel} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <PriorityBadge priority={contact.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags && contact.tags.length > 0 ? (
                        contact.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300"
                          >
                            {tag.tag_name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-600">&mdash;</span>
                      )}
                      {contact.tags && contact.tags.length > 3 && (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          +{contact.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatDateTime(contact.last_seen)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">{contact.conversation_count}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="inline-flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
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
          <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-500">共 {data.pagination.total} 位客戶</span>
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
