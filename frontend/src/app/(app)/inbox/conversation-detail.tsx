'use client';

import { useState } from 'react';
import { inboxApi, type Conversation, type Message, type Analysis } from '@/lib/api';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationDetailProps {
  conversationId: number;
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

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MessageBubble({ message }: { message: Message }) {
  const isCustomer = message.sender_type === 'customer';
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-zinc-500 bg-zinc-800/50 rounded-full px-3 py-1">
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
            ? 'bg-zinc-800 text-zinc-100 rounded-bl-md'
            : 'bg-blue-600 text-white rounded-br-md'
        )}
      >
        {/* Image message */}
        {message.message_type === 'image' && message.media_url && (
          <div className="mb-2">
            <div className="w-48 h-36 bg-zinc-700 rounded-lg flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-zinc-500" />
            </div>
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

        {/* Meta */}
        <div
          className={cn(
            'flex items-center gap-1 mt-1',
            isCustomer ? 'justify-start' : 'justify-end'
          )}
        >
          <span className={cn('text-[10px]', isCustomer ? 'text-zinc-500' : 'text-blue-200')}>
            {new Date(message.timestamp).toLocaleTimeString('zh-TW', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {!isCustomer && (
            message.is_read ? (
              <CheckCheck className="w-3 h-3 text-blue-200" />
            ) : (
              <Check className="w-3 h-3 text-blue-300/50" />
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
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-zinc-200">{analysis.analysis_type}</span>
          <span className="text-xs text-zinc-500">{analysis.model_used}</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        )}
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-zinc-700/50">
          <pre className="text-xs text-zinc-300 whitespace-pre-wrap overflow-auto max-h-60">
            {JSON.stringify(analysis.result, null, 2)}
          </pre>
          <p className="text-[10px] text-zinc-500 mt-2">
            分析於 {formatDateTime(analysis.created_at)}
          </p>
        </div>
      )}
    </div>
  );
}

export function ConversationDetail({ conversationId, onClose }: ConversationDetailProps) {
  const [closing, setClosing] = useState(false);

  const { data: conv, loading, error, refetch } = useAsync<Conversation>(
    () => inboxApi.getConversation(conversationId),
    [conversationId]
  );

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

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>;
  if (!conv) return null;

  return (
    <>
      {/* Header */}
      <div className="h-14 border-b border-zinc-800 px-6 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Avatar
            name={conv.contact?.name || '未知'}
            url={conv.contact?.avatar_url}
            size="sm"
          />
          <div>
            <h2 className="text-sm font-semibold text-white">
              {conv.contact?.name || '未知客戶'}
            </h2>
            <div className="flex items-center gap-2">
              <ChannelBadge channel={conv.channel} />
              <StatusBadge status={conv.status} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDateTime(conv.started_at)}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {conv.message_count} 則訊息
            </span>
          </div>

          {conv.status === 'active' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={closing}
              className="text-zinc-400 hover:text-red-400"
            >
              <XCircle className="w-3.5 h-3.5 mr-1" />
              {closing ? '關閉中...' : '關閉對話'}
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-1">
        {conv.messages && conv.messages.length > 0 ? (
          conv.messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        ) : (
          <p className="text-center text-sm text-zinc-500 py-8">尚無訊息</p>
        )}
      </div>

      {/* Analyses */}
      {conv.analyses && conv.analyses.length > 0 && (
        <div className="border-t border-zinc-800 p-4 space-y-2 max-h-60 overflow-y-auto flex-shrink-0">
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            🧠 AI 分析摘要
          </h3>
          {conv.analyses.map((a) => (
            <AnalysisCard key={a.id} analysis={a} />
          ))}
        </div>
      )}
    </>
  );
}
