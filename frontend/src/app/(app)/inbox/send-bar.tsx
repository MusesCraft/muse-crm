'use client';

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { inboxSendApi, uploadApi, quickRepliesApi, type Message, type QuickReplyItem, type QuickReplyAttachment } from '@/lib/api';
import { mockQuickReplies } from '@/lib/mock-data';
import {
  Paperclip,
  Loader2,
  Send,
  Zap,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Quick Replies Panel ────────────────────────────────

function QuickRepliesPanel({ onSelect, onClose }: { onSelect: (text: string, attachments?: QuickReplyAttachment[]) => void; onClose: () => void }) {
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

  const displayItems: { id: string | number; category: string; title: string; content: string; attachments?: QuickReplyAttachment[] }[] = useApi
    ? apiReplies.map((r) => ({ id: r.id, category: r.category, title: r.title, content: r.content, attachments: r.attachments }))
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
          aria-label="搜尋語錄"
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
                    onSelect(item.content, item.attachments);
                    onClose();
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700/60 transition-colors"
                >
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{item.title}</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{item.content}</p>
                  {item.attachments && item.attachments.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {item.attachments.filter(a => a.type === 'image').slice(0, 3).map((att, i) => (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img key={i} src={att.url} alt={att.label || '附件'} className="w-8 h-8 object-cover rounded border border-zinc-200 dark:border-zinc-600" />
                      ))}
                      {item.attachments.filter(a => a.type === 'image').length > 3 && (
                        <span className="text-[10px] text-zinc-400 self-end">+{item.attachments.filter(a => a.type === 'image').length - 3}</span>
                      )}
                    </div>
                  )}
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

// ── SendBar Props ──────────────────────────────────────

export interface SendBarProps {
  conversationId: string | number;
  onMessageSent: (msg: Message) => void;
  onError: (error: string) => void;
}

export interface SendBarHandle {
  setTextAndFocus: (text: string) => void;
}

// ── SendBar Component ──────────────────────────────────

export const SendBar = forwardRef<SendBarHandle, SendBarProps>(function SendBar({ conversationId, onMessageSent, onError }, ref) {
  const [inputText, setInputText] = useState('');
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<QuickReplyAttachment[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);

  // Reset state when conversation changes
  useEffect(() => {
    setInputText('');
    setImagePreview(null);
    setShowQuickReplies(false);
    setPendingAttachments([]);
  }, [conversationId]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }
  }, [inputText]);

  // 清理 imagePreview URL（組件卸載時）
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

    try {
      let mediaUrl: string | undefined;

      // 如果有圖片，先上傳取得 URL
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

      // 呼叫 send API
      const messageType = hasImage ? 'image' as const : 'text' as const;
      const result = await inboxSendApi.sendMessage(
        conversationId,
        text,
        messageType,
        mediaUrl,
      );

      // 成功：把回傳的 message 通知父組件
      if (result.data) {
        onMessageSent(result.data as Message);
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
        onMessageSent(newMsg);
      }

      // 檢查平台 API 是否送達失敗
      if (result.api_error) {
        onError(`訊息已記錄但未送達客戶：${result.api_error}`);
      }

      // 發送快捷回覆的附件圖片
      if (pendingAttachments.length > 0) {
        for (const att of pendingAttachments) {
          try {
            const imgResult = await inboxSendApi.sendMessage(conversationId, '', 'image', att.url);
            if (imgResult.data) {
              onMessageSent(imgResult.data as Message);
            }
          } catch {
            // 圖片附件發送失敗不阻塞
          }
        }
      }

      setInputText('');
      setImagePreview(null);
      setPendingAttachments([]);
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
  }, [inputText, imagePreview, pendingAttachments, conversationId, onMessageSent, onError]);

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

  // ── Quick Reply ──

  const handleQuickReplySelect = (text: string, attachments?: QuickReplyAttachment[]) => {
    setInputText(text);
    setPendingAttachments(attachments?.filter(a => a.type === 'image') || []);
    setShowQuickReplies(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // 暴露方法給父組件（AI 建議填入等）
  useImperativeHandle(ref, () => ({
    setTextAndFocus(text: string) {
      setInputText(text);
      textareaRef.current?.focus();
    },
  }), []);

  return (
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
          placeholder="輸入訊息..."
          aria-label="輸入訊息"
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
    </div>
  );
});
