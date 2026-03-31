'use client';

import { useState } from 'react';
import type { Message } from '@/lib/api';
import {
  Paperclip,
  Check,
  CheckCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MessageBubbleProps {
  message: Message;
  onOcr?: (mediaUrl: string) => void;
}

export function MessageBubble({ message, onOcr }: MessageBubbleProps) {
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
