'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { inboxApi, inboxSendApi, uploadApi, quickRepliesApi, ocrApi, type Conversation, type Message, type Analysis, type QuickReplyItem, type OcrResult } from '@/lib/api';
import { mockQuickReplies, getConversationAnalysis } from '@/lib/mock-data';
import { useAsync } from '@/lib/hooks';
import { Avatar } from '@/components/avatar';
import { ChannelBadge } from '@/components/channel-icon';
import { StatusBadge } from '@/components/status-badge';
import { LoadingSpinner } from '@/components/loading';
import { Button } from '@/components/ui/button';
import {
  XCircle,
  Clock,
  MessageSquare,
  Brain,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Paperclip,
  Check,
  CheckCheck,
  Search,
  Loader2,
  Send,
  Zap,
  X,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationDetailProps {
  conversationId: string | number;
  onClose: () => void;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MessageBubble({ message, onOcr }: { message: Message; onOcr?: (mediaUrl: string) => void }) {
  const isCustomer = message.sender_type === 'customer';
  const isSystem = message.sender_type === 'system';
  const [imgError, setImgError] = useState(false);

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800/50 rounded-full px-3 py-1">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2 mb-3', isCustomer ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2.5',
          isCustomer
            ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 rounded-bl-md'
            : 'bg-indigo-600 text-white rounded-br-md'
        )}
      >
        {/* Image message */}
        {message.message_type === 'image' && message.media_url && (
          <div className="mb-2">
            {imgError ? (
              <div className="w-48 h-36 bg-zinc-200 dark:bg-zinc-700 rounded-lg flex items-center justify-center">
                <span className="text-xs text-zinc-400">圖片已過期</span>
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.media_url}
                  alt="image"
                  className="max-w-[240px] max-h-[180px] object-cover rounded-lg cursor-pointer"
                  onClick={() => window.open(message.media_url!, '_blank')}
                  onError={() => setImgError(true)}
                />
                {onOcr && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOcr(message.media_url!); }}
                    className="mt-1 text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                  >
                    📇 辨識名片
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Sticker */}
        {message.message_type === 'sticker' && (
          <div className="text-3xl mb-1">🏷️</div>
        )}

        {/* Attachment */}
        {message.message_type === 'attachment' && (
          <div className="flex items-center gap-2 mb-1">
            <Paperclip className="w-4 h-4" />
            <span className="text-xs underline">附件</span>
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        )}

        {/* Quick Intent Badge */}
        {message.quick_intent && (
          <span className={cn(
            'inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium border',
            message.quick_intent === '投訴' && 'bg-red-500/20 text-red-600 dark:text-red-300 border-red-500/30',
            message.quick_intent === '詢價' && 'bg-orange-500/20 text-orange-600 dark:text-orange-300 border-orange-500/30',
            message.quick_intent === '規格' && 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border-indigo-500/30',
            message.quick_intent === '參觀' && 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
            message.quick_intent === '下單' && 'bg-green-500/20 text-green-600 dark:text-green-300 border-green-500/30',
            message.quick_intent === '招呼' && 'bg-zinc-500/20 text-zinc-600 dark:text-zinc-300 border-zinc-500/30',
            message.quick_intent === '跟進' && 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/30',
            !['投訴','詢價','規格','參觀','下單','招呼','跟進'].includes(message.quick_intent) && 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/30',
          )}>
            {message.quick_intent}
          </span>
        )}

        {/* Meta */}
        <div
          className={cn(
            'flex items-center gap-1 mt-1',
            isCustomer ? 'justify-start' : 'justify-end'
          )}
        >
          <span className={cn('text-[10px]', isCustomer ? 'text-zinc-400 dark:text-zinc-500' : 'text-indigo-200')}>
            {message.timestamp ? new Date(message.timestamp).toLocaleTimeString('zh-TW', {
              hour: '2-digit',
              minute: '2-digit',
            }) : ''}
          </span>
          {!isCustomer && (
            message.is_read ? (
              <CheckCheck className="w-3 h-3 text-indigo-200" />
            ) : (
              <Check className="w-3 h-3 text-indigo-300/50" />
            )
          )}
        </div>
      </div>
    </div>
  );
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

// ── Quick Replies Panel ────────────────────────────────

function QuickRepliesPanel({ onSelect, onClose }: { onSelect: (text: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [apiReplies, setApiReplies] = useState<QuickReplyItem[]>([]);
  const [apiLoaded, setApiLoaded] = useState(false);

  // Try loading from API on mount
  useEffect(() => {
    quickRepliesApi.getAll()
      .then((res) => {
        if (res.data && res.data.length > 0) {
          setApiReplies(res.data);
        }
        setApiLoaded(true);
      })
      .catch(() => {
        // API unavailable, fall back to mock data
        setApiLoaded(true);
      });
  }, []);

  // Search from API when search changes
  useEffect(() => {
    if (!search.trim() || !apiLoaded || apiReplies.length === 0) return;
    const timer = setTimeout(() => {
      quickRepliesApi.search(search)
        .then((res) => {
          if (res.data && res.data.length > 0) {
            setApiReplies(res.data);
          }
        })
        .catch(() => {
          // Search failed, keep existing replies
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, apiLoaded, apiReplies.length]);

  // Use API replies if available, else fallback to mock
  const useApi = apiReplies.length > 0;

  const categories = useApi
    ? Array.from(new Set(apiReplies.map((r) => r.category)))
    : Array.from(new Set(mockQuickReplies.map((r) => r.category)));

  const filteredMock = search
    ? mockQuickReplies.filter(
        (r) =>
          r.title.toLowerCase().includes(search.toLowerCase()) ||
          r.content.toLowerCase().includes(search.toLowerCase())
      )
    : mockQuickReplies;

  const displayItems: { id: string | number; category: string; title: string; content: string }[] = useApi
    ? apiReplies.map((r) => ({ id: r.id, category: r.category, title: r.title, content: r.content }))
    : filteredMock;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg z-50 max-h-80 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">⚡ 預存語錄</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Search */}
      <div className="px-3 pb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋語錄..."
          className="w-full text-xs bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      {/* List */}
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {categories.map((cat) => {
          const items = displayItems.filter((r) => r.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-2">
              <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-2 mb-1">
                {cat}
              </p>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelect(item.content);
                    onClose();
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700/60 transition-colors"
                >
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{item.title}</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{item.content}</p>
                </button>
              ))}
            </div>
          );
        })}
        {displayItems.length === 0 && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center py-4">無匹配語錄</p>
        )}
      </div>
    </div>
  );
}

// ── AI Suggestion Card ─────────────────────────────────

function AiSuggestionCard({
  conversationId,
  onUse,
}: {
  conversationId: string | number;
  onUse: (text: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const { hasAnalysis, suggestedReply } = getConversationAnalysis(conversationId);

  if (dismissed) return null;

  if (!hasAnalysis) {
    return (
      <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50">
        <p className="text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5" />
          點擊右側「深度分析」查看 AI 建議
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

// ── Main Component ─────────────────────────────────────

export function ConversationDetail({ conversationId, onClose }: ConversationDetailProps) {
  const [closing, setClosing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrToast, setOcrToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const ocrLoadingRef = useRef(false);
  const ocrToastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const msgCountRef = useRef(0);

  const { data: conv, loading, error, refetch } = useAsync<Conversation>(
    () => inboxApi.getConversation(conversationId),
    [conversationId]
  );

  // Reset local messages when conversation changes
  useEffect(() => {
    setLocalMessages([]);
    setInputText('');
    setImagePreview(null);
    setShowQuickReplies(false);
  }, [conversationId]);

  // Auto polling every 5 seconds (pause when tab hidden or just sent a message)
  // 使用 silent fetch 避免觸發 loading/error state → 防止不必要的 re-render 和 scroll 重置
  const lastSentRef = useRef(0);

  useEffect(() => {
    msgCountRef.current = conv?.messages?.length || 0;
  }, [conv?.messages?.length]);

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden || Date.now() - lastSentRef.current < 8000) return;
      try {
        const freshData = await inboxApi.getConversation(conversationId);
        if (freshData?.messages && freshData.messages.length > msgCountRef.current) {
          refetch();
        }
      } catch {
        // 靜默忽略所有 polling 錯誤（包含 401），不觸發 state 更新
      }
    }, 5000);
    return () => clearInterval(id);
  }, [conversationId, refetch]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }
  }, [inputText]);

  // Scroll to bottom when messages change
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const count = (conv?.messages?.length || 0) + localMessages.length;
    if (count !== prevMsgCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      prevMsgCountRef.current = count;
    }
  }, [conv?.messages, localMessages]);

  const allMessages = [
    ...(conv?.messages || []),
    ...localMessages,
  ];

  // ── Send Message ──

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    const hasImage = !!imagePreview;

    if (!text && !hasImage) return;
    if (sendingRef.current) return;

    // 發送前確認
    const confirmMsg = hasImage && text
      ? '確定要發送這則訊息和圖片？'
      : hasImage
        ? '確定要發送這張圖片？'
        : '確定要發送這則訊息？';
    if (!window.confirm(confirmMsg)) return;

    sendingRef.current = true;
    setSending(true);
    setSendError(null);

    try {
      let mediaUrl: string | undefined;

      // 如果有圖片，先上傳取得 URL
      if (hasImage) {
        try {
          const uploaded = await uploadApi.uploadImage(imagePreview.file);
          mediaUrl = uploaded.url;
        } catch {
          setSendError('圖片上傳失敗，請重試');
          setSending(false);
          return;
        }
      }

      // 呼叫 send API
      const messageType = hasImage ? 'image' as const : 'text' as const;
      const result = await inboxSendApi.sendMessage(
        conversationId,
        text,
        messageType,
        mediaUrl,
      );

      // 成功：把回傳的 message 加入本地
      if (result.data) {
        setLocalMessages((prev) => [...prev, result.data as Message]);
      } else {
        // fallback: 如果後端沒回傳完整 message，自己建一個
        const newMsg: Message = {
          id: Date.now(),
          conversation_id: conversationId,
          sender_type: 'business',
          message_type: messageType,
          content: text,
          media_url: mediaUrl || null,
          timestamp: new Date().toISOString(),
          is_read: false,
          platform_message_id: null,
        };
        setLocalMessages((prev) => [...prev, newMsg]);
      }

      setInputText('');
      setImagePreview(null);
      lastSentRef.current = Date.now(); // 防止 polling 立刻 refetch
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '發送失敗';
      setSendError(msg);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [inputText, imagePreview, conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Image Upload ──

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreview({ file, url });
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const removeImagePreview = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview.url);
      setImagePreview(null);
    }
  };

  // 清理 imagePreview URL 和 OCR toast timer（組件卸載時）
  const imagePreviewRef = useRef(imagePreview);
  imagePreviewRef.current = imagePreview;
  useEffect(() => {
    return () => {
      if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current.url);
      if (ocrToastTimerRef.current) clearTimeout(ocrToastTimerRef.current);
    };
  }, []);

  // ── Quick Reply ──

  const handleQuickReplySelect = (text: string) => {
    setInputText(text);
    setShowQuickReplies(false);
    // 用 setTimeout 確保面板關閉後再 focus，避免 scroll 跳動
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // ── AI Suggestion Use ──

  const handleAiSuggestionUse = (text: string) => {
    setInputText(text);
    textareaRef.current?.focus();
  };

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

  // ── Conversation Actions ──

  const handleClose = async () => {
    if (!conv || closing) return;
    setClosing(true);
    try {
      await inboxApi.closeConversation(conv.id);
      refetch();
      onClose();
    } catch {
      // ignore
    } finally {
      setClosing(false);
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

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>;
  if (!conv) return null;

  return (
    <>
      {/* Header */}
      <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 px-6 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDateTime(conv.started_at)}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {conv.message_count} 則訊息
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="text-zinc-500 hover:text-purple-500 dark:text-zinc-400 dark:hover:text-purple-400"
          >
            {analyzing ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5 mr-1" />
            )}
            {analyzing ? '分析中...' : '🔍 深度分析'}
          </Button>

          {conv.status === 'active' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={closing}
              className="text-zinc-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400"
            >
              <XCircle className="w-3.5 h-3.5 mr-1" />
              {closing ? '關閉中...' : '關閉對話'}
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-1">
        {allMessages.length > 0 ? (
          allMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onOcr={msg.message_type === 'image' && msg.media_url ? handleOcr : undefined}
            />
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
            🧠 AI 分析摘要
          </h3>
          {conv.analyses.map((a) => (
            <AnalysisCard key={a.id} analysis={a} />
          ))}
        </div>
      )}

      {/* AI Suggestion */}
      <AiSuggestionCard conversationId={conversationId} onUse={handleAiSuggestionUse} />

      {/* Message Input Area */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-shrink-0">
        {/* Image Preview */}
        {imagePreview && (
          <div className="px-4 pt-3">
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview.url}
                alt="preview"
                className="w-20 h-20 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700"
              />
              <button
                onClick={removeImagePreview}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Input Row */}
        <div className="px-4 py-3 flex items-end gap-2">
          {/* Quick Replies Button */}
          <div className="relative">
            <button
              onClick={() => setShowQuickReplies(!showQuickReplies)}
              className="p-2 rounded-lg text-zinc-400 hover:text-amber-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="預存語錄"
            >
              <Zap className="w-5 h-5" />
            </button>
            {showQuickReplies && (
              <QuickRepliesPanel
                onSelect={handleQuickReplySelect}
                onClose={() => setShowQuickReplies(false)}
              />
            )}
          </div>

          {/* Attachment Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            title="附件"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="輸入訊息..."
            rows={1}
            className="flex-1 bg-zinc-50 dark:bg-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none max-h-[120px]"
          />

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={sending || (!inputText.trim() && !imagePreview)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              sending
                ? 'bg-indigo-400 text-white cursor-wait'
                : inputText.trim() || imagePreview
                  ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                  : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed'
            )}
            title="發送"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>

        {/* OCR Toast */}
        {(ocrLoading || ocrToast) && (
          <div className="px-4 pb-2">
            {ocrLoading && (
              <span className="text-xs text-amber-500 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                名片辨識中...
              </span>
            )}
            {ocrToast && (
              <span className={cn('text-xs', ocrToast.type === 'success' ? 'text-green-500' : 'text-red-500')}>
                {ocrToast.message}
              </span>
            )}
          </div>
        )}

        {/* Error Message */}
        {sendError && (
          <div className="px-4 pb-2 flex items-center gap-2">
            <span className="text-xs text-red-500">{sendError}</span>
            <button
              onClick={() => setSendError(null)}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
