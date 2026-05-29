// API Client for MUSE CRM Backend
// Transforms backend response fields to frontend types

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('muse_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('muse_refresh_token');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('muse_token', data.token);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    // 嘗試用 refresh token 續期（防止多個請求同時 refresh）
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = tryRefresh().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }
    const refreshed = await refreshPromise;

    if (refreshed) {
      // 用新 token 重試原請求
      const retryRes = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
          ...options?.headers,
        },
      });
      if (retryRes.ok) return retryRes.json();
    }

    // Refresh 也失敗 — 登出
    localStorage.removeItem('muse_token');
    localStorage.removeItem('muse_refresh_token');
    window.dispatchEvent(new Event('auth-expired'));
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    let errorMsg = res.statusText;
    try {
      const json = await res.json();
      errorMsg = json.error || json.message || res.statusText;
    } catch {
      const text = await res.text().catch(() => '');
      if (text) errorMsg = text;
    }
    throw new ApiError(res.status, errorMsg);
  }

  return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureArray(val: any): any[] {
  return Array.isArray(val) ? val : [];
}

// ── Types ──────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
  };
}

export interface Contact {
  id: string | number;
  platform_id: string;
  name: string;
  display_name: string | null;
  channel: string;
  source_channel?: string | null;
  avatar_url: string | null;
  source_type: string;
  first_seen: string;
  last_seen: string;
  conversation_count: number;
  priority?: 'high' | 'medium' | 'low';
  phone?: string | null;
  email?: string | null;
  contact_status?: string;
  intent?: string;
  budget_range?: string;
  // PR-2 新增（FILE_STRUCTURE_PLAN §2.1）
  customer_identity?: 'designer' | 'homeowner' | 'dealer' | 'contractor' | 'unknown' | null;
  sales_stage?: 'initial' | 'evaluating' | 'quoted' | 'won' | 'lost' | null;
}

export type MessageType =
  | 'text'
  | 'image'
  | 'sticker'
  | 'attachment'
  | 'referral'
  | 'interactive'
  | 'callback_query'
  | 'button'
  | string;

export type InteractivePayload = Record<string, unknown>;

export interface Message {
  id: string | number;
  conversation_id: string | number;
  sender_type: 'customer' | 'business' | 'system';
  message_type: MessageType;
  content: string;
  media_url: string | null;
  timestamp: string;
  is_read: boolean;
  platform_message_id: string | null;
  telegram_message_id?: string | null;
  metadata?: InteractivePayload | null;
  message_metadata?: InteractivePayload | null;
  interactive_payload?: InteractivePayload | null;
  reactions?: Record<string, string[]>;
  reply_to_message_id?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  deleted_for?: string[];
  pinned_at?: string | null;
  pinned_by?: string | null;
  quick_intent?: string;
  /** PR-2：內部備註（不對外發送） */
  is_internal?: boolean;
  /** PR-2：被 @ 提及的 user id 清單 */
  mentions?: string[];
}

export interface Analysis {
  id: string | number;
  conversation_id: string | number;
  analysis_type: string;
  result: Record<string, unknown>;
  model_used: string;
  created_at: string;
}

export interface Conversation {
  id: string | number;
  contact_id: string | number;
  channel: string;
  status: string;
  urgency?: 'high' | 'medium' | 'low';
  started_at: string;
  ended_at: string | null;
  message_count: number;
  platform_conversation_id: string | null;
  contact?: Contact;
  last_message?: Message;
  messages?: Message[];
  analyses?: Analysis[];
  /** PR-2：當前處理者 user id */
  current_handler_id?: string | null;
  /** PR-2：接管中的主管 user id */
  supervisor_id?: string | null;
  /** PR-2：旁聽者 user id 清單 */
  watchers?: string[];
  /** PR-2：求援/升級時間 */
  escalated_at?: string | null;
  /** PR-2：求援原因 */
  escalation_reason?: string | null;
}

export interface Action {
  id: string | number;
  contact_id: string | number;
  conversation_id: string | number | null;
  /** Backend returns `source`; `action_type` kept for backward compatibility */
  source: string;
  action_type: string;
  description: string;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  contact?: Contact;
}

export interface Note {
  id: string | number;
  contact_id: string | number;
  content: string;
  /** Backend returns `author_id`; `created_by` kept for backward compatibility */
  author_id: string | null;
  created_by: string;
  created_at: string;
}

export interface ContactDetail extends Contact {
  phone?: string | null;
  email?: string | null;
  notes_text?: string | null;
  conversations: Conversation[];
  analyses: Analysis[];
  actions: Action[];
  notes: Note[];
}

export interface DashboardStats {
  total_contacts: number;
  total_conversations: number;
  active_conversations: number;
  total_messages: number;
  pending_actions: number;
  urgency_distribution?: { high: number; medium: number; low: number };
  status_distribution?: { active: number; silent: number; unanswered: number };
  today_messages?: { count: number; yesterdayCount: number };
  channel_distribution?: { channel: string; count: number }[];
  contact_status?: Record<string, number>;
  intent_distribution?: Record<string, number>;
  avg_response_hours?: number | null;
  conversion_funnel?: { total: number; engaged: number; quoted: number; won: number };
  top_conversations?: { id: string; contact_name: string; channel: string; message_count: number; status: string; last_message_at: string | null }[];
  message_activity?: { date: string; count: number }[];
}

