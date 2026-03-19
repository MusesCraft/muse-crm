'use client';

import { use, useState, useCallback } from 'react';
import Link from 'next/link';
import { contactsApi, actionsApi, type ContactDetail, type Action } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Avatar } from '@/components/avatar';
import { ChannelBadge } from '@/components/channel-icon';
import { StatusBadge } from '@/components/status-badge';
import { LoadingSpinner } from '@/components/loading';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Clock,
  Calendar,
  Tag,
  X,
  Plus,
  MessageSquare,
  Brain,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  StickyNote,
  Send,
  AlertTriangle,
  ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Tag Section ────────────────────────────────────────

function TagSection({
  contactId,
  tags,
  onUpdate,
}: {
  contactId: number;
  tags: { id: number; tag_name: string; category: string | null }[];
  onUpdate: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState('');

  const handleAdd = async () => {
    if (!newTag.trim()) return;
    try {
      await contactsApi.addTag(contactId, newTag.trim());
      setNewTag('');
      setAdding(false);
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleRemove = async (tagId: number) => {
    try {
      await contactsApi.removeTag(contactId, tagId);
      onUpdate();
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
          <Tag className="w-4 h-4 text-blue-400" />
          標籤
        </h3>
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          新增
        </button>
      </div>

      {adding && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="輸入標籤名稱..."
            className="flex-1 px-3 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            autoFocus
          />
          <Button size="sm" onClick={handleAdd}>
            新增
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tags.length === 0 ? (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">尚無標籤</span>
        ) : (
          tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 border border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-300"
            >
              {tag.tag_name}
              <button
                onClick={() => handleRemove(tag.id)}
                className="hover:text-red-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

// ── Conversation Timeline ──────────────────────────────

function ConversationTimeline({
  conversations,
}: {
  conversations: { id: number; channel: string; status: string; started_at: string; message_count: number }[];
}) {
  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-emerald-400" />
        對話歷史
        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">({conversations.length})</span>
      </h3>

      {conversations.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">尚無對話紀錄</p>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/inbox?id=${conv.id}`}
              className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ChannelBadge channel={conv.channel} />
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDateTime(conv.started_at)}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{conv.message_count} 則訊息</p>
                </div>
              </div>
              <StatusBadge status={conv.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Analysis Section ───────────────────────────────────

function AnalysisSection({
  analyses,
}: {
  analyses: { id: number; analysis_type: string; result: Record<string, unknown>; model_used: string; created_at: string }[];
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-purple-400" />
        AI 分析結果
        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">({analyses.length})</span>
      </h3>

      {analyses.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">尚無分析結果</p>
      ) : (
        <div className="space-y-2">
          {analyses.map((a) => (
            <div key={a.id} className="rounded-lg bg-zinc-50 dark:bg-zinc-800/30 overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                className="w-full flex items-center justify-between p-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{a.analysis_type}</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{a.model_used}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{formatDateTime(a.created_at)}</span>
                  {expandedId === a.id ? (
                    <ChevronUp className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                  )}
                </div>
              </button>
              {expandedId === a.id && (
                <div className="px-3 pb-3">
                  <pre className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap bg-zinc-100 dark:bg-zinc-900/50 rounded p-2 max-h-48 overflow-auto">
                    {JSON.stringify(a.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Actions Section ────────────────────────────────────

function ActionsSection({
  actions,
  onUpdate,
}: {
  actions: Action[];
  onUpdate: () => void;
}) {
  const handleToggle = async (action: Action) => {
    const newStatus = action.status === 'completed' ? 'pending' : 'completed';
    try {
      await actionsApi.updateAction(action.id, { status: newStatus });
      onUpdate();
    } catch {
      // ignore
    }
  };

  const priorityColors: Record<string, string> = {
    high: 'text-red-500 dark:text-red-400',
    medium: 'text-amber-500 dark:text-amber-400',
    low: 'text-zinc-500 dark:text-zinc-400',
  };

  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2 mb-3">
        <ListTodo className="w-4 h-4 text-amber-400" />
        待辦動作
        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">({actions.length})</span>
      </h3>

      {actions.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">沒有待辦事項</p>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <div
              key={action.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/30',
                action.status === 'completed' && 'opacity-50'
              )}
            >
              <button onClick={() => handleToggle(action)} className="mt-0.5 flex-shrink-0">
                {action.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Circle className="w-4 h-4 text-zinc-400 dark:text-zinc-500 hover:text-blue-400 transition-colors" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-sm text-zinc-700 dark:text-zinc-200',
                    action.status === 'completed' && 'line-through'
                  )}
                >
                  {action.description}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{action.action_type}</span>
                  <span className={cn('text-[10px] font-medium', priorityColors[action.priority] || 'text-zinc-400')}>
                    {action.priority === 'high' && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                    {action.priority}
                  </span>
                  {action.due_date && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-0.5">
                      <Calendar className="w-3 h-3" />
                      {formatDate(action.due_date)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notes Section ──────────────────────────────────────

function NotesSection({
  contactId,
  notes,
  onUpdate,
}: {
  contactId: number;
  notes: { id: number; content: string; created_by: string; created_at: string }[];
  onUpdate: () => void;
}) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await contactsApi.addNote(contactId, content.trim());
      setContent('');
      onUpdate();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2 mb-3">
        <StickyNote className="w-4 h-4 text-yellow-400" />
        備註
      </h3>

      {/* Add note */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="新增備註..."
          className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500"
        />
        <Button size="sm" onClick={handleSubmit} disabled={submitting || !content.trim()}>
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">尚無備註</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/30 border-l-2 border-yellow-500/30"
            >
              <p className="text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{note.created_by}</span>
                <span className="text-[10px] text-zinc-300 dark:text-zinc-600">·</span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{formatDateTime(note.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const contactId = parseInt(id, 10);

  const { data: contact, loading, error, refetch } = useAsync<ContactDetail>(
    () => contactsApi.getContact(contactId),
    [contactId]
  );

  const handleUpdate = useCallback(() => {
    refetch();
  }, [refetch]);

  if (loading) return <LoadingSpinner className="min-h-screen" />;
  if (error) return <div className="p-6 text-red-400">{error}</div>;
  if (!contact) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Back button */}
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回客戶列表
      </Link>

      {/* Header */}
      <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-6 mb-6">
        <div className="flex items-start gap-4">
          <Avatar name={contact.name} url={contact.avatar_url} size="lg" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{contact.name}</h1>
              {(() => {
                const activeConvs = contact.conversations
                  .filter((c) => c.status !== 'closed')
                  .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
                const latestStatus = activeConvs.length > 0 ? activeConvs[0].status : null;
                return latestStatus ? <StatusBadge status={latestStatus} /> : null;
              })()}
            </div>
            {contact.display_name && contact.display_name !== contact.name && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{contact.display_name}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <ChannelBadge channel={contact.channel} />
              <span className="text-xs text-zinc-400 dark:text-zinc-500">{contact.source_type}</span>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-zinc-400 dark:text-zinc-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                首次互動：{formatDate(contact.first_seen)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                最後活躍：{formatDate(contact.last_seen)}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {contact.conversation_count} 次對話
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <TagSection contactId={contactId} tags={contact.tags} onUpdate={handleUpdate} />
          <ConversationTimeline conversations={contact.conversations} />
          <AnalysisSection analyses={contact.analyses} />
        </div>
        <div className="space-y-4">
          <ActionsSection actions={contact.actions} onUpdate={handleUpdate} />
          <NotesSection contactId={contactId} notes={contact.notes} onUpdate={handleUpdate} />
        </div>
      </div>
    </div>
  );
}
