'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { contactsApi, type Contact, type PaginatedResponse } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Avatar } from '@/components/avatar';
import { ChannelBadge } from '@/components/channel-icon';
import { PriorityBadge } from '@/components/badges';
import { LoadingSpinner, EmptyState } from '@/components/loading';
import { formatDateTime } from '@/lib/format';
import { Search, ChevronLeft, ChevronRight, Users, ExternalLink, ArrowUpDown, Plus, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type SortKey = 'last_seen' | 'priority' | 'conversation_count' | 'name';
const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function ContactsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [sort, setSort] = useState<SortKey>('last_seen');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCreateContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const fd = new FormData(e.currentTarget);
      const products = (fd.get('preferred_products') as string || '').split(',').map(s => s.trim()).filter(Boolean);
      await contactsApi.createContact({
        display_name: fd.get('display_name') as string,
        phone: (fd.get('phone') as string) || undefined,
        email: (fd.get('email') as string) || undefined,
        notes: (fd.get('notes') as string) || undefined,
        source_channel: (fd.get('source_channel') as 'walk_in' | 'phone' | 'referral' | 'exhibition' | 'other') || undefined,
        intent: (fd.get('intent') as 'browsing' | 'interested' | 'ready_to_buy' | 'purchased') || undefined,
        budget_range: (fd.get('budget_range') as 'under_50k' | '50k_200k' | '200k_500k' | 'over_500k') || undefined,
        preferred_products: products.length > 0 ? products : undefined,
        visit_date: (fd.get('visit_date') as string) || undefined,
        referral_source: (fd.get('referral_source') as string) || undefined,
        contact_status: (fd.get('contact_status') as 'new' | 'following_up' | 'quoted' | 'won' | 'lost') || undefined,
      });
      setShowCreate(false);
      refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '建立失敗');
    } finally {
      setCreating(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  };

  // 清理 debounce timer，避免 unmount 後 setState
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">客戶管理</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">查看和管理所有客戶資訊</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增客戶
        </button>
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
      {/* 新增客戶 Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增客戶</DialogTitle>
            <DialogDescription>手動登記非線上客戶資訊</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateContact} className="grid gap-3">
            {/* 必填 */}
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">客戶名稱 *</label>
              <input name="display_name" required className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            {/* 聯絡資訊 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">電話</label>
                <input name="phone" className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email</label>
                <input name="email" type="email" className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
            {/* 來源 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">來源渠道</label>
                <select name="source_channel" className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                  <option value="">請選擇</option>
                  <option value="walk_in">到店來訪</option>
                  <option value="phone">電話諮詢</option>
                  <option value="referral">轉介紹</option>
                  <option value="exhibition">展覽</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">跟進狀態</label>
                <select name="contact_status" defaultValue="new" className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                  <option value="new">新客戶</option>
                  <option value="following_up">跟進中</option>
                  <option value="quoted">已報價</option>
                  <option value="won">成交</option>
                  <option value="lost">流失</option>
                </select>
              </div>
            </div>
            {/* 購買意向 / 預算 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">購買意向</label>
                <select name="intent" className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                  <option value="">請選擇</option>
                  <option value="browsing">瀏覽中</option>
                  <option value="interested">有興趣</option>
                  <option value="ready_to_buy">準備購買</option>
                  <option value="purchased">已購買</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">預算區間</label>
                <select name="budget_range" className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                  <option value="">請選擇</option>
                  <option value="under_50k">5 萬以下</option>
                  <option value="50k_200k">5-20 萬</option>
                  <option value="200k_500k">20-50 萬</option>
                  <option value="over_500k">50 萬以上</option>
                </select>
              </div>
            </div>
            {/* 偏好產品 / 來訪日期 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">偏好產品</label>
                <input name="preferred_products" placeholder="逗號分隔，如：岩板,檯面" className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">來訪日期</label>
                <input name="visit_date" type="date" className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
            {/* 轉介來源 */}
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">轉介來源</label>
              <input name="referral_source" placeholder="如：王設計師介紹" className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            {/* 備註 */}
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">備註</label>
              <textarea name="notes" rows={2} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500 resize-none" />
            </div>
            {createError && <p className="text-xs text-red-500">{createError}</p>}
            <DialogFooter>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">取消</button>
              <button type="submit" disabled={creating} className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors">
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                建立
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
