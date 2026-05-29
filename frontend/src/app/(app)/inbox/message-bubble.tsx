'use client';

import { useState } from 'react';
import { inboxMessageActionsApi, type Message, type MessageActionResponse } from '@/lib/api';
import {
  Bot,
  Paperclip,
  Check,
  CheckCheck,
  MoreVertical,
  Reply,
  SmilePlus,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Forward,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MessageBubbleProps {
  message: Message;
  onOcr?: (mediaUrl: string) => void;
  channel?: string;
  onReply?: (message: Message) => void;
  onRefresh?: () => void;
  onError?: (error: string) => void;
}

type BotButton = {
  label: string;
  callbackData?: string;
  url?: string;
};

const INTERACTIVE_MESSAGE_TYPES = new Set(['interactive', 'button', 'callback_query']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function buttonFromUnknown(value: unknown): BotButton | null {
  if (typeof value === 'string' && value.trim()) {
    return { label: value.trim() };
  }
  if (!isRecord(value)) return null;

  const label =
    getString(value.text) ||
    getString(value.title) ||
    getString(value.label) ||
    getString(value.name);
  const callbackData =
    getString(value.callback_data) ||
    getString(value.callbackData) ||
    getString(value.data) ||
    getString(value.value);
  const url = getString(value.url);

  if (!label && !callbackData && !url) return null;
  return {
    label: label || callbackData || url || '按鈕',
    callbackData,
    url,
  };
}

function collectButtons(value: unknown): BotButton[][] {
  if (!Array.isArray(value)) return [];

  if (value.every((item) => Array.isArray(item))) {
    return value
      .map((row) => (row as unknown[]).map(buttonFromUnknown).filter((item): item is BotButton => Boolean(item)))
      .filter((row) => row.length > 0);
  }

  const row = value.map(buttonFromUnknown).filter((item): item is BotButton => Boolean(item));
  return row.length > 0 ? [row] : [];
}

function getInteractivePayload(message: Message): Record<string, unknown> {
  const payload = message.interactive_payload ?? message.message_metadata ?? message.metadata;
  return isRecord(payload) ? payload : {};
}

function getNestedRecord(source: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = source[key];
  return isRecord(value) ? value : undefined;
}

function extractButtonRows(payload: Record<string, unknown>): BotButton[][] {
  const replyMarkup = getNestedRecord(payload, 'reply_markup');
  const payloadMessage = getNestedRecord(payload, 'message');
  const payloadMessageReplyMarkup = payloadMessage ? getNestedRecord(payloadMessage, 'reply_markup') : undefined;
  const callbackQuery = getNestedRecord(payload, 'callback_query');
  const callbackMessage = callbackQuery ? getNestedRecord(callbackQuery, 'message') : undefined;
  const callbackReplyMarkup = callbackMessage ? getNestedRecord(callbackMessage, 'reply_markup') : undefined;

  const sources = [
    payload.inline_keyboard,
    payload.buttons,
    payload.keyboard,
    replyMarkup?.inline_keyboard,
    replyMarkup?.keyboard,
    payloadMessageReplyMarkup?.inline_keyboard,
    payloadMessageReplyMarkup?.keyboard,
    callbackReplyMarkup?.inline_keyboard,
    callbackReplyMarkup?.keyboard,
  ];

  for (const source of sources) {
    const rows = collectButtons(source);
    if (rows.length > 0) return rows;
  }

  const singleButton = buttonFromUnknown(payload.button);
  return singleButton ? [[singleButton]] : [];
}

function extractCallbackData(payload: Record<string, unknown>): string | undefined {
  const callbackQuery = getNestedRecord(payload, 'callback_query');
  const button = getNestedRecord(payload, 'button');
  return (
    getString(payload.callback_data) ||
    getString(payload.callbackData) ||
    getString(payload.data) ||
    getString(callbackQuery?.data) ||
    getString(button?.callback_data) ||
    getString(button?.data)
  );
}

function formatChannel(channel?: string): string {
  const labels: Record<string, string> = {
    line: 'LINE',
    messenger: 'Messenger',
    instagram: 'Instagram',
  };
  return channel ? (labels[channel] || channel) : '';
}

function BotInteractionBlock({ message }: { message: Message }) {
  const payload = getInteractivePayload(message);
  const rows = extractButtonRows(payload);
  const callbackData = extractCallbackData(payload);
  const title =
    getString(payload.title) ||
    getString(payload.text) ||
    getString(payload.prompt) ||
    (message.message_type === 'callback_query' ? 'Callback query' : 'Bot interactive message');

  return (
    <div className="mb-2 rounded-lg border border-purple-200 bg-[#F5F3FF] p-2.5 text-[#312E81] dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-100">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#7C3AED] dark:text-purple-300">
        <Bot className="h-3.5 w-3.5" />
        機器人互動
      </div>
      {title && (
        <p className="mb-2 text-xs leading-relaxed text-[#312E81] dark:text-purple-100">
          {title}
        </p>
      )}
      {rows.length > 0 ? (
        <div className="space-y-1.5">
          {rows.map((row, rowIndex) => (
            <div key={`row-${rowIndex}`} className="flex flex-wrap gap-1.5">
              {row.map((button, buttonIndex) => (
                <button
                  key={`${button.label}-${buttonIndex}`}
                  type="button"
                  disabled
                  className="max-w-full rounded-md border border-purple-200 bg-white px-2 py-1 text-left text-[11px] font-medium text-[#312E81] opacity-90 dark:border-purple-500/30 dark:bg-zinc-900 dark:text-purple-100"
                  title={button.callbackData || button.url || button.label}
                >
                  <span className="block truncate">{button.label}</span>
                  {(button.callbackData || button.url) && (
                    <span className="block truncate text-[10px] font-normal text-purple-500 dark:text-purple-300">
                      {button.callbackData || button.url}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-purple-500 dark:text-purple-300">
          已記錄互動事件
        </p>
      )}
      {callbackData && (
        <div className="mt-2 rounded-md bg-white/70 px-2 py-1 text-[11px] text-purple-600 dark:bg-zinc-900/70 dark:text-purple-300">
          callback data：{callbackData}
        </div>
      )}
    </div>
  );
}

function reactionSummary(reactions?: Record<string, string[]>): Array<{ emoji: string; count: number }> {
  return Object.entries(reactions || {})
    .map(([emoji, users]) => ({ emoji, count: Array.isArray(users) ? users.length : 0 }))
    .filter((item) => item.count > 0);
}

export function MessageBubble({ message, onOcr, channel, onReply, onRefresh, onError }: MessageBubbleProps) {
  const isCustomer = message.sender_type === 'customer';
  const isSystem = message.sender_type === 'system';
  const [imgError, setImgError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const isInteractive = INTERACTIVE_MESSAGE_TYPES.has(message.message_type);
  const reactions = reactionSummary(message.reactions);
  const isTelegram = channel === 'telegram';

  const reportActionNotice = (text: string) => {
    setActionNotice(text);
    onError?.(text);
  };

  const runNativeAction = async (action: () => Promise<MessageActionResponse>) => {
    if (!isTelegram) {
      reportActionNotice('此渠道不支援 Telegram 原生操作');
      setMenuOpen(false);
      return;
    }
    try {
      const result = await action();
      if (result.platform_supported === false) {
        reportActionNotice(result.platform_message || '尚未支援 Telegram 原生操作');
      }
      onRefresh?.();
    } catch (err) {
      reportActionNotice(err instanceof Error ? err.message : '訊息操作失敗');
    } finally {
      setMenuOpen(false);
    }
  };

  const handleEdit = () => {
    const nextContent = window.prompt('編輯訊息', message.content || '');
    if (nextContent === null) return;
    runNativeAction(() => inboxMessageActionsApi.edit(message.id, nextContent));
  };

  const handleDelete = () => {
    if (!window.confirm('確定要刪除此訊息？')) return;
    runNativeAction(() => inboxMessageActionsApi.delete(message.id, 'everyone'));
  };

  const handleForward = () => {
    const targetConversationId = window.prompt('輸入目標 conversation id');
    if (!targetConversationId) return;
    runNativeAction(() => inboxMessageActionsApi.forward(message.id, targetConversationId));
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2 mb-3.5', isCustomer ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'relative group max-w-[68%] rounded-[14px] px-3.5 py-2.5 shadow-sm',
          isCustomer
            ? 'bg-white text-[#111827] border border-[#E5E7EB] dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700 rounded-bl-md'
            : 'bg-[#EEF2FF] text-[#1E1B4B] border border-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-100 dark:border-indigo-500/20 rounded-br-md'
        )}
      >
        <div className={cn('absolute top-1 z-10', isCustomer ? '-right-8' : '-left-8')}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="訊息操作"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded-md border border-zinc-200 bg-white p-1 text-zinc-400 shadow-sm transition hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:text-zinc-200"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div className={cn('absolute top-7 w-40 rounded-lg border border-zinc-200 bg-white py-1 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900', isCustomer ? 'right-0' : 'left-0')}>
              <button type="button" onClick={() => { onReply?.(message); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <Reply className="w-3.5 h-3.5" /> 回覆
              </button>
              <button type="button" onClick={() => runNativeAction(() => inboxMessageActionsApi.addReaction(message.id, '👍'))} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <SmilePlus className="w-3.5 h-3.5" /> 反應 👍
              </button>
              <button type="button" onClick={() => runNativeAction(() => message.pinned_at ? inboxMessageActionsApi.unpin(message.id) : inboxMessageActionsApi.pin(message.id))} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800">
                {message.pinned_at ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                {message.pinned_at ? '取消釘選' : '釘選'}
              </button>
              {!isCustomer && !message.deleted_at && (
                <button type="button" onClick={handleEdit} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800">
                  <Pencil className="w-3.5 h-3.5" /> 編輯
                </button>
              )}
              {!message.deleted_at && (
                <button type="button" onClick={handleDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                  <Trash2 className="w-3.5 h-3.5" /> 刪除
                </button>
              )}
              <button type="button" onClick={handleForward} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <Forward className="w-3.5 h-3.5" /> 轉發
              </button>
            </div>
          )}
        </div>

        {message.pinned_at && (
          <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            <Pin className="w-3 h-3" />
            已釘選
          </div>
        )}

        {message.reply_to_message_id && (
          <div className="mb-1.5 rounded-md border-l-2 border-[#7C3AED] bg-white/60 px-2 py-1 text-[11px] text-[#6B7280] dark:bg-zinc-900/40 dark:text-zinc-400">
            回覆訊息 #{message.reply_to_message_id.slice(0, 8)}
          </div>
        )}

        {message.deleted_at ? (
          <p className="text-sm italic text-zinc-400 dark:text-zinc-500">訊息已刪除</p>
        ) : (
          <>
            {/* Image message */}
            {message.message_type === 'image' && message.media_url && (
              <div className="mb-2">
                {imgError ? (
                  <div className="w-48 h-36 bg-zinc-200 dark:bg-zinc-700 rounded-lg flex flex-col items-center justify-center gap-1.5">
                    <span className="text-xs text-zinc-400">圖片已過期或無法載入</span>
                    <button
                      onClick={() => setImgError(false)}
                      className="text-[11px] text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      重新載入
                    </button>
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
                        aria-label="辨識名片"
                        className="mt-1 text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                      >
                        <span role="img" aria-hidden="true">📇</span> 辨識名片
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

            {/* Bot interactive / callback record */}
            {isInteractive && (
              <BotInteractionBlock message={message} />
            )}

            {/* Text content */}
            {message.content && (
              <p className="text-sm whitespace-pre-wrap break-words leading-[1.55]">{message.content}</p>
            )}
          </>
        )}

        {reactions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {reactions.map((reaction) => (
              <span
                key={reaction.emoji}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white/80 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300"
              >
                {reaction.emoji}
                <span>{reaction.count}</span>
              </span>
            ))}
          </div>
        )}

        {actionNotice && (
          <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            {actionNotice}
          </div>
        )}

        {message.edited_at && !message.deleted_at && (
          <div className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">已編輯</div>
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
            'flex items-center gap-1 mt-1.5',
            isCustomer ? 'justify-start' : 'justify-end'
          )}
        >
          <span className={cn('text-[10px]', isCustomer ? 'text-[#9CA3AF] dark:text-zinc-500' : 'text-indigo-500 dark:text-indigo-200')}>
            {[
              formatChannel(channel),
              message.timestamp ? new Date(message.timestamp).toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit',
              }) : '',
              !isCustomer ? (message.is_read ? '已讀' : '已送出') : '',
            ].filter(Boolean).join(' · ')}
          </span>
          {!isCustomer && (
            message.is_read ? (
              <CheckCheck className="w-3 h-3 text-indigo-400 dark:text-indigo-200" />
            ) : (
              <Check className="w-3 h-3 text-indigo-300/70" />
            )
          )}
        </div>
      </div>
    </div>
  );
}
