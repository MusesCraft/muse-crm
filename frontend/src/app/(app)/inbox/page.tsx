'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { inboxApi, type Conversation, type PaginatedResponse } from '@/lib/api';
import { useAsync, useWebSocketEvent } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { ConversationList } from './conversation-list';
import { ConversationDetail } from './conversation-detail';
import { CustomerSidebar } from './customer-sidebar';
import { CopilotPanel } from '@/components/copilot/copilot-panel';
import { ResizeHandle } from '@/components/resize-handle';
import { Inbox, Users, UserCheck, Building2, CheckCircle2, Archive, Sparkles, X, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/loading';
import { cn } from '@/lib/utils';

const NAV_WIDTH = 160;          // 左側 nav 固定寬
const LIST_MIN = 240;
const LIST_MAX = 480;
const LIST_DEFAULT = 300;
const COPILOT_MIN = 340;
const COPILOT_MAX = 400;
const COPILOT_DEFAULT = 360;
const STORAGE_KEY = 'muse_inbox_panels';

type InboxView = 'mine' | 'unassigned' | 'team' | 'resolved' | 'closed';

interface ViewItem {
  key: InboxView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** 是否需要 manager+ 才能看見 */
  requiresManager?: boolean;
}

const VIEWS: ViewItem[] = [
  { key: 'mine', label: '我的對話', icon: UserCheck },
  { key: 'unassigned', label: '待認領', icon: Users },
  { key: 'team', label: '團隊視圖', icon: Building2, requiresManager: true },
  { key: 'resolved', label: '已解決', icon: CheckCircle2 },
  { key: 'closed', label: '已關閉', icon: Archive },
];

function loadSizes(): { list: number; copilot: number } {
  if (typeof window === 'undefined') return { list: LIST_DEFAULT, copilot: COPILOT_DEFAULT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        list: Math.min(Math.max(parsed.list || LIST_DEFAULT, LIST_MIN), LIST_MAX),
        copilot: Math.min(Math.max(parsed.copilot || COPILOT_DEFAULT, COPILOT_MIN), COPILOT_MAX),
      };
    }
  } catch { /* ignore */ }
  return { list: LIST_DEFAULT, copilot: COPILOT_DEFAULT };
}

// ── Nav (左欄視圖切換) ───────────────────────────────────

