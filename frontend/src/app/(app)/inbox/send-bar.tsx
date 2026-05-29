'use client';

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { inboxSendApi, uploadApi, quickRepliesApi, type Message, type QuickReplyItem, type QuickReplyAttachment } from '@/lib/api';
import { EscalationButton } from '@/components/inbox/escalation-button';
import {
  ChevronDown,
  Image as ImageIcon,
  Paperclip,
  Loader2,
  Search,
  Send,
  Zap,
  X,
  StickyNote,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const REPLY_STARTERS = [
  {
    label: '溫和回覆',
    text: '您好，謝謝您的詢問。我先幫您確認需求，稍後整理最適合的建議給您。',
  },
  {
    label: '報價說明',
    text: '您好，岩板報價會依材質、尺寸、加工方式與施工範圍調整。可以先提供尺寸與施作位置，我幫您整理初步價格區間。',
  },
  {
    label: '邀約丈量',
    text: '如果方便的話，我們可以先安排現場丈量，確認尺寸與施工條件後再提供更準確的報價。',
  },
];

const QUICK_REPLY_CATEGORY_LABELS: Record<string, string> = {
  basin: '一體盆',
  dimension: '尺寸規格',
  dm: 'DM資料',
  follow_up: '回訪跟進',
  general: '通用回覆',
  hot_bend: '熱彎',
  identity: '身分確認',
  material: '材質說明',
  needs: '需求確認',
  project_info: '案場資訊',
  store: '商城',
  visit: '參訪邀約',
};

// ── Quick Replies Panel ────────────────────────────────

function QuickRepliesPanel({ onSelect, onClose }: { onSelect: (text: string, attachments?: QuickReplyAttachment[]) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [allReplies, setAllReplies] = useState<QuickReplyItem[]>([]);
  const [displayItems, setDisplayItems] = useState<QuickReplyItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    quickRepliesApi.getAll()
      .then((res) => {
        const replies = res.data || [];
        const categoryList = res.categories && res.categories.length > 0
          ? res.categories
          : Array.from(new Set(replies.map((r) => r.category))).sort();

        setAllReplies(replies);
        setDisplayItems(replies);
        setCategories(categoryList);
        setError(null);
      })
      .catch(() => setError('無法載入快捷回覆'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    const category = selectedCategory === 'all' ? undefined : selectedCategory;
    const queryText = search.trim();

    const timer = setTimeout(() => {
      if (!queryText) {
        setDisplayItems(category ? allReplies.filter((item) => item.category === category) : allReplies);
        return;
      }

      quickRepliesApi.search(queryText, category)
        .then((res) => setDisplayItems(res.data || []))
        .catch(() => {
          const q = queryText.toLowerCase();
          const local = allReplies.filter((item) => {
            const inCategory = !category || item.category === category;
            const haystack = [
              item.title,
              item.content,
              item.category,
              QUICK_REPLY_CATEGORY_LABELS[item.category],
              ...(item.trigger_keywords || []),
            ].filter(Boolean).join(' ').toLowerCase();
            return inCategory && haystack.includes(q);
          });
          setDisplayItems(local);
        });
    }, 180);

    return () => clearTimeout(timer);
  }, [allReplies, loading, search, selectedCategory]);

  const categoryCounts = allReplies.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const groupedItems = categories
    .filter((cat) => selectedCategory === 'all' || cat === selectedCategory)
    .map((cat) => ({
      category: cat,
      items: displayItems.filter((item) => item.category === cat),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[min(440px,calc(100vw-2rem))] bg-white dark:bg-zinc-900 border border-[#E5E7EB] dark:border-zinc-700 rounded-xl shadow-xl z-50 max-h-[440px] flex flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1F2933] dark:text-zinc-100">
          <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
          快捷回覆
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉快捷回覆"
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-2 px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋標題、內容、關鍵字或分類"
            aria-label="搜尋快捷回覆"
            className="w-full text-xs bg-[#F7F8FA] dark:bg-zinc-800 border border-[#E5E7EB] dark:border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-[#1F2933] dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={cn(
              'flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
              selectedCategory === 'all'
                ? 'border-[#DDD6FE] bg-[#F5F3FF] text-[#7C3AED]'
                : 'border-[#E5E7EB] text-[#6B7280] hover:bg-[#F7F8FA] dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
            )}
          >
            全部 {allReplies.length}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                selectedCategory === cat
                  ? 'border-[#DDD6FE] bg-[#F5F3FF] text-[#7C3AED]'
                  : 'border-[#E5E7EB] text-[#6B7280] hover:bg-[#F7F8FA] dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
              )}
            >
              {QUICK_REPLY_CATEGORY_LABELS[cat] || cat} {categoryCounts[cat] || 0}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            載入快捷回覆
          </div>
        ) : error ? (
          <p className="px-3 py-6 text-center text-xs text-red-500">{error}</p>
        ) : groupedItems.length > 0 ? (
          groupedItems.map((group) => (
            <div key={group.category} className="mb-2">
              <p className="sticky top-0 z-10 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
                {QUICK_REPLY_CATEGORY_LABELS[group.category] || group.category}
              </p>
              {group.items.map((item) => {
                const imageAttachments = (item.attachments || []).filter((a) => a.type === 'image');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelect(item.content, item.attachments);
                      onClose();
                    }}
                    className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#F7F8FA] dark:hover:bg-zinc-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[#1F2933] dark:text-zinc-100">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[#6B7280] dark:text-zinc-400">{item.content}</p>
                      </div>
                      {imageAttachments.length > 0 && (
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-[#F5F3FF] px-1.5 py-0.5 text-[10px] text-[#7C3AED]">
                          <ImageIcon className="h-3 w-3" />
                          {imageAttachments.length}
                        </span>
                      )}
                    </div>
                    {imageAttachments.length > 0 && (
                      <div className="mt-2 flex gap-1">
                        {imageAttachments.slice(0, 4).map((att, i) => (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img key={`${att.url}-${i}`} src={att.url} alt={att.label || '快捷回覆圖片'} className="h-9 w-9 rounded border border-[#E5E7EB] object-cover dark:border-zinc-700" />
                        ))}
                        {imageAttachments.length > 4 && (
                          <span className="flex h-9 w-9 items-center justify-center rounded border border-[#E5E7EB] text-[10px] text-zinc-400 dark:border-zinc-700">
                            +{imageAttachments.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        ) : (
          <p className="px-3 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">沒有符合條件的快捷回覆</p>
        )}
      </div>
    </div>
  );
}

// ── SendBar Props ──────────────────────────────────────

export interface SendBarProps {
  conversationId: string | number;
  onMessageSent: (msg: Message) => void;
  onError: (error: string) => void;
  replyToMessage?: Message | null;
  onCancelReply?: () => void;
  /** 當前對話的 current_handler_id（給 AssignMenu 高亮用） */
  currentHandlerId?: string | null;
  /** 對話操作（求援/分配）後通知父層 refetch */
  onConversationChanged?: () => void;
}

export interface SendBarHandle {
  setTextAndFocus: (text: string) => void;
}

// ── SendBar Component ──────────────────────────────────

export const SendBar = forwardRef<SendBarHandle, SendBarProps>(function SendBar({
  conversationId,
  onMessageSent,
  onError,
  replyToMessage,
  onCancelReply,
  onConversationChanged,
}, ref) {
  const [inputText, setInputText] = useState('');
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<QuickReplyAttachment[]>([]);
  const [isInternal, setIsInternal] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);

  // Reset state when conversation changes
  useEffect(() => {
    setInputText('');
    setImagePreview(null);
    setShowQuickReplies(false);
    setPendingAttachments([]);
    setIsInternal(false);
  }, [conversationId]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }
  }, [inputText]);

  // 清理 imagePreview URL
  const imagePreviewRef = useRef(imagePreview);
  imagePreviewRef.current = imagePreview;
  useEffect(() => {
    return () => {
      if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current.url);
    };
  }, []);

  // ── Send Message ──

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    const hasImage = !!imagePreview;
    const hasQuickReplyImages = pendingAttachments.length > 0;

    if (!text && !hasImage && !hasQuickReplyImages) return;
    if (sendingRef.current) return;

    // 內部備註模式不必確認，避免打斷團隊溝通；對外訊息保留確認
    if (!isInternal) {
      const confirmMsg = hasImage && text
        ? '確定要發送這則訊息和圖片？'
        : hasImage
          ? '確定要發送這張圖片？'
          : hasQuickReplyImages && text
            ? '確定要發送這則訊息和快捷回覆圖片？'
          : hasQuickReplyImages
            ? '確定要發送快捷回覆圖片？'
          : '確定要發送這則訊息？';
      if (!window.confirm(confirmMsg)) return;
    }

    sendingRef.current = true;
    setSending(true);

    try {
      let mediaUrl: string | undefined;

      if (hasImage) {
        try {
          const uploaded = await uploadApi.uploadImage(imagePreview.file);
          mediaUrl = uploaded.url;
          if (!mediaUrl) {
            onError('圖片上傳成功但未取得 URL');
            sendingRef.current = false;
            setSending(false);
            return;
          }
        } catch {
          onError('圖片上傳失敗，請重試');
          setSending(false);
          sendingRef.current = false;
          return;
        }
      }

      if (text || hasImage) {
        const messageType = hasImage ? 'image' as const : 'text' as const;
        const result = await inboxSendApi.sendMessage(
          conversationId,
          text,
          messageType,
          mediaUrl,
          { isInternal, replyToMessageId: replyToMessage?.id ?? null },
        );

        if (result.data) {
          onMessageSent(result.data as Message);
        } else {
          const newMsg: Message = {
            id: `local-${Date.now()}`,
            conversation_id: conversationId,
            sender_type: 'business',
            message_type: messageType,
            content: text,
            media_url: mediaUrl || null,
            timestamp: new Date().toISOString(),
            is_read: false,
            platform_message_id: null,
            reply_to_message_id: replyToMessage?.id ? String(replyToMessage.id) : null,
            is_internal: isInternal,
            mentions: [],
          };
          onMessageSent(newMsg);
        }

        // 內部備註不對外發送，所以不會有 api_error；對外訊息才檢查平台 API 結果
        if (result.api_error && !isInternal) {
          onError(`訊息已記錄但未送達客戶：${result.api_error}`);
        }
      }

      // 快捷回覆附件圖片（內部備註模式下仍可附帶，但不會送到平台）
      if (pendingAttachments.length > 0) {
        for (const att of pendingAttachments) {
          try {
            const imgResult = await inboxSendApi.sendMessage(
              conversationId,
              '',
              'image',
              att.url,
              { isInternal },
            );
            if (imgResult.data) onMessageSent(imgResult.data as Message);
          } catch {
            // 圖片附件發送失敗不阻塞
          }
        }
      }

      setInputText('');
      setImagePreview(null);
      setPendingAttachments([]);
      onCancelReply?.();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '發送失敗';
      onError(msg);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [inputText, imagePreview, pendingAttachments, conversationId, isInternal, replyToMessage?.id, onMessageSent, onError, onCancelReply]);

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
    e.target.value = '';
  };

  const removeImagePreview = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview.url);
      setImagePreview(null);
    }
  };

  // ── Quick Reply ──

  const handleQuickReplySelect = (text: string, attachments?: QuickReplyAttachment[]) => {
    const imageAttachments = attachments?.filter(a => a.type === 'image') || [];
    setInputText(text);
    setPendingAttachments(imageAttachments);
    setShowQuickReplies(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  useImperativeHandle(ref, () => ({
    setTextAndFocus(text: string) {
      setInputText(text);
      textareaRef.current?.focus();
    },
  }), []);

  return (
    <div
      className={cn(
        'border-t bg-white dark:bg-zinc-900 flex-shrink-0 transition-colors shadow-[0_-1px_0_rgba(229,231,235,0.7)]',
        isInternal
          ? 'border-yellow-400 dark:border-yellow-500/60 bg-yellow-50/40 dark:bg-yellow-500/5'
          : 'border-[#E5E7EB] dark:border-zinc-800'
      )}
    >
      {!isInternal && (
        <div className="px-4 pt-3 flex items-center gap-2 overflow-x-auto">
          <span className="flex items-center gap-1 text-[11px] font-medium text-[#7C3AED] flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
            建議回覆
          </span>
          {REPLY_STARTERS.map((starter) => (
            <button
              key={starter.label}
              onClick={() => {
                setInputText(starter.text);
                setTimeout(() => textareaRef.current?.focus(), 50);
              }}
              className="flex-shrink-0 rounded-full border border-[#DDD6FE] bg-[#F5F3FF] px-2.5 py-1 text-[11px] font-medium text-[#7C3AED] hover:bg-[#EDE9FE] transition-colors"
            >
              {starter.label}
            </button>
          ))}
        </div>
      )}

      {/* Action Row（求援 / 內部備註 toggle） */}
      <div className="px-4 pt-2 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setIsInternal((v) => !v)}
          aria-pressed={isInternal}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
            isInternal
              ? 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/40'
              : 'bg-[#F7F8FA] text-[#6B7280] border-[#E5E7EB] hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700'
          )}
        >
          <StickyNote className="w-3.5 h-3.5" />
          {isInternal ? '內部備註模式' : '切到內部備註'}
        </button>

        <EscalationButton conversationId={conversationId} onEscalated={onConversationChanged} />

      </div>

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

      {/* Pending Quick Reply Attachments */}
      {pendingAttachments.length > 0 && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase">語錄附件</span>
            <div className="flex gap-1">
              {pendingAttachments.map((att, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={i} src={att.url} alt={att.label || '附件'} className="w-10 h-10 object-cover rounded border border-zinc-200 dark:border-zinc-700" />
              ))}
            </div>
            <button
              onClick={() => setPendingAttachments([])}
              className="ml-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Reply / quote preview */}
      {replyToMessage && (
        <div className="px-4 pt-3">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-[#DDD6FE] bg-[#F5F3FF] px-3 py-2 text-xs text-[#312E81] dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-100">
            <div className="min-w-0">
              <div className="mb-0.5 font-semibold text-[#7C3AED] dark:text-purple-300">
                回覆 {replyToMessage.sender_type === 'customer' ? '客戶' : '我方'}訊息
              </div>
              <div className="truncate text-[#6B7280] dark:text-purple-200">
                {replyToMessage.deleted_at
                  ? '訊息已刪除'
                  : replyToMessage.content || (replyToMessage.message_type === 'image' ? '[圖片]' : '[非文字訊息]')}
              </div>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="取消回覆"
              className="mt-0.5 flex-shrink-0 rounded-md p-1 text-purple-400 hover:bg-purple-100 hover:text-purple-600 dark:hover:bg-purple-500/20"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Input Row */}
      <div className="px-4 py-3 flex items-end gap-2">
        {/* Quick Replies Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowQuickReplies(!showQuickReplies)}
            aria-expanded={showQuickReplies}
            aria-label="開啟快捷回覆"
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors',
              showQuickReplies
                ? 'border-[#DDD6FE] bg-[#F5F3FF] text-[#7C3AED]'
                : 'border-[#E5E7EB] text-[#6B7280] hover:bg-[#F7F8FA] dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
            )}
            title="快捷回覆"
          >
            <Zap className="w-5 h-5" />
            <span className="hidden sm:inline">快捷回覆</span>
            <ChevronDown className={cn('hidden h-3.5 w-3.5 sm:block transition-transform', showQuickReplies && 'rotate-180')} />
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
          className="p-2 rounded-lg text-zinc-400 hover:text-[#6B7280] hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          title="附件"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          aria-label="上傳圖片"
          onChange={handleImageSelect}
          className="hidden"
        />

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isInternal ? '留下內部備註，僅團隊可見' : '輸入訊息...'}
          aria-label="輸入訊息"
          rows={1}
          className={cn(
            'flex-1 rounded-xl px-4 py-2 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 resize-none max-h-[120px]',
            isInternal
              ? 'bg-yellow-50 dark:bg-yellow-500/10 text-zinc-900 dark:text-zinc-100 border border-yellow-300 dark:border-yellow-500/40 focus:ring-yellow-500'
              : 'bg-[#F7F8FA] dark:bg-zinc-800 text-[#1F2933] dark:text-zinc-100 border border-[#E5E7EB] dark:border-zinc-700 focus:ring-[#7C3AED]'
          )}
        />

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={sending || (!inputText.trim() && !imagePreview && pendingAttachments.length === 0)}
          className={cn(
            'p-2 rounded-lg transition-colors',
            sending
              ? 'bg-indigo-400 text-white cursor-wait'
              : (inputText.trim() || imagePreview || pendingAttachments.length > 0)
                ? isInternal
                  ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                  : 'bg-[#7C3AED] text-white hover:bg-[#6D28D9]'
                : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed'
          )}
          title="發送"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
});
