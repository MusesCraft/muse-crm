'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  actionsApi,
  aiCopilotApi,
  inboxApi,
  ocrApi,
  conversationOpsApi,
  usersApi,
  type Conversation,
  type Message,
  type Analysis,
  type UserOption,
} from '@/lib/api';
import { useAsync, useWebSocketEvent } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/avatar';
import { ChannelBadge } from '@/components/channel-icon';
import { StatusBadge } from '@/components/status-badge';
import { MessageListSkeleton } from '@/components/skeletons';
import { MessageBubble } from './message-bubble';
import { SendBar, type SendBarHandle } from './send-bar';
import { TakeOverBanner } from '@/components/inbox/take-over-banner';
import { InternalNoteBubble } from '@/components/inbox/internal-note-bubble';
import { AssignMenu } from '@/components/inbox/assign-menu';
import { Button } from '@/components/ui/button';
import { formatCustomerIdentity, formatSalesStage } from '@/lib/contact-labels';
import {
  CheckCircle2,
  Clock,
  PlusCircle,
  MessageSquare,
  Brain,
  ChevronDown,
  ChevronUp,
  Search,
  Loader2,
  X,
  Lightbulb,
  ChevronLeft,
  WandSparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationDetailProps {
  conversationId: string | number;
  onClose: () => void;
  /** 手機版返回列表 */
  onBack?: () => void;
}

const ANALYSIS_POLL_TIMEOUT_MS = 60000;
const ANALYSIS_POLL_INTERVAL_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AnalysisCard({ analysis }: { analysis: Analysis }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-[#E5E7EB] dark:bg-zinc-800/50 dark:border-zinc-700/50 rounded-lg p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-[#7C3AED]" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{analysis.analysis_type}</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{analysis.model_used}</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
        )}
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700/50">
          <pre className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap overflow-auto max-h-60">
            {JSON.stringify(analysis.result, null, 2)}
          </pre>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2">
            分析於 {formatDateTime(analysis.created_at)}
          </p>
        </div>
      )}
    </div>
  );
}

// ── AI Suggestion Card ─────────────────────────────────

