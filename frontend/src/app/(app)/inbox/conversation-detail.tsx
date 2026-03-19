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
  Search,
  Loader2,
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
            : 'bg-blue-600 text-white rounded-br-md'
        )}
      >
        {/* Image message */}
        {message.message_type === 'image' && message.media_url && (
          <div className="mb-2">
            <div className="w-48 h-36 bg-zinc-200 dark:bg-zinc-700 rounded-lg flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
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

        {/* Quick Intent Badge */}
        {message.quick_intent && (
          <span className={cn(
            'inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium border',
            message.quick_intent === '投訴' && 'bg-red-500/20 text-red-600 dark:text-red-300 border-red-500/30',
            message.quick_intent === '詢價' && 'bg-orange-500/20 text-orange-600 dark:text-orange-300 border-orange-500/30',
            message.quick_intent === '規格' && 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-500/30',
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
          <span className={cn('text-[10px]', isCustomer ? 'text-zinc-400 dark:text-zinc-500' : 'text-blue-200')}>
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

export function ConversationDetail({ conversationId, onClose }: ConversationDetailProps) {
  const [closing, setClosing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

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

  const handleAnalyze = async () => {
    if (!conv || analyzing) return;
    setAnalyzing(true);
    try {
      await inboxApi.analyzeConversation(conv.id);
      // 等待一下再刷新（分析可能需要時間）
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
          {/* Metadata */}
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
        {conv.messages && conv.messages.length > 0 ? (
          conv.messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        ) : (
          <p className="text-center text-sm text-zinc-500 py-8">尚無訊息</p>
        )}
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
    </>
  );
}