export interface ChannelDistribution {
  channel: string;
  count: number;
}

export interface ActivityPoint {
  date: string;
  messages: number;
  conversations: number;
}

// ── Backend → Frontend Transformers ───────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformContact(raw: any): Contact {
  return {
    id: raw.id,
    platform_id: raw.id?.toString() || '',
    name: raw.name || raw.display_name || '',
    display_name: raw.display_name ?? null,
    channel: raw.source_channel || raw.channel || '',
    avatar_url: raw.avatar_url ?? null,
    source_type: raw.source_type || 'organic',
    first_seen: raw.first_seen_at || raw.first_seen || raw.created_at || '',
    last_seen: raw.last_active_at || raw.last_seen || raw.updated_at || '',
    conversation_count: raw.conversation_count ?? 0,
    priority: raw.priority || undefined,
    phone: raw.phone ?? null,
    email: raw.email ?? null,
    contact_status: raw.contact_status ?? undefined,
    intent: raw.intent ?? undefined,
    budget_range: raw.budget_range ?? undefined,
    customer_identity: raw.customer_identity ?? null,
    sales_stage: raw.sales_stage ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformMessage(raw: any): Message {
  const metadata = raw.message_metadata ?? raw.metadata ?? null;
  const interactivePayload = raw.interactive_payload ?? metadata;
  return {
    id: raw.id,
    conversation_id: raw.conversation_id,
    sender_type: raw.sender_type,
    message_type: raw.message_type || 'text',
    content: raw.content || '',
    media_url: raw.media_url ?? null,
    timestamp: raw.sent_at || raw.timestamp || raw.created_at || '',
    is_read: raw.is_read ?? false,
    platform_message_id: raw.meta_message_id || raw.platform_message_id || null,
    telegram_message_id: raw.telegram_message_id ?? null,
    metadata,
    message_metadata: metadata,
    interactive_payload: interactivePayload,
    reactions: raw.reactions && typeof raw.reactions === 'object' ? raw.reactions : {},
    reply_to_message_id: raw.reply_to_message_id ?? null,
    edited_at: raw.edited_at ?? null,
    deleted_at: raw.deleted_at ?? null,
    deleted_for: Array.isArray(raw.deleted_for) ? raw.deleted_for : [],
    pinned_at: raw.pinned_at ?? null,
    pinned_by: raw.pinned_by ?? null,
    quick_intent: raw.quick_intent || undefined,
    is_internal: raw.is_internal ?? false,
    mentions: Array.isArray(raw.mentions) ? raw.mentions : [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformAnalysis(raw: any): Analysis {
  // Backend returns separate fields; pack them into a unified `result` object
  const result: Record<string, unknown> = raw.result || {};
  if (!raw.result) {
    if (raw.demand_summary) result.demand_summary = raw.demand_summary;
    if (raw.mentioned_products) result.mentioned_products = raw.mentioned_products;
    if (raw.suggested_tags) result.suggested_tags = raw.suggested_tags;
    if (raw.conversation_summary) result.conversation_summary = raw.conversation_summary;
    if (raw.suggested_action) result.suggested_action = raw.suggested_action;
    if (raw.sentiment) result.sentiment = raw.sentiment;
    if (raw.intent) result.intent = raw.intent;
    if (raw.urgency) result.urgency = raw.urgency;
    if (raw.customer_stage) result.customer_stage = raw.customer_stage;
    if (raw.customer_name) result.customer_name = raw.customer_name;
  }

  return {
    id: raw.id,
    conversation_id: raw.conversation_id,
    analysis_type: raw.analysis_type || raw.trigger_type || 'full_analysis',
    result,
    model_used: raw.model_used || '',
    created_at: raw.created_at || '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformConversation(raw: any): Conversation {
  return {
    id: raw.id,
    contact_id: raw.contact_id,
    channel: raw.channel || '',
    status: raw.status || 'active',
    urgency: raw.urgency || undefined,
    started_at: raw.started_at || raw.created_at || '',
    ended_at: raw.closed_at || raw.ended_at || null,
    message_count: raw.message_count ?? 0,
    platform_conversation_id: raw.platform_conversation_id || null,
    contact: raw.contact ? transformContact(raw.contact) : undefined,
    last_message: raw.last_message ? transformMessage(raw.last_message) : undefined,
    messages: raw.messages?.map(transformMessage),
    analyses: raw.analyses?.map(transformAnalysis),
    current_handler_id: raw.current_handler_id ?? null,
    supervisor_id: raw.supervisor_id ?? null,
    watchers: Array.isArray(raw.watchers) ? raw.watchers : [],
    escalated_at: raw.escalated_at ?? null,
    escalation_reason: raw.escalation_reason ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformAction(raw: any): Action {
  const src = raw.source || raw.action_type || 'followup';
  return {
    id: raw.id,
    contact_id: raw.contact_id,
    conversation_id: raw.conversation_id ?? null,
    source: src,
    action_type: src,
    description: raw.description || '',
    priority: raw.priority || 'medium',
    status: raw.status || 'pending',
    due_date: raw.due_date ?? null,
    completed_at: raw.completed_at ?? null,
    created_at: raw.created_at || '',
    contact: raw.contact ? transformContact(raw.contact) : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformNote(raw: any): Note {
  const authorId = raw.author_id || raw.created_by || null;
  return {
    id: raw.id,
    contact_id: raw.contact_id,
    content: raw.content || '',
    author_id: authorId,
    created_by: authorId || 'system',
    created_at: raw.created_at || '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformContactDetail(raw: any): ContactDetail {
  const base = transformContact(raw);
  return {
    ...base,
    phone: raw.phone || null,
    email: raw.email || null,
    notes_text: raw.notes || null,
    conversations: raw.conversations?.map(transformConversation) || [],
    analyses: raw.analyses?.map(transformAnalysis) || [],
    actions: raw.actions?.map(transformAction) || [],
    // 注意：raw.notes 是字串時為備註內文，是陣列才是 UserNote 清單
    notes: Array.isArray(raw.notes) ? raw.notes.map(transformNote) : [],
  };
}

// ── Inbox API ──────────────────────────────────────────

export const inboxApi = {
  async getConversations(params?: {
    page?: number;
    per_page?: number;
    status?: string;
    channel?: string;
    search?: string;
    view?: 'mine' | 'unassigned' | 'team';
    handler_id?: string;
    escalated?: boolean;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.per_page) searchParams.set('per_page', String(params.per_page));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.channel) searchParams.set('channel', params.channel);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.view) searchParams.set('view', params.view);
    if (params?.handler_id) searchParams.set('handler_id', params.handler_id);
    if (params?.escalated) searchParams.set('escalated', 'true');
    const qs = searchParams.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/inbox/conversations${qs ? `?${qs}` : ''}`);
    return {
      data: ensureArray(raw.data).map(transformConversation),
      pagination: raw.pagination,
    } as PaginatedResponse<Conversation>;
  },

  async getConversation(id: string | number) {
    // Backend returns { conversation, contact, messages, analyses }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/inbox/conversations/${id}`);

    // Handle nested response format from backend
    if (raw.conversation) {
      const conv = transformConversation(raw.conversation);
      conv.contact = raw.contact ? transformContact(raw.contact) : conv.contact;
      conv.messages = raw.messages?.map(transformMessage) || conv.messages;
      conv.analyses = raw.analyses?.map(transformAnalysis) || conv.analyses;
      return conv;
    }

    // Handle flat format (if backend returns flat conversation)
    return transformConversation(raw);
  },

  async closeConversation(id: string | number) {
    return await request<{ message: string }>(`/inbox/conversations/${id}/close`, { method: 'POST' });
  },

  async analyzeConversation(id: string | number) {
    return await request<{ message: string; task_id: string }>(`/inbox/conversations/${id}/analyze`, {
      method: 'POST',
    });
  },
};

// ── Conversation Ops API（PR-3/4） ──────────────────────

export interface ConversationEventEntry {
  id: string;
  conversation_id: string;
  event_type: string;
  actor_id: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const conversationOpsApi = {
  async assign(conversationId: string | number, userId?: string) {
    return await request<{ data: Conversation }>(`/inbox/conversations/${conversationId}/assign`, {
      method: 'POST',
      body: JSON.stringify(userId ? { user_id: userId } : {}),
    });
  },
  async escalate(conversationId: string | number, reason: string) {
    return await request<{ data: Conversation }>(`/inbox/conversations/${conversationId}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  async takeOver(conversationId: string | number, opts?: { note?: string; force?: boolean }) {
    return await request<{ data: Conversation }>(`/inbox/conversations/${conversationId}/take-over`, {
      method: 'POST',
      body: JSON.stringify(opts || {}),
    });
  },
  async returnToAgent(conversationId: string | number) {
    return await request<{ data: Conversation }>(`/inbox/conversations/${conversationId}/return`, {
      method: 'POST',
    });
  },
  async watch(conversationId: string | number) {
    return await request<{ data: Conversation }>(`/inbox/conversations/${conversationId}/watch`, {
      method: 'POST',
    });
  },
  async unwatch(conversationId: string | number) {
    return await request<{ data: Conversation }>(`/inbox/conversations/${conversationId}/watch`, {
      method: 'DELETE',
    });
  },
  async resolve(conversationId: string | number) {
    return await request<{ data: Conversation }>(`/inbox/conversations/${conversationId}/resolve`, {
      method: 'POST',
    });
  },
  async reopen(conversationId: string | number) {
    return await request<{ data: Conversation }>(`/inbox/conversations/${conversationId}/reopen`, {
      method: 'POST',
    });
  },
  async getEvents(conversationId: string | number) {
    return await request<{ data: ConversationEventEntry[] }>(
      `/inbox/conversations/${conversationId}/events`
    );
  },
};

// ── Contacts API ───────────────────────────────────────

export const contactsApi = {
  async getContacts(params?: {
    page?: number;
    per_page?: number;
    search?: string;
    channel?: string;
    source_type?: string;
    contact_status?: string;
    intent?: string;
    customer_identity?: string;
    sales_stage?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.per_page) searchParams.set('per_page', String(params.per_page));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.channel) searchParams.set('channel', params.channel);
    if (params?.source_type) searchParams.set('source_type', params.source_type);
    if (params?.contact_status) searchParams.set('contact_status', params.contact_status);
    if (params?.intent) searchParams.set('intent', params.intent);
    if (params?.customer_identity) searchParams.set('customer_identity', params.customer_identity);
    if (params?.sales_stage) searchParams.set('sales_stage', params.sales_stage);
    const qs = searchParams.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/contacts${qs ? `?${qs}` : ''}`);
    return {
      data: ensureArray(raw.data).map(transformContact),
      pagination: raw.pagination,
    } as PaginatedResponse<Contact>;
  },

  async getContact(id: string | number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/contacts/${id}`);
    return transformContactDetail(raw);
  },

  async addNote(contactId: string | number, content: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/contacts/${contactId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    const noteData = raw.note || raw;
    return transformNote(noteData);
  },

  async updateContact(id: string | number, data: {
    phone?: string;
    email?: string;
    intent?: string;
    budget_range?: string;
    contact_status?: string;
    customer_identity?: string;
    sales_stage?: string;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    const contactData = raw.contact || raw;
    return transformContactDetail(contactData);
  },

  async createContact(data: {
    display_name: string;
    phone?: string;
    email?: string;
    notes?: string;
    source_channel?: 'walk_in' | 'phone' | 'referral' | 'exhibition' | 'other';
    intent?: 'browsing' | 'interested' | 'ready_to_buy' | 'purchased';
    budget_range?: 'under_50k' | '50k_200k' | '200k_500k' | 'over_500k';
    // 注意：preferred_products 在 PR-2 後端結構調整完成後會移除
    preferred_products?: string[];
    visit_date?: string;
    referral_source?: string;
    contact_status?: 'new' | 'following_up' | 'quoted' | 'won' | 'lost';
    customer_identity?: 'designer' | 'homeowner' | 'dealer' | 'contractor' | 'unknown';
    sales_stage?: 'initial' | 'evaluating' | 'quoted' | 'won' | 'lost';
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>('/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const contactData = raw.contact || raw;
    return transformContact(contactData);
  },
};

// ── Actions API ────────────────────────────────────────

export const actionsApi = {
  async getActions(params?: { status?: string; priority?: string; sort?: string; contact_id?: string | number }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.priority) searchParams.set('priority', params.priority);
    if (params?.sort) searchParams.set('sort', params.sort);
    if (params?.contact_id) searchParams.set('contact_id', String(params.contact_id));
    const qs = searchParams.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/actions${qs ? `?${qs}` : ''}`);
    // Support both { data, pagination } and plain array (backward compat)
    const items = Array.isArray(raw) ? raw : ensureArray(raw?.data);
    return items.map(transformAction);
  },

  async updateAction(id: string | number, data: Partial<Pick<Action, 'status'>>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/actions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    // Backend wraps in { message, action }
    const actionData = raw.action || raw;
    return transformAction(actionData);
  },

  async createAction(data: {
    contact_id: string | number;
    conversation_id?: string | number;
    action_type: string;
    description: string;
    priority: string;
    due_date?: string;
    assigned_to?: string;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>('/actions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    // Backend wraps in { message, action }
    const actionData = raw.action || raw;
    return transformAction(actionData);
  },
};

// ── Quick Replies API ──────────────────────────────────

export interface QuickReplyAttachment {
  type: 'image';
  url: string;
  label?: string;
}

export interface QuickReplyItem {
  id: string;
  title: string;
  category: string;
  priority: string;
  trigger_keywords: string[];
  content: string;
  attachments?: QuickReplyAttachment[];
  is_system?: boolean;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  // Legacy fields from JSON (optional)
  trigger?: string;
  user_identity?: string | null;
  channel?: string;
}

export const quickRepliesApi = {
  async getAll(category?: string) {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    const qs = params.toString();
    return await request<{ data: QuickReplyItem[]; total: number; categories: string[] }>(
      `/quick-replies${qs ? `?${qs}` : ''}`
    );
  },

  async search(q: string, category?: string) {
    const params = new URLSearchParams({ q });
    if (category) params.set('category', category);
    return await request<{ data: QuickReplyItem[]; total: number; query: string }>(
      `/quick-replies/search?${params.toString()}`
    );
  },

  async getById(id: string) {
    return await request<QuickReplyItem>(`/quick-replies/${id}`);
  },

  async create(data: { category: string; title: string; content: string; trigger_keywords?: string[]; priority?: string; attachments?: QuickReplyAttachment[] }) {
    return await request<QuickReplyItem>('/quick-replies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: Partial<{ category: string; title: string; content: string; trigger_keywords: string[]; priority: string; attachments: QuickReplyAttachment[] }>) {
    return await request<QuickReplyItem>(`/quick-replies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return await request<{ message: string }>(`/quick-replies/${id}`, {
      method: 'DELETE',
    });
  },
};

// ── Inbox Send API ─────────────────────────────────────

export interface SendMessageResponse {
  message: string;
  sent_via_api: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  api_error?: string;
}

export interface SendMessageOptions {
  /** PR-2：true 表示內部備註，不對外發送 */
  isInternal?: boolean;
  /** PR-2：被 @ 提及的 user id 清單 */
  mentions?: string[];
  /** 回覆/引用的訊息 ID */
  replyToMessageId?: string | number | null;
}

export interface MessageActionResponse {
  message: string;
  platform_supported?: boolean;
  platform_message?: string;
  data: Message;
}

export const inboxSendApi = {
  async sendMessage(
    conversationId: string | number,
    content: string,
    messageType: 'text' | 'image' = 'text',
    mediaUrl?: string,
    opts?: SendMessageOptions,
  ) {
    const raw = await request<SendMessageResponse>(
      `/inbox/conversations/${conversationId}/send`,
      {
        method: 'POST',
        body: JSON.stringify({
          content,
          message_type: messageType,
          media_url: mediaUrl,
          is_internal: opts?.isInternal ?? false,
          mentions: opts?.mentions ?? [],
          reply_to_message_id: opts?.replyToMessageId ?? null,
        }),
      }
    );
    return {
      ...raw,
      data: raw.data ? transformMessage(raw.data) : undefined,
    };
  },

  async sendImage(conversationId: string | number, imageUrl: string, caption?: string) {
    return await inboxSendApi.sendMessage(conversationId, caption || '', 'image', imageUrl);
  },
};

// ── Inbox Message Actions API ───────────────────────────

export const inboxMessageActionsApi = {
  async addReaction(messageId: string | number, emoji: string) {
    const raw = await request<MessageActionResponse>(`/inbox/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
    return { ...raw, data: transformMessage(raw.data) };
  },

  async removeReaction(messageId: string | number, emoji: string) {
    const raw = await request<MessageActionResponse>(
      `/inbox/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: 'DELETE' }
    );
    return { ...raw, data: transformMessage(raw.data) };
  },

  async pin(messageId: string | number) {
    const raw = await request<MessageActionResponse>(`/inbox/messages/${messageId}/pin`, {
      method: 'POST',
    });
    return { ...raw, data: transformMessage(raw.data) };
  },

  async unpin(messageId: string | number) {
    const raw = await request<MessageActionResponse>(`/inbox/messages/${messageId}/pin`, {
      method: 'DELETE',
    });
    return { ...raw, data: transformMessage(raw.data) };
  },

  async edit(messageId: string | number, content: string) {
    const raw = await request<MessageActionResponse>(`/inbox/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
    return { ...raw, data: transformMessage(raw.data) };
  },

  async delete(messageId: string | number, deletedFor: string | string[] = 'everyone') {
    const raw = await request<MessageActionResponse>(`/inbox/messages/${messageId}`, {
      method: 'DELETE',
      body: JSON.stringify({ deleted_for: deletedFor }),
    });
    return { ...raw, data: transformMessage(raw.data) };
  },

  async forward(messageId: string | number, targetConversationId: string | number) {
    const raw = await request<MessageActionResponse>(`/inbox/messages/${messageId}/forward`, {
      method: 'POST',
      body: JSON.stringify({ target_conversation_id: targetConversationId }),
    });
    return { ...raw, data: transformMessage(raw.data) };
  },
};

export const inboxConversationStateApi = {
  async markRead(conversationId: string | number) {
    return await request<{ message: string; conversation_id: string }>(
      `/inbox/conversations/${conversationId}/read`,
      { method: 'POST' }
    );
  },

  async markUnread(conversationId: string | number) {
    return await request<{ message: string; conversation_id: string }>(
      `/inbox/conversations/${conversationId}/unread`,
      { method: 'POST' }
    );
  },

  async typing(conversationId: string | number) {
    return await request<{ message: string; platform_supported?: boolean; conversation_id: string }>(
      `/inbox/conversations/${conversationId}/typing`,
      { method: 'POST' }
    );
  },
};

// ── Upload API ─────────────────────────────────────────

export const uploadApi = {
  async uploadImage(file: File): Promise<{ url: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${API_BASE}/upload`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
      },
      body: formData,
    });

    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('muse_token');
        window.dispatchEvent(new Event('auth-expired'));
      }
      throw new ApiError(401, 'Unauthorized');
    }
    if (!res.ok) {
      const body = await res.text();
      throw new ApiError(res.status, body || res.statusText);
    }

    return res.json();
  },
};

// ── Inbox Image API (legacy) ──────────────────────────

export const inboxImageApi = {
  async sendImage(conversationId: string | number, imageUrl: string, caption?: string) {
    return await request<{ message: string; sent_via_api: boolean; message_id: string }>(
      `/inbox/conversations/${conversationId}/send-image`,
      {
        method: 'POST',
        body: JSON.stringify({ image_url: imageUrl, caption }),
      }
    );
  },
};

// ── OCR API ────────────────────────────────────────────

export interface OcrResult {
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  address: string;
  line_id: string;
  other_info?: string;
  confidence: number;
}

export const ocrApi = {
  async analyzeBusinessCard(imageUrl: string, contactId?: string) {
    return await request<{ result: OcrResult; contact_updated: boolean }>('/ocr/business-card', {
      method: 'POST',
      body: JSON.stringify({ image_url: imageUrl, contact_id: contactId }),
    });
  },
};

// ── Dashboard API ──────────────────────────────────────

export interface FirstResponseTime {
  p50_minutes: number | null;
  p90_minutes: number | null;
  sample_count: number;
}

export interface ResolutionRate {
  period_days: number;
  total: number;
  resolved: number;
  resolution_rate: number;
}

export interface EscalationRate {
  period_days: number;
  total: number;
  escalated: number;
  escalation_rate: number;
}

export const dashboardApi = {
  async getStats() {
    return await request<DashboardStats>('/dashboard/stats');
  },

  async getChannelDistribution() {
    return await request<ChannelDistribution[]>('/dashboard/channel-distribution');
  },

  async getActivity(days = 30) {
    return await request<ActivityPoint[]>(`/dashboard/activity?days=${days}`);
  },

  // PR-7 主管 KPI（PRD §F10）
  async getFirstResponseTime() {
    return await request<FirstResponseTime>('/dashboard/first-response-time');
  },
  async getResolutionRate(days = 30) {
    return await request<ResolutionRate>(`/dashboard/resolution-rate?days=${days}`);
  },
  async getEscalationRate(days = 30) {
    return await request<EscalationRate>(`/dashboard/escalation-rate?days=${days}`);
  },
  async getConversationStatus() {
    return await request<Record<string, number>>('/dashboard/conversation-status');
  },
  async getTodayConversations() {
    return await request<{ today: number; yesterday: number }>('/dashboard/today-conversations');
  },
};

// ── AI Copilot API（PR-6） ─────────────────────────────

export interface ReplySuggestionItem {
  text: string;
  confidence?: number;
  kb_refs?: string[];
}

export interface ReplySuggestionRecord {
  id: string;
  conversation_id: string;
  suggestions: ReplySuggestionItem[];
  model?: string | null;
  used_suggestion_index?: number | null;
  edited_before_send?: boolean | null;
  created_at?: string | null;
}

export interface KnowledgeBaseItem {
  id: string;
  title: string;
  content: string;
  category?: string | null;
  tags?: string[];
}

export interface ConversationSummary {
  conversation_id: string;
  summary: string;
  is_stub?: boolean;
}

export const aiCopilotApi = {
  async getSuggestions(conversationId: string | number) {
    return await request<{ data: ReplySuggestionRecord }>(
      `/ai/suggestions?conversation_id=${conversationId}`
    );
  },

  async markSuggestionUsed(
    recordId: string,
    usedSuggestionIndex: number,
    editedBeforeSend: boolean,
  ) {
    return await request<{ data: ReplySuggestionRecord }>(
      `/ai/suggestions/${recordId}/used`,
      {
        method: 'POST',
        body: JSON.stringify({
          used_suggestion_index: usedSuggestionIndex,
          edited_before_send: editedBeforeSend,
        }),
      }
    );
  },

  async getSummary(conversationId: string | number) {
    return await request<ConversationSummary>(
      `/ai/summary?conversation_id=${conversationId}`
    );
  },

  async searchKnowledge(query: string, category?: string, topK = 5) {
    const params = new URLSearchParams({ q: query, top_k: String(topK) });
    if (category) params.set('category', category);
    return await request<{ data: KnowledgeBaseItem[] }>(
      `/ai/knowledge-search?${params.toString()}`
    );
  },
};

// ── Users API（給 AssignMenu 列出客服） ─────────────────

export interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export const usersApi = {
  async getAgents() {
    // 後端 /users 列表（admin/manager 可呼叫），這裡只取 active 且為 user/agent 角色
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>('/users');
    const users: UserOption[] = ensureArray(raw?.data || raw).map((u: Record<string, unknown>) => ({
      id: String(u.id),
      name: String(u.name || u.email || ''),
      email: String(u.email || ''),
      role: String(u.role || ''),
      is_active: u.is_active !== false,
    }));
    return users.filter((u) => u.is_active && ['user', 'agent', 'manager'].includes(u.role));
  },
};

// ── LLM Usage API ──────────────────────────────────────

export interface LlmUsageSummary {
  period: string;
  total_tokens: number;
  total_cost: number;
  by_model: { model: string; tokens: number; cost: number }[];
  by_task_type: { task_type: string; tokens: number; cost: number; count: number }[];
}

export interface LlmBudget {
  monthly_limit: number;
  current_usage: number;
  remaining: number;
  reset_date: string;
}

export const llmApi = {
  async getUsageSummary(period: 'day' | 'week' | 'month'): Promise<LlmUsageSummary> {
    const raw = await request<Record<string, unknown>>(`/llm/usage/summary?period=${period}`);
    const byModel = Array.isArray(raw.by_model) ? raw.by_model : [];
    const byTask = Array.isArray(raw.by_task_type) ? raw.by_task_type : [];
    return {
      period: (raw.period as string) || period,
      total_tokens: (raw.total_tokens as number) || 0,
      total_cost: (raw.total_cost_usd as number) ?? (raw.total_cost as number) ?? 0,
      by_model: byModel.map((m: Record<string, unknown>) => ({
        model: m.model as string,
        tokens: (m.tokens as number) ?? (m.total_tokens as number) ?? 0,
        cost: (m.cost as number) ?? (m.estimated_cost_usd as number) ?? 0,
      })),
      by_task_type: byTask.map((t: Record<string, unknown>) => ({
        task_type: t.task_type as string,
        tokens: (t.tokens as number) ?? (t.total_tokens as number) ?? 0,
        cost: (t.cost as number) ?? (t.estimated_cost_usd as number) ?? 0,
        count: (t.count as number) ?? (t.request_count as number) ?? 0,
      })),
    };
  },

  async getBudget(): Promise<LlmBudget> {
    const raw = await request<Record<string, unknown>>('/llm/budget');
    const cost = raw.cost as Record<string, number> | undefined;
    const limit = cost?.limit_usd ?? (raw.monthly_limit as number) ?? 50;
    const current = cost?.current_usd ?? (raw.current_usage as number) ?? 0;
    return {
      monthly_limit: limit,
      current_usage: current,
      remaining: limit - current,
      reset_date: raw.month ? `${raw.month}-01` : '',
    };
  },
};

// ── Admin API ──────────────────────────────────────────

export const adminApi = {
  async importCsv(sheetUrl: string) {
    return await request<{ message: string; created: number; failed: number; errors: string[] }>('/admin/import-csv', {
      method: 'POST',
      body: JSON.stringify({ sheet_url: sheetUrl }),
    });
  },
};

// ── Products & Inventory API ────────────────────────────

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  category_name: string | null;
  material_type: string | null;
  dimensions: string | null;
  unit_price: number | null;
  stock_quantity: number;
  grade: string | null;
  image_url: string | null;
  status: string;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProductCategory {
  id: string;
  name: string;
  description: string | null;
  product_count: number;
}

export interface StockLog {
  id: string;
  product_id: string;
  quantity_change: number;
  reason: string;
  reference_note: string | null;
  created_by: string | null;
  created_at: string;
}

export const productsApi = {
  async getProducts(params?: { page?: number; per_page?: number; search?: string; category_id?: string; grade?: string; status?: string; material_type?: string; sort_by?: string; sort_order?: string }) {
    const qs = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    return await request<PaginatedResponse<Product>>(`/products?${qs.toString()}`);
  },
  async getProduct(id: string) {
    return await request<Product & { stock_logs: StockLog[] }>(`/products/${id}`);
  },
  async createProduct(data: Partial<Product>) {
    return await request<Product>('/products', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateProduct(id: string, data: Partial<Product>) {
    return await request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteProduct(id: string) {
    return await request<{ message: string }>(`/products/${id}`, { method: 'DELETE' });
  },
  async adjustStock(id: string, data: { quantity_change: number; reason: string; note?: string }) {
    return await request<{ product: Product; log: StockLog }>(`/products/${id}/stock`, { method: 'POST', body: JSON.stringify(data) });
  },
  async getCategories() {
    return await request<ProductCategory[]>('/products/categories');
  },
  async createCategory(data: { name: string; description?: string }) {
    return await request<ProductCategory>('/products/categories', { method: 'POST', body: JSON.stringify(data) });
  },
};

// ── External Inventory API (進銷存系統 Proxy) ────────────

export interface InvSizeSpec {
  id: string;
  code: string;
  width: string;
  length: string;
  label: string;
}

export interface InvWarehouse {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
}

export interface InvProduct {
  id: string;
  legacySku: string | null;
  legacyName: string | null;
  newSku: string | null;
  name: string;
  variant: string | null;
  baseCode: string | null;
  unit: string | null;
  sizeSpecId: string | null;
  thickness: string | null;
  safetyStock: number;
  stock: number;
  hiddenStock: number;
  reservedStock: number;
  stockStatus: string;
  warehouseId: string | null;
  location: string | null;
  rack: string | null;
  row: string | null;
  shelf: string | null;
  categoryId: string | null;
  averageCost: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  sizeSpec: InvSizeSpec | null;
  warehouse: InvWarehouse | null;
  customFields?: Record<string, unknown>;
}

export interface InvOverview {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalQuantity: number;
}

export interface InvLog {
  id: string;
  productId: string;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  channel: string;
  counterpart: string | null;
  orderRef: string | null;
  scrapReason: string | null;
  note: string | null;
  date: string;
  createdAt: string;
  approvalStatus: string;
  product?: { id: string; legacySku: string; legacyName: string; name: string };
}

export const inventoryApi = {
  async getProducts(params?: { page?: number; limit?: number; search?: string }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    return await request<{ items: InvProduct[]; total: number; page: number; limit: number }>(`/inventory/products${q ? `?${q}` : ''}`);
  },

  async getProduct(id: string) {
    return await request<InvProduct>(`/inventory/products/${id}`);
  },

  async getSizeSpecs() {
    return await request<InvSizeSpec[]>('/inventory/products/size-specs');
  },

  async getOverview() {
    return await request<InvOverview>('/inventory/overview');
  },

  async getLogs(params?: { page?: number; limit?: number; productId?: string }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.productId) qs.set('productId', params.productId);
    const q = qs.toString();
    return await request<{ logs: InvLog[]; total: number }>(`/inventory/logs${q ? `?${q}` : ''}`);
  },

  async inbound(data: { productId: string; quantity: number; note?: string; date?: string }) {
    return await request('/inventory/inbound', { method: 'POST', body: JSON.stringify(data) });
  },

  async outbound(data: { productId: string; quantity: number; channel?: string; counterpart?: string; note?: string; date?: string }) {
    return await request('/inventory/outbound', { method: 'POST', body: JSON.stringify(data) });
  },

  async health() {
    return await request<{ status: string }>('/inventory/health');
  },
};

// ── Quote API ───────────────────────────────────────────

export interface QuoteItem {
  id: string;
  product_id: string | null;
  product_name: string | null;
  description: string;
  material_type: string | null;
  dimensions: string | null;
  area_sqm: number | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  grade: string | null;
  notes: string | null;
}

export interface Quote {
  id: string;
  quote_number: string;
  contact_id: string;
  contact_name: string | null;
  title: string;
  status: string;
  subtotal: number;
  discount_pct: number;
  installation_fee: number;
  total: number;
  notes: string | null;
  valid_until: string | null;
  items: QuoteItem[];
  item_count: number;
  created_at: string | null;
  updated_at: string | null;
  sent_at: string | null;
  accepted_at: string | null;
}

export interface QuotePayload {
  contact_id: string | number;
  title: string;
  status?: string;
  notes?: string | null;
  valid_until?: string | null;
  discount_pct?: number;
  installation_fee?: number;
  items: Array<{
    product_id?: string | null;
    product_name?: string | null;
    description: string;
    material_type?: string | null;
    dimensions?: string | null;
    area_sqm?: number | null;
    unit_price: number;
    quantity: number;
    grade?: string | null;
    notes?: string | null;
  }>;
}

export const quotesApi = {
  async getQuotes(params?: { page?: number; per_page?: number; status?: string; contact_id?: string; search?: string }) {
    const qs = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    return await request<PaginatedResponse<Quote>>(`/quotes?${qs.toString()}`);
  },
  async getQuote(id: string) { return await request<Quote>(`/quotes/${id}`); },
  async createQuote(data: QuotePayload) {
    return await request<Quote>('/quotes', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateQuote(id: string, data: Partial<QuotePayload>) {
    return await request<Quote>(`/quotes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async updateStatus(id: string, status: string) {
    return await request<Quote>(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  },
  async deleteQuote(id: string) {
    return await request<{ message: string }>(`/quotes/${id}`, { method: 'DELETE' });
  },
};

// ── Roles API ───────────────────────────────────────────

export interface Role {
  id: string;
  name: string;
  color: string;
  permissions: Record<string, boolean>;
  position: number;
  is_system: boolean;
  created_at: string | null;
}

export const rolesApi = {
  async getAll() {
    return await request<Role[]>('/roles');
  },
  async create(data: { name: string; color: string; permissions: Record<string, boolean>; position?: number }) {
    return await request<Role>('/roles', { method: 'POST', body: JSON.stringify(data) });
  },
  async update(id: string, data: Partial<{ name: string; color: string; permissions: Record<string, boolean>; position: number }>) {
    return await request<Role>(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async delete(id: string) {
    return await request<{ message: string }>(`/roles/${id}`, { method: 'DELETE' });
  },
  async assignToUser(userId: string, roleId: string) {
    return await request<{ message: string }>(`/users/${userId}/roles`, { method: 'POST', body: JSON.stringify({ role_id: roleId }) });
  },
  async removeFromUser(userId: string, roleId: string) {
    return await request<{ message: string }>(`/users/${userId}/roles/${roleId}`, { method: 'DELETE' });
  },
};
