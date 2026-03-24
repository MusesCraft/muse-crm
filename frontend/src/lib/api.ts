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

  if (res.status === 401) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }

  return res.json();
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
  avatar_url: string | null;
  source_type: string;
  first_seen: string;
  last_seen: string;
  conversation_count: number;
  tags?: Tag[];
  priority?: 'high' | 'medium' | 'low';
}

export interface Tag {
  id: string | number;
  tag_name: string;
  category: string | null;
  contact_count?: number;
  created_at?: string;
}

export interface Message {
  id: string | number;
  conversation_id: string | number;
  sender_type: 'customer' | 'business' | 'system';
  message_type: string;
  content: string;
  media_url: string | null;
  timestamp: string;
  is_read: boolean;
  platform_message_id: string | null;
  quick_intent?: string;
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
}

export interface Action {
  id: string | number;
  contact_id: string | number;
  conversation_id: string | number | null;
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
  created_by: string;
  created_at: string;
}

export interface ContactDetail extends Contact {
  tags: Tag[];
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
    tags: raw.tags?.map(transformTag) || [],
    priority: raw.priority || undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformTag(raw: any): Tag {
  return {
    id: raw.id,
    tag_name: raw.tag_name || raw.name || '',
    category: raw.category ?? null,
    contact_count: raw.contact_count,
    created_at: raw.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformMessage(raw: any): Message {
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
    quick_intent: raw.quick_intent || undefined,
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
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformAction(raw: any): Action {
  return {
    id: raw.id,
    contact_id: raw.contact_id,
    conversation_id: raw.conversation_id ?? null,
    action_type: raw.action_type || raw.source || 'followup',
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
  return {
    id: raw.id,
    contact_id: raw.contact_id,
    content: raw.content || '',
    created_by: raw.created_by || raw.author_id || 'system',
    created_at: raw.created_at || '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformContactDetail(raw: any): ContactDetail {
  const base = transformContact(raw);
  return {
    ...base,
    tags: raw.tags?.map(transformTag) || [],
    conversations: raw.conversations?.map(transformConversation) || [],
    analyses: raw.analyses?.map(transformAnalysis) || [],
    actions: raw.actions?.map(transformAction) || [],
    notes: raw.notes?.map(transformNote) || [],
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
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.per_page) searchParams.set('per_page', String(params.per_page));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.channel) searchParams.set('channel', params.channel);
    if (params?.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/inbox/conversations${qs ? `?${qs}` : ''}`);
    return {
      data: (raw.data || []).map(transformConversation),
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

// ── Contacts API ───────────────────────────────────────

export const contactsApi = {
  async getContacts(params?: {
    page?: number;
    per_page?: number;
    search?: string;
    tag?: string;
    channel?: string;
    source_type?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.per_page) searchParams.set('per_page', String(params.per_page));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.tag) searchParams.set('tag', params.tag);
    if (params?.channel) searchParams.set('channel', params.channel);
    if (params?.source_type) searchParams.set('source_type', params.source_type);
    const qs = searchParams.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/contacts${qs ? `?${qs}` : ''}`);
    return {
      data: (raw.data || []).map(transformContact),
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
    // Backend wraps in { message, note }
    const noteData = raw.note || raw;
    return transformNote(noteData);
  },

  async addTag(contactId: string | number, tagName: string, category?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any>(`/contacts/${contactId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag_name: tagName, category }),
    });
    // Backend wraps in { message, tag }
    const tagData = raw.tag || raw;
    return transformTag(tagData);
  },

  async removeTag(contactId: string | number, tagId: string | number) {
    return await request<{ message: string }>(`/contacts/${contactId}/tags/${tagId}`, {
      method: 'DELETE',
    });
  },
};

// ── Tags API ───────────────────────────────────────────

export const tagsApi = {
  async getTags() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await request<any[]>('/tags');
    return (raw || []).map(transformTag);
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
    const raw = await request<any[]>(`/actions${qs ? `?${qs}` : ''}`);
    return (raw || []).map(transformAction);
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
    action_type: string;
    description: string;
    priority: string;
    due_date?: string;
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

export interface QuickReplyItem {
  id: string;
  title: string;
  category: string;
  priority: string;
  trigger: string;
  trigger_keywords: string[];
  user_identity: string | null;
  channel: string;
  content: string;
  attachments: { type: string; label: string; value: string }[];
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
};

// ── Inbox Image API ────────────────────────────────────

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

// ── Dashboard API ──────────────────────────────────────

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
  async getUsageSummary(period: 'day' | 'week' | 'month') {
    return await request<LlmUsageSummary>(`/llm/usage/summary?period=${period}`);
  },

  async getBudget() {
    return await request<LlmBudget>('/llm/budget');
  },
};
