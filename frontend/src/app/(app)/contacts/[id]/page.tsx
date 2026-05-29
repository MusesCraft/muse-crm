'use client';

import { use, useState, useCallback } from 'react';
import Link from 'next/link';
import { contactsApi, actionsApi, type ContactDetail, type Action } from '@/lib/api';
import { useAsync, useWebSocketEvent } from '@/lib/hooks';
import { Avatar } from '@/components/avatar';
import { ChannelBadge } from '@/components/channel-icon';
import { StatusBadge } from '@/components/status-badge';
import { LoadingSpinner } from '@/components/loading';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Clock,
  Calendar,
  UserCircle,
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
  Pencil,
  Save,
} from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

// ── Identity / Stage Section（PR-2 取代 Tag 系統） ────────

const IDENTITY_LABEL: Record<string, string> = {
  designer: '設計師',
  homeowner: '屋主',
  dealer: '建材行',
  contractor: '工班',
  unknown: '未分類',
};

const STAGE_LABEL: Record<string, string> = {
  initial: '初次接觸',
  evaluating: '評估中',
  quoted: '已報價',
  won: '已成交',
  lost: '已流失',
};

type NewActionPayload = {
  contact_id?: string | number | null;
};

function IdentityStageSection({
  customerIdentity,
  salesStage,
}: {
  customerIdentity?: string | null;
  salesStage?: string | null;
}) {
  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2 mb-3">
        <UserCircle className="w-4 h-4 text-indigo-400" />
        身份 / 銷售階段
      </h3>
      <div className="flex items-center justify-between py-1.5">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">客戶身份</span>
        <span className="text-sm text-zinc-700 dark:text-zinc-200">
          {customerIdentity ? (IDENTITY_LABEL[customerIdentity] || customerIdentity) : '—'}
        </span>
      </div>
      <div className="flex items-center justify-between py-1.5">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">銷售階段</span>
        <span className="text-sm text-zinc-700 dark:text-zinc-200">
          {salesStage ? (STAGE_LABEL[salesStage] || salesStage) : '—'}
        </span>
      </div>
    </div>
  );
}

// ── Conversation Timeline ──────────────────────────────

function ConversationTimeline({
  conversations,
}: {
  conversations: { id: string | number; channel: string; status: string; started_at: string; message_count: number }[];
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
  analyses: { id: string | number; analysis_type: string; result: Record<string, unknown>; model_used: string; created_at: string }[];
}) {
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

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
                  <Circle className="w-4 h-4 text-zinc-400 dark:text-zinc-500 hover:text-indigo-400 transition-colors" />
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
  contactId: string | number;
  notes: { id: string | number; content: string; created_by: string; created_at: string }[];
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
          aria-label="新增備註"
          className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
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

// ── Contact Info Edit ──────────────────────────────────

const INTENT_OPTIONS = [
  { value: '', label: '未設定' },
  { value: 'browsing', label: '瀏覽中' },
  { value: 'interested', label: '有興趣' },
  { value: 'ready_to_buy', label: '準備購買' },
  { value: 'purchased', label: '已購買' },
];

const BUDGET_OPTIONS = [
  { value: '', label: '未設定' },
  { value: 'under_50k', label: '5 萬以下' },
  { value: '50k_200k', label: '5-20 萬' },
  { value: '200k_500k', label: '20-50 萬' },
  { value: 'over_500k', label: '50 萬以上' },
];

const STATUS_OPTIONS = [
  { value: '', label: '未設定' },
  { value: 'new', label: '新客戶' },
  { value: 'following_up', label: '跟進中' },
  { value: 'quoted', label: '已報價' },
  { value: 'won', label: '成交' },
  { value: 'lost', label: '流失' },
];

function ContactInfoEdit({
  contactId,
  contact,
  onUpdate,
}: {
  contactId: string | number;
  contact: ContactDetail;
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editPhone, setEditPhone] = useState(contact.phone || '');
  const [editEmail, setEditEmail] = useState(contact.email || '');
  const [editIntent, setEditIntent] = useState(contact.intent || '');
  const [editBudget, setEditBudget] = useState(contact.budget_range || '');
  const [editStatus, setEditStatus] = useState(contact.contact_status || '');

  const handleStartEdit = () => {
    setEditPhone(contact.phone || '');
    setEditEmail(contact.email || '');
    setEditIntent(contact.intent || '');
    setEditBudget(contact.budget_range || '');
    setEditStatus(contact.contact_status || '');
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await contactsApi.updateContact(contactId, {
        phone: editPhone || undefined,
        email: editEmail || undefined,
        intent: editIntent || undefined,
        budget_range: editBudget || undefined,
        contact_status: editStatus || undefined,
      });
      setEditing(false);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500';
  const selectClass = 'w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500';

  const intentLabel = INTENT_OPTIONS.find(o => o.value === (contact.intent || ''))?.label || contact.intent || '未設定';
  const budgetLabel = BUDGET_OPTIONS.find(o => o.value === (contact.budget_range || ''))?.label || contact.budget_range || '未設定';
  const statusLabel = STATUS_OPTIONS.find(o => o.value === (contact.contact_status || ''))?.label || contact.contact_status || '未設定';

  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
          <Pencil className="w-4 h-4 text-indigo-400" />
          基本資料
        </h3>
        {editing ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 disabled:opacity-50"
            >
              <Save className="w-3 h-3" />
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartEdit}
            className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1"
          >
            <Pencil className="w-3 h-3" />
            編輯
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">電話</label>
            <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="輸入電話..." className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Email</label>
            <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="輸入 Email..." className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">意圖</label>
            <select value={editIntent} onChange={(e) => setEditIntent(e.target.value)} className={selectClass}>
              {INTENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">預算範圍</label>
            <select value={editBudget} onChange={(e) => setEditBudget(e.target.value)} className={selectClass}>
              {BUDGET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">客戶狀態</label>
            <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className={selectClass}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">電話</span>
            <span className="text-sm text-zinc-700 dark:text-zinc-200">{contact.phone || '—'}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Email</span>
            <span className="text-sm text-zinc-700 dark:text-zinc-200">{contact.email || '—'}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">意圖</span>
            <span className="text-sm text-zinc-700 dark:text-zinc-200">{intentLabel}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">預算範圍</span>
            <span className="text-sm text-zinc-700 dark:text-zinc-200">{budgetLabel}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">客戶狀態</span>
            <span className="text-sm text-zinc-700 dark:text-zinc-200">{statusLabel}</span>
          </div>
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
  // Support both numeric IDs (mock) and UUID strings (backend)
  const contactId: string | number = /^\d+$/.test(id) ? parseInt(id, 10) : id;

  const { data: contact, loading, error, refetch } = useAsync<ContactDetail>(
    () => contactsApi.getContact(contactId),
    [contactId]
  );

  const refreshOnNewAction = useCallback((payload: NewActionPayload) => {
    const payloadContactId = payload?.contact_id;
    if (!payloadContactId || String(payloadContactId) === String(contactId)) {
      refetch();
    }
  }, [contactId, refetch]);
  useWebSocketEvent('new_action', refreshOnNewAction);

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
          <ContactInfoEdit contactId={contactId} contact={contact} onUpdate={handleUpdate} />
          <IdentityStageSection customerIdentity={contact.customer_identity} salesStage={contact.sales_stage} />
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
