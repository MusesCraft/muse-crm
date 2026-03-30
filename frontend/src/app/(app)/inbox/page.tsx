'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { inboxApi, type Conversation, type PaginatedResponse } from '@/lib/api';
import { mockConversations } from '@/lib/mock-data';
import { useAsync } from '@/lib/hooks';
import { ConversationList } from './conversation-list';
import { ConversationDetail } from './conversation-detail';
import { CustomerSidebar } from './customer-sidebar';
import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/loading';

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [channel, setChannel] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const { data, loading, error, refetch } = useAsync<PaginatedResponse<Conversation>>(
    () =>
      inboxApi.getConversations({
        page,
        per_page: 20,
        status: status || undefined,
        channel: channel || undefined,
        search: search || undefined,
      }),
    [page, status, channel, search]
  );

  // Track current total in a ref to avoid stale closure
  const totalRef = useRef(0);
  useEffect(() => { totalRef.current = data?.pagination?.total || 0; }, [data?.pagination?.total]);

  // Guard against overlapping polling calls
  const pollingRef = useRef(false);

  // Auto polling every 10 seconds (pause when tab hidden)
  // 使用 silent fetch 避免觸發 loading/error state → 防止不必要的 re-render
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const fresh = await inboxApi.getConversations({
          page,
          per_page: 20,
          status: status || undefined,
          channel: channel || undefined,
          search: search || undefined,
        });
        // 只在筆數變化時才 refetch（更新完整 state）
        if (fresh.pagination?.total !== totalRef.current) {
          refetch();
        }
      } catch {
        // 靜默忽略所有 polling 錯誤
      } finally {
        pollingRef.current = false;
      }
    }, 10000);
    return () => clearInterval(id);
  }, [page, status, channel, search, refetch]);

  const handleSelect = useCallback((id: string | number) => {
    setSelectedId(id);
  }, []);

  const handleConversationClosed = useCallback(() => {
    refetch();
  }, [refetch]);

  // Find selected conversation to get contact info
  const selectedConv = selectedId
    ? (data?.data || []).find((c) => c.id === selectedId) || mockConversations.find((c) => c.id === selectedId)
    : null;

  return (
    <div className="flex h-screen">
      {/* Left panel: Conversation list */}
      <div className="w-80 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/50 dark:bg-zinc-950/50 flex-shrink-0">
        <ConversationList
          conversations={data?.data || []}
          pagination={data?.pagination}
          loading={loading}
          error={error}
          selectedId={selectedId}
          onSelect={handleSelect}
          page={page}
          onPageChange={setPage}
          status={status}
          onStatusChange={(v) => { setStatus(v); setPage(1); }}
          channel={channel}
          onChannelChange={(v) => { setChannel(v); setPage(1); }}
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
        />
      </div>

      {/* Center panel: Conversation detail */}
      <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 min-w-0">
        {selectedId ? (
          <ConversationDetail
            conversationId={selectedId}
            onClose={handleConversationClosed}
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="選擇一個對話"
            description="從左側列表中選擇一個對話以查看詳情"
          />
        )}
      </div>

      {/* Right panel: Customer sidebar */}
      {selectedConv && selectedConv.contact_id && (
        <CustomerSidebar
          contactId={selectedConv.contact_id}
          channel={selectedConv.channel}
          conversationId={selectedId!}
          onSelectConversation={handleSelect}
        />
      )}
    </div>
  );
}
