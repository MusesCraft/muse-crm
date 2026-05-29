'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  contactsApi,
  inboxApi,
  type ContactDetail,
} from '@/lib/api';
import { useAsync, useWebSocketEvent } from '@/lib/hooks';
import { formatCustomerIdentity, formatSalesStage } from '@/lib/contact-labels';
import { Avatar } from '@/components/avatar';
import { ChannelBadge } from '@/components/channel-icon';
import { SentimentBadge, UrgencyBadge } from '@/components/badges';
import { LoadingSpinner } from '@/components/loading';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  ChevronRight,
  ChevronLeft,
  Phone,
  Mail,
  Building2,
  Calendar,
  Clock,
  Globe,
  Search,
  Loader2,
  Brain,
  MessageSquare,
  StickyNote,
  UserCircle,
  TrendingUp,
  ShoppingBag,
  Lightbulb,
  ExternalLink,
} from 'lucide-react';

interface CustomerSidebarProps {
  contactId: string | number;
  channel: string;
  conversationId: string | number;
  onSelectConversation: (id: string | number) => void;
}

type AnalysisCompletePayload = {
  conversation_id?: string | number;
};

type NewActionPayload = {
  contact_id?: string | number | null;
  conversation_id?: string | number | null;
};

const ANALYSIS_POLL_TIMEOUT_MS = 60000;
const ANALYSIS_POLL_INTERVAL_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Source Badge ────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const label = source === 'ad_referral' ? '廣告導流' : '自然流入';
  const color = source === 'ad_referral'
    ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25'
    : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/25';

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', color)}>
      <Globe className="w-3 h-3" />
      {label}
    </span>
  );
}

// ── Analysis Display ───────────────────────────────────

