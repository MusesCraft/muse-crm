// API Client for MUSE CRM Backend
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

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
  id: number;
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
}

export interface Tag {
  id: number;
  tag_name: string;
  category: string | null;
  contact_count?: number;
  created_at?: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_type: 'customer' | 'business' | 'system';
  message_type: string;
  content: string;
  media_url: string | null;
  timestamp: string;
  is_read: boolean;
  platform_message_id: string | null;
}

export interface Analysis {
  id: number;
  conversation_id: number;
  analysis_type: string;
  result: Record<string, unknown>;
  model_used: string;
  created_at: string;
}

export interface Conversation {
  id: number;
  contact_id: number;
  channel: string;
  status: string;
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
  id: number;
  contact_id: number;
  conversation_id: number | null;
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
  id: number;
  contact_id: number;
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

// ── Inbox API ──────────────────────────────────────────

export const inboxApi = {
  getConversations(params?: {
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
    return request<PaginatedResponse<Conversation>>(`/inbox/conversations${qs ? `?${qs}` : ''}`);
  },

  getConversation(id: number) {
    return request<Conversation>(`/inbox/conversations/${id}`);
  },

  closeConversation(id: number) {
    return request<{ message: string }>(`/inbox/conversations/${id}/close`, { method: 'POST' });
  },
};

// ── Contacts API ───────────────────────────────────────

export const contactsApi = {
  getContacts(params?: {
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
    return request<PaginatedResponse<Contact>>(`/contacts${qs ? `?${qs}` : ''}`);
  },

  getContact(id: number) {
    return request<ContactDetail>(`/contacts/${id}`);
  },

  addNote(contactId: number, content: string) {
    return request<Note>(`/contacts/${contactId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  addTag(contactId: number, tagName: string, category?: string) {
    return request<Tag>(`/contacts/${contactId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag_name: tagName, category }),
    });
  },

  removeTag(contactId: number, tagId: number) {
    return request<{ message: string }>(`/contacts/${contactId}/tags/${tagId}`, {
      method: 'DELETE',
    });
  },
};

// ── Tags API ───────────────────────────────────────────

export const tagsApi = {
  getTags() {
    return request<Tag[]>('/tags');
  },
};

// ── Actions API ────────────────────────────────────────

export const actionsApi = {
  getActions(params?: { status?: string; contact_id?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.contact_id) searchParams.set('contact_id', String(params.contact_id));
    const qs = searchParams.toString();
    return request<Action[]>(`/actions${qs ? `?${qs}` : ''}`);
  },

  updateAction(id: number, data: Partial<Pick<Action, 'status'>>) {
    return request<Action>(`/actions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  createAction(data: {
    contact_id: number;
    action_type: string;
    description: string;
    priority: string;
    due_date?: string;
  }) {
    return request<Action>('/actions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ── Dashboard API ──────────────────────────────────────

export const dashboardApi = {
  getStats() {
    return request<DashboardStats>('/dashboard/stats');
  },

  getChannelDistribution() {
    return request<ChannelDistribution[]>('/dashboard/channel-distribution');
  },

  getActivity(days = 30) {
    return request<ActivityPoint[]>(`/dashboard/activity?days=${days}`);
  },
};