function InboxNav({
  current,
  onChange,
  isManager,
}: {
  current: InboxView;
  onChange: (v: InboxView) => void;
  isManager: boolean;
}) {
  const items = VIEWS.filter((v) => !v.requiresManager || isManager);
  return (
    <nav className="px-3 py-4 space-y-1" aria-label="收件匣視圖">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] dark:text-zinc-500 px-2 mb-2">
        視圖
      </p>
      {items.map((v) => {
        const Icon = v.icon;
        const active = current === v.key;
        return (
          <button
            key={v.key}
            onClick={() => onChange(v.key)}
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg text-left transition-colors',
              active
                ? 'bg-[#F5F3FF] text-[#7C3AED] shadow-sm dark:bg-indigo-500/10 dark:text-indigo-300'
                : 'text-[#6B7280] dark:text-zinc-300 hover:bg-white hover:text-[#1F2933] dark:hover:bg-zinc-800'
            )}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{v.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── 把 view 對應到 API 查詢參數 ─────────────────────────

function viewToParams(view: InboxView): {
  view?: 'mine' | 'unassigned' | 'team';
  status?: string;
} {
  switch (view) {
    case 'mine': return { view: 'mine' };
    case 'unassigned': return { view: 'unassigned' };
    case 'team': return { view: 'team' };
    case 'resolved': return { status: 'resolved' };
    case 'closed': return { status: 'closed' };
  }
}

type ContactUpdatedPayload = {
  contact_id: string | number;
  conversation_ids?: Array<string | number>;
  changed_fields?: string[];
};

type NewMessagePayload = {
  message_id?: string | number;
  conversation_id?: string | number;
  contact_id?: string | number;
  channel?: string;
  message?: {
    id?: string | number;
    sent_at?: string | null;
  };
  contact?: {
    id?: string | number;
  };
  conversation?: {
    id?: string | number;
    status?: string | null;
  };
};

type ConversationClosedPayload = {
  conversation_id?: string | number;
  contact_id?: string | number;
  contact?: {
    id?: string | number;
  };
  conversation?: {
    id?: string | number;
    contact_id?: string | number;
    status?: string | null;
  };
};

function listFingerprint(items: Conversation[]): string {
  return items.map((c) => [
    c.id,
    c.status,
    c.urgency || '',
    c.current_handler_id || '',
    c.supervisor_id || '',
    c.contact?.customer_identity || '',
    c.contact?.sales_stage || '',
    c.contact?.last_seen || '',
    c.message_count,
    c.last_message?.id || '',
    c.last_message?.timestamp || '',
  ].join(':')).join('|');
}

// ──────────────────────────────────────────────────────

export default function InboxPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const [view, setView] = useState<InboxView>('mine');
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [channel, setChannel] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [copilotOpen, setCopilotOpen] = useState(true);
  // 手機 / 平板版 Copilot 用抽屜顯示
  const [copilotDrawerOpen, setCopilotDrawerOpen] = useState(false);

  const searchDebounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 面板寬度
  const [listWidth, setListWidth] = useState(() => loadSizes().list);
  const [copilotWidth, setCopilotWidth] = useState(() => loadSizes().copilot);

  const persistTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const persistSizes = useCallback((lw: number, cw: number) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ list: lw, copilot: cw }));
    }, 300);
  }, []);

  const handleListResize = useCallback((delta: number) => {
    setListWidth(prev => {
      const next = Math.min(Math.max(prev + delta, LIST_MIN), LIST_MAX);
      persistSizes(next, copilotWidth);
      return next;
    });
  }, [copilotWidth, persistSizes]);

  const handleCopilotResize = useCallback((delta: number) => {
    setCopilotWidth(prev => {
      const next = Math.min(Math.max(prev - delta, COPILOT_MIN), COPILOT_MAX);
      persistSizes(listWidth, next);
      return next;
    });
  }, [listWidth, persistSizes]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current);
    searchDebounceTimer.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
      setSelectedId(null);
    }, 300);
  }, []);

  // 切換視圖時重置 selection
  const handleViewChange = useCallback((v: InboxView) => {
    setView(v);
    setPage(1);
    setSelectedId(null);
    setStatus(''); // status 篩選器只在「自由模式」用；view=resolved/closed 已隱含
  }, []);

  const viewParams = viewToParams(view);

  const { data, loading, error, refetch } = useAsync<PaginatedResponse<Conversation>>(
    () =>
      inboxApi.getConversations({
        page,
        per_page: 20,
        // status 篩選器只在 mine/unassigned/team 下生效，resolved/closed view 用自己的 status
        status: (status || viewParams.status) || undefined,
        channel: channel || undefined,
        search: search || undefined,
        view: viewParams.view,
      }),
    [page, status, channel, search, view]
  );

  const selectedConv = selectedId
    ? (data?.data || []).find((c) => c.id === selectedId)
    : null;

  const listFingerprintRef = useRef('');
  useEffect(() => {
    listFingerprintRef.current = listFingerprint(data?.data || []);
  }, [data?.data]);

  const pollingRef = useRef(false);
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const fresh = await inboxApi.getConversations({
          page,
          per_page: 20,
          status: (status || viewParams.status) || undefined,
          channel: channel || undefined,
          search: search || undefined,
          view: viewParams.view,
        });
        const freshFingerprint = listFingerprint(fresh.data || []);
        if (freshFingerprint !== listFingerprintRef.current) {
          refetch();
        }
      } catch {
        // ignore
      } finally {
        pollingRef.current = false;
      }
    }, 10000);
    return () => clearInterval(id);
  }, [page, status, channel, search, view, refetch, viewParams.status, viewParams.view]);

  // WebSocket：對話狀態變動 → 刷新列表
  const listRefresh = useCallback(() => refetch(), [refetch]);
  useWebSocketEvent('conversation.assigned', listRefresh);
  useWebSocketEvent('conversation.escalated', listRefresh);
  useWebSocketEvent('conversation.taken_over', listRefresh);
  useWebSocketEvent('conversation.returned', listRefresh);
  useWebSocketEvent('conversation.resolved', listRefresh);
  useWebSocketEvent<ConversationClosedPayload>('session_closed', (payload) => {
    const payloadConversationId = payload.conversation_id || payload.conversation?.id;
    const payloadContactId = payload.contact_id || payload.conversation?.contact_id || payload.contact?.id;
    if (!payloadConversationId && !payloadContactId) {
      refetch();
      return;
    }

    const affectedSelected = !!selectedId && !!payloadConversationId && String(selectedId) === String(payloadConversationId);
    const affectsVisibleList = (data?.data || []).some((conv) =>
      (!!payloadConversationId && String(conv.id) === String(payloadConversationId)) ||
      (!!payloadContactId && String(conv.contact_id) === String(payloadContactId))
    );

    if (affectedSelected || affectsVisibleList || view === 'closed') {
      refetch();
    }
  });
  useWebSocketEvent<ConversationClosedPayload>('conversation.closed', (payload) => {
    const payloadConversationId = payload.conversation_id || payload.conversation?.id;
    const payloadContactId = payload.contact_id || payload.conversation?.contact_id || payload.contact?.id;
    if (!payloadConversationId && !payloadContactId) {
      refetch();
      return;
    }

    const affectedSelected = !!selectedId && !!payloadConversationId && String(selectedId) === String(payloadConversationId);
    const affectsVisibleList = (data?.data || []).some((conv) =>
      (!!payloadConversationId && String(conv.id) === String(payloadConversationId)) ||
      (!!payloadContactId && String(conv.contact_id) === String(payloadContactId))
    );

    if (affectedSelected || affectsVisibleList || view === 'closed') {
      refetch();
    }
  });
  useWebSocketEvent<NewMessagePayload>('new_message', (payload) => {
    const payloadConversationId = payload.conversation_id || payload.conversation?.id;
    const payloadContactId = payload.contact_id || payload.contact?.id;
    const affectedSelected =
      !!selectedId &&
      !!payloadConversationId &&
      String(selectedId) === String(payloadConversationId);
    const affectsVisibleList = (data?.data || []).some((conv) =>
      (!!payloadConversationId && String(conv.id) === String(payloadConversationId)) ||
      (!!payloadContactId && String(conv.contact_id) === String(payloadContactId))
    );

    const currentStatus = status || viewParams.status || '';
    const payloadStatus = payload.conversation?.status || '';
    const statusMatches = !currentStatus || !payloadStatus || currentStatus === payloadStatus;
    const channelMatches = !channel || !payload.channel || channel === payload.channel;
    const currentViewCanReceiveNewMessages = view !== 'resolved' && view !== 'closed';

    if (
      affectedSelected ||
      affectsVisibleList ||
      (currentViewCanReceiveNewMessages && statusMatches && channelMatches)
    ) {
      refetch();
    }
  });
  useWebSocketEvent<ContactUpdatedPayload>('contact.updated', (payload) => {
    const conversationIds = new Set((payload.conversation_ids || []).map(String));
    const affectedSelected =
      !!selectedConv &&
      (String(selectedConv.contact_id) === String(payload.contact_id) ||
        conversationIds.has(String(selectedConv.id)));
    const affectsVisibleList = (data?.data || []).some((conv) =>
      String(conv.contact_id) === String(payload.contact_id) ||
      conversationIds.has(String(conv.id))
    );

    if (affectedSelected || affectsVisibleList) {
      refetch();
    }
  });

  const handleSelect = useCallback((id: string | number) => {
    setSelectedId(id);
    setMobileView('detail');
  }, []);

  const handleConversationClosed = useCallback(() => {
    refetch();
    setSelectedId(null);
    setMobileView('list');
  }, [refetch]);

  const showCustomerSidebar = !!(selectedConv && selectedConv.contact_id);

  return (
    <div className="flex h-screen relative bg-[#F7F8FA] text-[#1F2933]">
      {/* Left nav (視圖切換) — 桌面才顯示 */}
      <aside
        style={{ width: NAV_WIDTH }}
        className="hidden lg:flex flex-col border-r border-[#E5E7EB] dark:border-zinc-800 bg-[#F7F8FA] dark:bg-zinc-950 flex-shrink-0"
      >
        <InboxNav current={view} onChange={handleViewChange} isManager={isManager} />
      </aside>

      {/* Mobile view tabs（< lg） */}
      <div className="lg:hidden absolute top-0 left-0 right-0 z-20 border-b border-[#E5E7EB] dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 flex gap-1 overflow-x-auto">
        {VIEWS.filter((v) => !v.requiresManager || isManager).map((v) => (
          <button
            key={v.key}
            onClick={() => handleViewChange(v.key)}
            className={cn(
              'flex-shrink-0 text-xs px-2.5 py-1 rounded-md',
              view === v.key
                ? 'bg-indigo-500 text-white'
                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div
        style={{ width: listWidth }}
        className={cn(
          'border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/50 dark:bg-zinc-950/50 flex-shrink-0',
          'border-r border-[#E5E7EB] bg-white dark:bg-zinc-950',
          mobileView === 'list' ? 'flex' : 'hidden md:flex',
          // 行動裝置 list 全寬
          'w-full md:w-auto pt-10 lg:pt-0'
        )}
      >
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
          onStatusChange={(v) => { setStatus(v); setPage(1); setSelectedId(null); }}
          channel={channel}
          onChannelChange={(v) => { setChannel(v); setPage(1); setSelectedId(null); }}
          search={searchInput}
          onSearchChange={handleSearchChange}
          onRetry={refetch}
        />
      </div>

      <ResizeHandle
        direction="horizontal"
        onResize={handleListResize}
        className="hidden md:flex"
      />

      {/* Center: conversation detail */}
      <div
        className={cn(
          'flex-1 flex flex-col bg-white dark:bg-zinc-900 min-w-0',
          'bg-[#F7F8FA] dark:bg-zinc-900',
          mobileView === 'detail' ? 'flex' : 'hidden md:flex'
        )}
      >
        {selectedId ? (
          <ConversationDetail
            conversationId={selectedId}
            onClose={handleConversationClosed}
            onBack={() => setMobileView('list')}
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="選擇一個對話"
            description="從左側列表中選擇一個對話以查看詳情"
          />
        )}
      </div>

      {/* Copilot toggle 按鈕（中等以上裝置才顯示）— 在 detail 邊緣浮現 */}
      {selectedId && !copilotOpen && (
        <button
          onClick={() => setCopilotOpen(true)}
          aria-label="開啟 AI Copilot"
          className="hidden lg:flex absolute right-4 top-3 z-10 items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[#7C3AED] text-white hover:bg-[#6D28D9] shadow"
        >
          <Sparkles className="w-3 h-3" />
          Copilot
        </button>
      )}

      {/* Right: Customer sidebar + Copilot — 在 selectedId 時顯示 */}
      {selectedId && copilotOpen && (
        <>
          <ResizeHandle
            direction="horizontal"
            onResize={handleCopilotResize}
            className="hidden lg:flex"
          />
          <aside
            style={{ width: copilotWidth }}
            className="hidden lg:flex flex-col flex-shrink-0 border-l border-[#E5E7EB] dark:border-zinc-800 bg-[#F7F8FA] dark:bg-zinc-950 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB] dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#7C3AED]" />
                <h3 className="text-xs font-semibold text-[#1F2933] dark:text-zinc-200">AI / 客戶情報</h3>
              </div>
              <button
                onClick={() => setCopilotOpen(false)}
                aria-label="關閉 Copilot"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CopilotPanel key={String(selectedId)} conversationId={selectedId} />
            </div>
            {showCustomerSidebar && (
              <div className="border-t border-[#E5E7EB] dark:border-zinc-800 max-h-[42%] overflow-y-auto">
                <CustomerSidebar
                  contactId={selectedConv!.contact_id}
                  channel={selectedConv!.channel}
                  conversationId={selectedId!}
                  onSelectConversation={handleSelect}
                />
              </div>
            )}
          </aside>
        </>
      )}

      {/* Mobile/tablet Copilot trigger（< lg） */}
      {selectedId && mobileView === 'detail' && (
        <button
          onClick={() => setCopilotDrawerOpen(true)}
          aria-label="開啟 AI Copilot"
          className="lg:hidden fixed right-4 bottom-24 z-30 flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#7C3AED] text-white shadow-lg hover:bg-[#6D28D9]"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-xs">Copilot</span>
        </button>
      )}

      {/* Mobile/tablet Copilot Drawer */}
      {copilotDrawerOpen && selectedId && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setCopilotDrawerOpen(false)}
          />
          <aside className="absolute right-0 top-0 bottom-0 w-[88%] max-w-md bg-[#F7F8FA] dark:bg-zinc-950 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#E5E7EB] dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#7C3AED]" />
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">AI / 客戶情報</h3>
              </div>
              <button
                onClick={() => setCopilotDrawerOpen(false)}
                aria-label="關閉"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CopilotPanel key={String(selectedId)} conversationId={selectedId} />
            </div>
            {showCustomerSidebar && (
              <div className="border-t border-zinc-200 dark:border-zinc-800 max-h-[40%] overflow-y-auto">
                <CustomerSidebar
                  contactId={selectedConv!.contact_id}
                  channel={selectedConv!.channel}
                  conversationId={selectedId!}
                  onSelectConversation={(id) => {
                    handleSelect(id);
                    setCopilotDrawerOpen(false);
                  }}
                />
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