function AnalysisDisplay({ data }: { data: Record<string, unknown> }) {
  const demandSummary = typeof data.demand_summary === 'string' ? data.demand_summary : null;
  const mentionedProducts = Array.isArray(data.mentioned_products) ? data.mentioned_products as string[] : null;
  const suggestedAction = typeof data.suggested_action === 'string' ? data.suggested_action : null;
  const sentiment = typeof data.sentiment === 'string' ? data.sentiment : null;
  const urgency = typeof data.urgency === 'string' ? data.urgency : null;

  return (
    <div className="space-y-3">
      {demandSummary && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 mb-1">
            <Lightbulb className="w-3 h-3" />
            需求摘要
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{demandSummary}</p>
        </div>
      )}

      {mentionedProducts && mentionedProducts.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 mb-1">
            <ShoppingBag className="w-3 h-3" />
            提及產品
          </div>
          <div className="flex flex-wrap gap-1">
            {mentionedProducts.map((p, i) => (
              <span key={i} className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-full px-2 py-0.5">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {suggestedAction && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 mb-1">
            <TrendingUp className="w-3 h-3" />
            建議動作
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/10 rounded-md px-2.5 py-1.5">
            {suggestedAction}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {sentiment && <SentimentBadge sentiment={sentiment} />}
        {urgency && <UrgencyBadge urgency={urgency} />}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────

export function CustomerSidebar({
  contactId,
  channel,
  conversationId,
  onSelectConversation,
}: CustomerSidebarProps) {
  // Collapsed state from localStorage
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('muse_sidebar_collapsed') === 'true';
  });

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem('muse_sidebar_collapsed', String(collapsed));
    window.dispatchEvent(new Event('sidebar-toggle'));
  }, [collapsed]);

  // Fetch contact detail
  const { data: contact, loading, error: contactError, refetch } = useAsync<ContactDetail>(
    () => contactsApi.getContact(contactId),
    [contactId]
  );

  const refreshOnContactUpdated = useCallback((payload: { contact_id: string | number }) => {
    if (String(payload.contact_id) === String(contactId)) {
      refetch();
    }
  }, [contactId, refetch]);
  useWebSocketEvent('contact.updated', refreshOnContactUpdated);

  const refreshOnAnalysisComplete = useCallback((payload: AnalysisCompletePayload) => {
    if (String(payload.conversation_id) === String(conversationId)) {
      setAnalyzing(false);
      setAnalysisError(null);
      refetch();
    }
  }, [conversationId, refetch]);
  useWebSocketEvent('analysis_complete', refreshOnAnalysisComplete);

  const refreshOnNewAction = useCallback((payload: NewActionPayload) => {
    const payloadContactId = payload?.contact_id;
    const payloadConversationId = payload?.conversation_id;
    const hasScope = !!payloadContactId || !!payloadConversationId;
    if (
      !hasScope ||
      (!!payloadContactId && String(payloadContactId) === String(contactId)) ||
      (!!payloadConversationId && String(payloadConversationId) === String(conversationId))
    ) {
      refetch();
    }
  }, [contactId, conversationId, refetch]);
  useWebSocketEvent('new_action', refreshOnNewAction);

  // 從 API 資料取得其他對話和分析結果
  const otherConversations = (contact?.conversations || []).filter(
    (c) => c.id !== conversationId
  );

  const existingAnalysis = contact?.analyses?.[0] || null;

  // Handle deep analysis
  const handleAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalysisError(null);
    const previousAnalysisId = existingAnalysis?.id ? String(existingAnalysis.id) : null;

    try {
      await inboxApi.analyzeConversation(conversationId);

      const deadline = Date.now() + ANALYSIS_POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(ANALYSIS_POLL_INTERVAL_MS);
        const fresh = await contactsApi.getContact(contactId);
        const latest = fresh.analyses?.[0] || null;
        const latestId = latest?.id ? String(latest.id) : null;
        if (latestId && latestId !== previousAnalysisId) {
          refetch();
          setAnalyzing(false);
          return;
        }
      }

      setAnalysisError('分析任務已送出，但目前尚未產生結果。請稍後重試或檢查背景任務。');
      refetch();
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : '分析送出失敗');
    } finally {
      setAnalyzing(false);
    }
  };

  // Use existing persisted analysis only. Do not synthesize frontend analysis.
  const displayAnalysis: Record<string, unknown> | null =
    (existingAnalysis?.result as Record<string, unknown> | undefined)
    ?? null;

  // ── Collapsed View ─────────────────────────────────

  if (collapsed) {
    return (
      <div className="w-10 bg-[#F7F8FA] border-l border-[#E5E7EB] dark:bg-zinc-900 dark:border-zinc-800 flex flex-col items-center pt-3 transition-all duration-200">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="展開客戶快訊"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Expanded View ──────────────────────────────────

  if (contactError) {
    return (
      <div className="w-full h-full bg-[#F7F8FA] border-l border-[#E5E7EB] dark:bg-zinc-900 dark:border-zinc-800 flex items-center justify-center transition-all duration-200">
        <div className="text-center py-8">
          <p className="text-red-500 text-sm mb-3">{contactError}</p>
          <button
            onClick={() => refetch()}
            className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
          >
            重試
          </button>
        </div>
      </div>
    );
  }

  if (loading || !contact) {
    return (
      <div className="w-full h-full bg-[#F7F8FA] border-l border-[#E5E7EB] dark:bg-zinc-900 dark:border-zinc-800 flex items-center justify-center transition-all duration-200">
        <LoadingSpinner />
      </div>
    );
  }

  const notes = contact.notes || [];
  const recentNotes = notes.slice(0, 2);

  return (
    <div className="w-full h-full bg-[#F7F8FA] dark:bg-zinc-900 flex flex-col overflow-hidden transition-all duration-200">
      {/* ── Header ── */}
      <div className="p-4 border-b border-[#E5E7EB] dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center gap-3">
        <Link href={`/contacts/${contactId}`} className="flex items-center gap-3 flex-1 min-w-0 group">
          <Avatar name={contact.name} url={contact.avatar_url} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[#1F2933] dark:text-white truncate group-hover:text-[#7C3AED] dark:group-hover:text-indigo-400 transition-colors">{contact.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ChannelBadge channel={channel} />
            </div>
          </div>
        </Link>
        <button
          onClick={() => setCollapsed(true)}
          className="p-2 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="收合"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ── Basic Info Card ── */}
        <div className="rounded-lg border border-[#E5E7EB] bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h4 className="text-[10px] font-medium text-[#6B7280] dark:text-zinc-500 uppercase tracking-wider mb-3">客戶情報</h4>
          <div className="space-y-2.5">
            {contact.phone && (
              <div className="flex items-center gap-2.5 text-sm">
                <Phone className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
                <span className="text-zinc-600 dark:text-zinc-300">{contact.phone}</span>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2.5 text-sm">
                <Mail className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
                <span className="text-zinc-600 dark:text-zinc-300">{contact.email}</span>
              </div>
            )}
            {contact.display_name && contact.display_name !== contact.name && (
              <div className="flex items-center gap-2.5 text-sm">
                <Building2 className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
                <span className="text-zinc-500 dark:text-zinc-300 text-xs">{contact.display_name}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-sm">
              <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
              <span className="text-[#6B7280] text-xs">首次互動 {formatDate(contact.first_seen)}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Clock className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
              <span className="text-[#6B7280] text-xs">最後活躍 {formatDate(contact.last_seen)}</span>
            </div>
            <div className="mt-1">
              <SourceBadge source={contact.source_type} />
            </div>
          </div>
        </div>

        {/* ── 客戶身份 / 銷售階段（PR-2 結構） ── */}
        <div className="rounded-lg border border-[#E5E7EB] bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h4 className="text-[10px] font-medium text-[#6B7280] dark:text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <UserCircle className="w-3 h-3" />
            意圖與身分
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {contact.customer_identity ? (
              <span className="inline-flex items-center rounded-full bg-[#F7F8FA] border border-[#E5E7EB] dark:bg-zinc-800 dark:border-zinc-700 px-2 py-0.5 text-xs text-[#6B7280] dark:text-zinc-300">
                {formatCustomerIdentity(contact.customer_identity)}
              </span>
            ) : (
              <span className="text-xs text-zinc-400 dark:text-zinc-600">未分類</span>
            )}
            {contact.sales_stage && (
              <span className="inline-flex items-center rounded-full bg-[#F5F3FF] border border-[#DDD6FE] dark:bg-indigo-500/10 dark:border-indigo-500/20 px-2 py-0.5 text-xs text-[#7C3AED] dark:text-indigo-400">
                {formatSalesStage(contact.sales_stage)}
              </span>
            )}
          </div>
        </div>

        {/* ── AI Analysis ── */}
        <div className="rounded-lg border border-[#DDD6FE] bg-[#F5F3FF] p-3 dark:border-purple-500/20 dark:bg-purple-500/10">
          <h4 className="text-[10px] font-medium text-[#7C3AED] dark:text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Brain className="w-3 h-3" />
            AI 分析
          </h4>

          {displayAnalysis ? (
            <AnalysisDisplay data={displayAnalysis} />
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                aria-label="深度分析"
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  analyzing
                    ? 'bg-white/70 text-[#7C3AED] dark:text-purple-400 cursor-wait'
                    : 'bg-white/70 text-[#7C3AED] dark:text-purple-400 hover:bg-white border border-[#DDD6FE]'
                )}
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    分析中…
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    深度分析
                  </>
                )}
              </button>
              {analysisError && (
                <p className="text-xs leading-relaxed text-red-600 dark:text-red-400">
                  {analysisError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Conversation History ── */}
        {otherConversations.length > 0 && (
          <div className="rounded-lg border border-[#E5E7EB] bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <h4 className="text-[10px] font-medium text-[#6B7280] dark:text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />
              其他對話 ({otherConversations.length})
            </h4>
            <div className="space-y-1.5">
              {otherConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className="w-full flex items-center justify-between p-2.5 md:p-2 rounded-md bg-[#F7F8FA] hover:bg-zinc-100 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/60 transition-colors text-left min-h-[44px] md:min-h-0"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {conv.last_message?.content.slice(0, 30)}…
                    </p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">
                      {formatDateTime(conv.started_at)} · {conv.message_count} 則
                    </p>
                  </div>
                  <span className={cn(
                    'text-[10px] rounded-full px-1.5 py-0.5 flex-shrink-0 ml-2',
                    conv.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400'
                      : 'bg-zinc-600/20 text-zinc-500'
                  )}>
                    {conv.status === 'active' ? '進行中' : '已關閉'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Notes ── */}
        <div className="rounded-lg border border-[#E5E7EB] bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[10px] font-medium text-[#6B7280] dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <StickyNote className="w-3 h-3" />
              備註
            </h4>
            <Link
              href={`/contacts/${contactId}`}
              className="text-[10px] text-[#7C3AED] dark:text-indigo-400 hover:text-[#6D28D9] dark:hover:text-indigo-300 flex items-center gap-0.5 py-2 md:py-0 min-h-[44px] md:min-h-0"
            >
              查看全部
              <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>

          {recentNotes.length > 0 ? (
            <div className="space-y-2">
              {recentNotes.map((note) => (
                <div
                  key={note.id}
                  className="p-2.5 rounded-md bg-zinc-100/50 dark:bg-zinc-800/30 border-l-2 border-yellow-500/30"
                >
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{note.content}</p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-1.5">
                    {formatDateTime(note.created_at)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-600">尚無備註</p>
          )}
        </div>
      </div>
    </div>
  );
}
