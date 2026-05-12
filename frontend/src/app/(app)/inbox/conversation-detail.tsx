'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { inboxApi, ocrApi, conversationOpsApi, type Conversation, type Message, type Analysis } from '@/lib/api';
import { useAsync, useWebSocketEvent } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/avatar';
import { ChannelBadge } from '@/components/channel-icon';
import { StatusBadge } from '@/components/status-badge';
import { MessageListSkeleton } from '@/components/skeletons';
import { MessageBubble } from './message-bubble';
import { SendBar, type SendBarHandle } from './send-bar';
import { WatchingIndicator } from '@/components/inbox/watching-indicator';
import { NudgeButton } from '@/components/inbox/nudge-button';
import { InternalNoteBubble } from '@/components/inbox/internal-note-bubble';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  Brain,
  ChevronDown,
  ChevronUp,
  Search,
  Loader2,
  X,
  Lightbulb,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationDetailProps {
  conversationId: string | number;
  onClose: () => void;
  /** 手機版返回列表 */
  onBack?: () => void;
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
    <div className="bg-zinc-50 border border-zinc-200 dark:bg-zinc-800/50 dark:border-zinc-700/50 rounded-lg p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
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
      <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50">
        <p className="text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5" />
          點擊「深度分析」查看 AI 建議
        </p>
      </div>
    );
  }

  if (!suggestedReply) return null;

  return (
    <div className="mx-4 mb-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-purple-500/5 to-indigo-500/5 dark:from-purple-500/10 dark:to-indigo-500/10 border border-purple-500/20 dark:border-purple-500/30">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Lightbulb className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
        <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">AI 建議回覆</span>
      </div>
      <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed mb-2">{suggestedReply}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onUse(suggestedReply)}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-purple-500 text-white hover:bg-purple-600 transition-colors"
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
  const [sendError, setSendError] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
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

  useEffect(() => {
    setLocalMessages([]);
    prevMsgCountRef.current = 0;
  }, [conversationId]);

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

  // WebSocket：對話被接管/歸還/求援/已解決時刷新
  const refreshOnEvent = useCallback((data: unknown) => {
    const payload = data as { conversation_id?: string } | undefined;
    if (payload?.conversation_id && String(payload.conversation_id) === String(conversationId)) {
      refetch();
    }
  }, [conversationId, refetch]);
  useWebSocketEvent('conversation.assigned', refreshOnEvent);
  useWebSocketEvent('conversation.escalated', refreshOnEvent);
  useWebSocketEvent('conversation.resolved', refreshOnEvent);
  // v1.1：主管監看 + 強制接管事件也觸發刷新
  useWebSocketEvent('supervisor.watching', refreshOnEvent);
  useWebSocketEvent('conversation.force_taken', refreshOnEvent);

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
    lastSentRef.current = Date.now();
  }, []);

  const handleSendError = useCallback((err: string) => {
    setSendError(err);
  }, []);

  // ── AI Suggestion Use ──

  const handleAiSuggestionUse = useCallback((text: string) => {
    sendBarRef.current?.setTextAndFocus(text);
  }, []);

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

  const handleAnalyze = async () => {
    if (!conv || analyzing) return;
    setAnalyzing(true);
    try {
      await inboxApi.analyzeConversation(conv.id);
      setTimeout(() => refetch(), 2000);
    } catch {
      // ignore
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
  const isManager = user?.role === 'admin' || user?.role === 'manager';
  const canNudge = isManager && !!conv.current_handler_id && String(conv.current_handler_id) !== String(user?.id);

  return (
    <>
      {/* Header */}
      <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
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
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
              {conv.contact?.name || '未知客戶'}
            </h2>
            <div className="flex items-center gap-2">
              <ChannelBadge channel={conv.channel} />
              <StatusBadge status={conv.status} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDateTime(conv.started_at)}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {conv.message_count} 則
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing}
            aria-label="深度分析"
            className="text-zinc-500 hover:text-purple-500 dark:text-zinc-400 dark:hover:text-purple-400"
          >
            {analyzing ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5 mr-1" />
            )}
            {analyzing ? '分析中...' : '深度分析'}
          </Button>

          {canNudge && (
            <NudgeButton
              conversationId={conv.id}
              defaultAgentId={conv.current_handler_id ?? null}
              onSent={refetch}
            />
          )}

          {isOpen && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResolve}
              disabled={resolving}
              className="text-zinc-500 hover:text-emerald-500 dark:text-zinc-400 dark:hover:text-emerald-400"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {resolving ? '處理中...' : '標記已解決'}
            </Button>
          )}
        </div>
      </div>

      {/* v1.1：主管監看指示（PRD §F3.3） */}
      <WatchingIndicator watchers={conv.watchers} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-1">
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
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 space-y-2 max-h-60 overflow-y-auto flex-shrink-0">
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            AI 分析摘要
          </h3>
          {conv.analyses.map((a) => (
            <AnalysisCard key={a.id} analysis={a} />
          ))}
        </div>
      )}

      {/* AI Suggestion */}
      <AiSuggestionCard analyses={conv.analyses} onUse={handleAiSuggestionUse} />

      {/* Message Input Area */}
      <SendBar
        ref={sendBarRef}
        conversationId={conversationId}
        onMessageSent={handleMessageSent}
        onError={handleSendError}
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
