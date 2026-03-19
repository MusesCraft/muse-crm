'use client';

import { useState, useCallback } from 'react';
import { inboxApi, type Conversation, type PaginatedResponse } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { ConversationList } from './conversation-list';
import { ConversationDetail } from './conversation-detail';
import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/loading';

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
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

  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
  }, []);

  const handleConversationClosed = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <div className="flex h-screen">
      {/* Left panel: Conversation list */}
      <div className="w-96 border-r border-zinc-800 flex flex-col bg-zinc-950/50">
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

      {/* Right panel: Conversation detail */}
      <div className="flex-1 flex flex-col bg-zinc-900">
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
    </div>
  );
}