function AiSuggestionCard({
  analyses,
  onUse,
}: {
  analyses?: Analysis[];
  onUse: (text: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const suggestedReply = analyses?.[0]?.result?.suggested_reply as string | undefined;

  if (!analyses || analyses.length === 0) {
    return (
      <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-white dark:bg-zinc-800/50 border border-[#E5E7EB] dark:border-zinc-700/50">
        <p className="text-xs text-[#6B7280] dark:text-zinc-500 flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5" />
          點擊「深度分析」查看 AI 建議
        </p>
      </div>
    );
  }

  if (!suggestedReply) return null;

  return (
    <div className="mx-4 mb-2 px-3 py-2.5 rounded-lg bg-[#F5F3FF] dark:bg-purple-500/10 border border-[#DDD6FE] dark:border-purple-500/30">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Lightbulb className="w-3.5 h-3.5 text-[#7C3AED] dark:text-purple-400" />
        <span className="text-xs font-semibold text-[#7C3AED] dark:text-purple-400">AI 建議回覆</span>
      </div>
      <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed mb-2">{suggestedReply}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onUse(suggestedReply)}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-[#7C3AED] text-white hover:bg-[#6D28D9] transition-colors"
        >
          使用此回覆
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          忽略
        </button>
      </div>
    </div>
  );
}

// ── OCR Toast ──────────────────────────────────────────

function OcrToast({
  loading,
  toast,
}: {
  loading: boolean;
  toast: { message: string; type: 'success' | 'error' } | null;
}) {
  if (!loading && !toast) return null;

  return (
    <div className="px-4 pb-2">
      {loading && (
        <span className="text-xs text-amber-500 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          名片辨識中...
        </span>
      )}
      {toast && (
        <span className={cn('text-xs', toast.type === 'success' ? 'text-green-500' : 'text-red-500')}>
          {toast.message}
        </span>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────

export function ConversationDetail({ conversationId, onClose, onBack }: ConversationDetailProps) {
  const { user } = useAuth();
  const [resolving, setResolving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [creatingAction, setCreatingAction] = useState(false);
  const [generatingReply, setGeneratingReply] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [agents, setAgents] = useState<UserOption[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrToast, setOcrToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const sendBarRef = useRef<SendBarHandle>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const ocrLoadingRef = useRef(false);
  const ocrToastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const msgCountRef = useRef(0);
  const lastSentRef = useRef(0);
  const prevMsgCountRef = useRef(0);

  const { data: conv, loading, error, refetch } = useAsync<Conversation>(
    () => inboxApi.getConversation(conversationId),
    [conversationId]
  );

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    setLocalMessages([]);
    setReplyToMessage(null);
    setAnalysisError(null);
    setActionNotice(null);
    prevMsgCountRef.current = 0;
  }, [conversationId]);

  useEffect(() => {
    if (!canManage) return;
    usersApi.getAgents().then(setAgents).catch(() => setAgents([]));
  }, [canManage]);

  useEffect(() => {
    msgCountRef.current = conv?.messages?.length || 0;
    if (localMessages.length > 0 && conv?.messages?.length) {
      setLocalMessages([]);
    }
  }, [conv?.messages?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden || Date.now() - lastSentRef.current < 8000) return;
      try {
        const freshData = await inboxApi.getConversation(conversationId);
        if (freshData?.messages && freshData.messages.length > msgCountRef.current) {
          refetch();
        }
      } catch {
        // 靜默忽略
      }
    }, 5000);
    return () => clearInterval(id);
  }, [conversationId, refetch]);

  // WebSocket：新訊息或對話狀態變動時刷新
  const refreshOnEvent = useCallback((data: unknown) => {
    const payload = data as { conversation_id?: string } | undefined;
    if (payload?.conversation_id && String(payload.conversation_id) === String(conversationId)) {
      refetch();
    }
  }, [conversationId, refetch]);
  useWebSocketEvent('new_message', refreshOnEvent);
  useWebSocketEvent('conversation.assigned', refreshOnEvent);
  useWebSocketEvent('conversation.escalated', refreshOnEvent);
  useWebSocketEvent('conversation.taken_over', refreshOnEvent);
  useWebSocketEvent('conversation.returned', refreshOnEvent);
  useWebSocketEvent('conversation.resolved', refreshOnEvent);
  useWebSocketEvent('session_closed', refreshOnEvent);
  useWebSocketEvent('conversation.closed', refreshOnEvent);
  useWebSocketEvent('analysis_complete', refreshOnEvent);
  useWebSocketEvent('message.updated', refreshOnEvent);
  useWebSocketEvent('message.edited', refreshOnEvent);
  useWebSocketEvent('message.deleted', refreshOnEvent);
  useWebSocketEvent('message.pinned', refreshOnEvent);
  useWebSocketEvent('message.unpinned', refreshOnEvent);
  useWebSocketEvent('message.reaction_updated', refreshOnEvent);
  useWebSocketEvent('message.forwarded', refreshOnEvent);

  useEffect(() => {
    const count = (conv?.messages?.length || 0) + localMessages.length;
    if (count > 0 && count !== prevMsgCountRef.current) {
      const isInitialLoad = prevMsgCountRef.current === 0;
      prevMsgCountRef.current = count;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: isInitialLoad ? 'instant' : 'smooth' });
        });
      });
    }
  }, [conv?.messages, localMessages]);

  const allMessages = useMemo(() => {
    const serverMessages = conv?.messages || [];
    if (localMessages.length === 0) return serverMessages;
    const serverIds = new Set(serverMessages.map(m => String(m.id)));
    const uniqueLocal = localMessages.filter(m => !serverIds.has(String(m.id)));
    return [...serverMessages, ...uniqueLocal];
  }, [conv?.messages, localMessages]);

  // ── Send Message Callback ──

  const handleMessageSent = useCallback((msg: Message) => {
    setLocalMessages((prev) => [...prev, msg]);
    setReplyToMessage(null);
    lastSentRef.current = Date.now();
  }, []);

  const handleSendError = useCallback((err: string) => {
    setSendError(err);
  }, []);

  // ── AI Suggestion Use ──

  const handleAiSuggestionUse = useCallback((text: string) => {
    sendBarRef.current?.setTextAndFocus(text);
  }, []);

  const handleGenerateReply = useCallback(async () => {
    if (!conv || generatingReply) return;
    setGeneratingReply(true);
    setActionNotice(null);
    try {
      const existingReply = conv.analyses?.[0]?.result?.suggested_reply;
      if (typeof existingReply === 'string' && existingReply.trim()) {
        sendBarRef.current?.setTextAndFocus(existingReply);
        return;
      }

      const result = await aiCopilotApi.getSuggestions(conv.id);
      const firstSuggestion = result.data?.suggestions?.[0]?.text;
      if (firstSuggestion) {
        sendBarRef.current?.setTextAndFocus(firstSuggestion);
      } else {
        setActionNotice('目前沒有可用的回覆草稿');
      }
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : '產生回覆失敗');
    } finally {
      setGeneratingReply(false);
    }
  }, [conv, generatingReply]);

  // ── OCR ──

  const handleOcr = useCallback(async (mediaUrl: string) => {
    if (ocrLoadingRef.current) return;
    ocrLoadingRef.current = true;
    setOcrLoading(true);
    setOcrToast(null);
    try {
      const contactId = conv?.contact?.id ? String(conv.contact.id) : undefined;
      const res = await ocrApi.analyzeBusinessCard(mediaUrl, contactId);
      const r = res.result;
      const parts = [r.name, r.company, r.phone].filter(Boolean);
      setOcrToast({
        message: parts.length > 0
          ? `辨識成功：${parts.join(' / ')}${res.contact_updated ? '（已更新客戶資料）' : ''}`
          : '未能從圖片中辨識出名片資訊',
        type: parts.length > 0 ? 'success' : 'error',
      });
      if (res.contact_updated) {
        setTimeout(() => refetch(), 1000);
      }
    } catch {
      setOcrToast({ message: '名片辨識失敗，請重試', type: 'error' });
    } finally {
      ocrLoadingRef.current = false;
      setOcrLoading(false);
      if (ocrToastTimerRef.current) clearTimeout(ocrToastTimerRef.current);
      ocrToastTimerRef.current = setTimeout(() => setOcrToast(null), 5000);
    }
  }, [conv?.contact?.id, refetch]);

  useEffect(() => {
    return () => {
      if (ocrToastTimerRef.current) clearTimeout(ocrToastTimerRef.current);
    };
  }, []);

  // ── Conversation Actions ──

  const handleResolve = async () => {
    if (!conv || resolving) return;
    setResolving(true);
    try {
      await conversationOpsApi.resolve(conv.id);
      refetch();
      onClose();
    } catch {
      // ignore
    } finally {
      setResolving(false);
    }
  };

  const handleCreateAction = async () => {
    if (!conv || creatingAction) return;
    setCreatingAction(true);
    setActionNotice(null);
    try {
      await actionsApi.createAction({
        contact_id: conv.contact_id,
        conversation_id: conv.id,
        action_type: 'followup',
        description: `跟進 ${conv.contact?.name || '客戶'} 的本次對話`,
        priority: conv.urgency === 'high' ? 'high' : 'medium',
      });
      setActionNotice('已建立待辦');
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : '建立待辦失敗');
    } finally {
      setCreatingAction(false);
    }
  };

  const handleAnalyze = async () => {
    if (!conv || analyzing) return;
    setAnalyzing(true);
    setAnalysisError(null);
    const previousAnalysisId = conv.analyses?.[0]?.id ? String(conv.analyses[0].id) : null;

    try {
      await inboxApi.analyzeConversation(conv.id);
      const deadline = Date.now() + ANALYSIS_POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(ANALYSIS_POLL_INTERVAL_MS);
        const fresh = await inboxApi.getConversation(conv.id);
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

  if (loading) return <MessageListSkeleton />;
  if (error) return (
    <div className="text-center py-8">
      <p className="text-red-500 text-sm mb-3">{error}</p>
      <button
        onClick={() => refetch()}
        className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
      >
        重試
      </button>
    </div>
  );
  if (!conv) return null;

  const isOpen = !['resolved', 'closed'].includes(conv.status);
  const showTakeOverBanner = conv.status === 'supervisor_taken' || conv.status === 'escalated';
  const isMeTheSupervisor = !!(user && conv.supervisor_id && String(user.id) === String(conv.supervisor_id));

  return (
    <>
      {/* Header */}
      <div className="border-b border-[#E5E7EB] dark:border-zinc-800 px-4 sm:px-6 py-3 flex-shrink-0 bg-white dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="返回列表"
                className="md:hidden p-2 -ml-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <ChevronLeft className="w-4 h-4 text-zinc-500" />
              </button>
            )}
            <Avatar
              name={conv.contact?.name || '未知'}
              url={conv.contact?.avatar_url}
              size="sm"
            />
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <h2 className="text-sm font-semibold text-[#1F2933] dark:text-white truncate">
                {conv.contact?.name || '未知客戶'}
              </h2>
              <ChannelBadge channel={conv.channel} />
              <StatusBadge status={conv.status} />
              {conv.contact?.customer_identity && (
                <span className="inline-flex items-center rounded-full border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-0.5 text-xs text-[#6B7280] dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
                  {formatCustomerIdentity(conv.contact.customer_identity)}
                </span>
              )}
              {conv.contact?.sales_stage && (
                <span className="inline-flex items-center rounded-full border border-[#DDD6FE] bg-[#F5F3FF] px-2 py-0.5 text-xs text-[#7C3AED] dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-300">
                  {formatSalesStage(conv.contact.sales_stage)}
                </span>
              )}
            </div>
          </div>
          <span className="hidden 2xl:flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
            <Clock className="w-3 h-3" />
            建立於 {formatDateTime(conv.started_at)}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3 text-[11px] text-[#6B7280] dark:text-zinc-500">
            <span className="truncate">
              最後互動：{formatDateTime(conv.last_message?.timestamp || conv.started_at)}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 flex-shrink-0">
              <MessageSquare className="w-3 h-3" />
              {conv.message_count} 則
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 flex-shrink-0 flex-wrap">
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateAction}
                disabled={creatingAction}
                aria-label="建立待辦"
                className="text-[#6B7280] hover:text-[#2563EB] dark:text-zinc-400 dark:hover:text-blue-400"
              >
                {creatingAction ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <PlusCircle className="w-3.5 h-3.5 mr-1" />
                )}
                建立待辦
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateReply}
              disabled={generatingReply}
              aria-label="產生回覆"
              className="text-[#6B7280] hover:text-[#7C3AED] dark:text-zinc-400 dark:hover:text-purple-400"
            >
              {generatingReply ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <WandSparkles className="w-3.5 h-3.5 mr-1" />
              )}
              產生回覆
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAnalyze}
              disabled={analyzing}
              aria-label="深度分析"
              className="text-[#6B7280] hover:text-[#7C3AED] dark:text-zinc-400 dark:hover:text-purple-400"
            >
              {analyzing ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5 mr-1" />
              )}
              {analyzing ? '分析中...' : '深度分析'}
            </Button>

            {isOpen && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResolve}
                disabled={resolving}
                className="text-zinc-500 hover:text-emerald-500 dark:text-zinc-400 dark:hover:text-emerald-400"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {resolving ? '處理中...' : '標記已處理'}
              </Button>
            )}
            {canManage && agents.length > 0 && (
              <AssignMenu
                conversationId={conv.id}
                agents={agents}
                currentHandlerId={conv.current_handler_id}
                onAssigned={refetch}
              />
            )}
          </div>
        </div>
        {actionNotice && (
          <div className="mt-2 text-[11px] text-[#6B7280] dark:text-zinc-400">
            {actionNotice}
          </div>
        )}
      </div>

      {/* Take Over Banner（主管接管中或求援狀態） */}
      {showTakeOverBanner && (
        <TakeOverBanner
          conversationId={conv.id}
          isSupervisor={isMeTheSupervisor}
          onReturned={refetch}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-1 bg-[#F7F8FA] dark:bg-zinc-900">
        {allMessages.length > 0 ? (
          allMessages.map((msg) => (
            msg.is_internal ? (
              <InternalNoteBubble
                key={msg.id}
                content={msg.content}
                timestamp={msg.timestamp ? formatDateTime(msg.timestamp) : undefined}
                mentions={msg.mentions}
              />
            ) : (
              <MessageBubble
                key={msg.id}
                message={msg}
                channel={conv.channel}
                onReply={setReplyToMessage}
                onRefresh={refetch}
                onError={handleSendError}
                onOcr={msg.message_type === 'image' && msg.media_url ? handleOcr : undefined}
              />
            )
          ))
        ) : (
          <p className="text-center text-sm text-zinc-500 py-8">尚無訊息</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Analyses */}
      {conv.analyses && conv.analyses.length > 0 && (
        <div className="border-t border-[#E5E7EB] dark:border-zinc-800 p-4 space-y-2 max-h-60 overflow-y-auto flex-shrink-0 bg-white dark:bg-zinc-900">
          <h3 className="text-xs font-medium text-[#6B7280] uppercase tracking-wider mb-2">
            AI 分析摘要
          </h3>
          {conv.analyses.map((a) => (
            <AnalysisCard key={a.id} analysis={a} />
          ))}
        </div>
      )}

      {/* AI Suggestion */}
      {analysisError && (
        <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {analysisError}
        </div>
      )}

      <AiSuggestionCard analyses={conv.analyses} onUse={handleAiSuggestionUse} />

      {/* Message Input Area */}
      <SendBar
        ref={sendBarRef}
        conversationId={conversationId}
        onMessageSent={handleMessageSent}
        onError={handleSendError}
        replyToMessage={replyToMessage}
        onCancelReply={() => setReplyToMessage(null)}
        currentHandlerId={conv.current_handler_id}
        onConversationChanged={refetch}
      />

      {/* OCR Toast */}
      <OcrToast loading={ocrLoading} toast={ocrToast} />

      {/* Error Message */}
      {sendError && (
        <div className="px-4 pb-2 flex items-center gap-2 bg-white dark:bg-zinc-900">
          <span className="text-xs text-red-500">{sendError}</span>
          <button
            onClick={() => setSendError(null)}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </>
  );
}
