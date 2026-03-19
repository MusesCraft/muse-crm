// API Client for MUSE CRM Backend
// Falls back to mock data when backend is unavailable

import {
  getMockConversations,
  getMockConversation,
  getMockContacts,
  getMockContactDetail,
  getMockActions,
  mockTags,
  mockDashboardStats,
  mockChannelDistribution,
  mockActivity,
} from './mock-data';

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

  // 401 → redirect to login
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('muse_token');
      window.location.href = '/login';
    }
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
  quick_intent?: string;
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
  async getConversations(params?: {
    page?: number;
    per_page?: number;
    status?: string;
    channel?: string;
    search?: string;
  }) {
    try {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', String(params.page));
      if (params?.per_page) searchParams.set('per_page', String(params.per_page));
      if (params?.status) searchParams.set('status', params.status);
      if (params?.channel) searchParams.set('channel', params.channel);
      if (params?.search) searchParams.set('search', params.search);
      const qs = searchParams.toString();
      return await request<PaginatedResponse<Conversation>>(`/inbox/conversations${qs ? `?${qs}` : ''}`);
    } catch {
      // Fallback to mock data
      return getMockConversations(params);
    }
  },

  async getConversation(id: number) {
    try {
      return await request<Conversation>(`/inbox/conversations/${id}`);
    } catch {
      const conv = getMockConversation(id);
      if (!conv) throw new ApiError(404, 'Not found');
      return conv;
    }
  },

  async closeConversation(id: number) {
    try {
      return await request<{ message: string }>(`/inbox/conversations/${id}/close`, { method: 'POST' });
    } catch {
      return { message: 'Conversation closed (mock)' };
    }
  },

  async analyzeConversation(id: number) {
    try {
      return await request<{ message: string; task_id: string }>(`/inbox/conversations/${id}/analyze`, {
        method: 'POST',
      });
    } catch {
      return { message: 'Analysis started (mock)', task_id: `mock-${id}-${Date.now()}` };
    }
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
    try {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', String(params.page));
      if (params?.per_page) searchParams.set('per_page', String(params.per_page));
      if (params?.search) searchParams.set('search', params.search);
      if (params?.tag) searchParams.set('tag', params.tag);
      if (params?.channel) searchParams.set('channel', params.channel);
      if (params?.source_type) searchParams.set('source_type', params.source_type);
      const qs = searchParams.toString();
      return await request<PaginatedResponse<Contact>>(`/contacts${qs ? `?${qs}` : ''}`);
    } catch {
      return getMockContacts(params);
    }
  },

  async getContact(id: number) {
    try {
      return await request<ContactDetail>(`/contacts/${id}`);
    } catch {
      const contact = getMockContactDetail(id);
      if (!contact) throw new ApiError(404, 'Not found');
      return contact;
    }
  },

  async addNote(contactId: number, content: string) {
    try {
      return await request<Note>(`/contacts/${contactId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
    } catch {
      return {
        id: Date.now(),
        contact_id: contactId,
        content,
        created_by: 'admin',
        created_at: new Date().toISOString(),
      } as Note;
    }
  },

  async addTag(contactId: number, tagName: string, category?: string) {
    try {
      return await request<Tag>(`/contacts/${contactId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tag_name: tagName, category }),
      });
    } catch {
      return {
        id: Date.now(),
        tag_name: tagName,
        category: category || null,
      } as Tag;
    }
  },

  async removeTag(contactId: number, tagId: number) {
    try {
      return await request<{ message: string }>(`/contacts/${contactId}/tags/${tagId}`, {
        method: 'DELETE',
      });
    } catch {
      return { message: 'Tag removed (mock)' };
    }
  },
};

// ── Tags API ───────────────────────────────────────────

export const tagsApi = {
  async getTags() {
    try {
      return await request<Tag[]>('/tags');
    } catch {
      return mockTags;
    }
  },
};

// ── Actions API ────────────────────────────────────────

export const actionsApi = {
  async getActions(params?: { status?: string; priority?: string; sort?: string; contact_id?: number }) {
    try {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      if (params?.priority) searchParams.set('priority', params.priority);
      if (params?.sort) searchParams.set('sort', params.sort);
      if (params?.contact_id) searchParams.set('contact_id', String(params.contact_id));
      const qs = searchParams.toString();
      return await request<Action[]>(`/actions${qs ? `?${qs}` : ''}`);
    } catch {
      return getMockActions(params);
    }
  },

  async updateAction(id: number, data: Partial<Pick<Action, 'status'>>) {
    try {
      return await request<Action>(`/actions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    } catch {
      // Return a mock updated action
      return { id, status: data.status || 'pending' } as Action;
    }
  },

  async createAction(data: {
    contact_id: number;
    action_type: string;
    description: string;
    priority: string;
    due_date?: string;
  }) {
    try {
      return await request<Action>('/actions', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch {
      return {
        id: Date.now(),
        ...data,
        conversation_id: null,
        status: 'pending',
        due_date: data.due_date || null,
        completed_at: null,
        created_at: new Date().toISOString(),
      } as Action;
    }
  },
};

// ── Dashboard API ──────────────────────────────────────

export const dashboardApi = {
  async getStats() {
    try {
      return await request<DashboardStats>('/dashboard/stats');
    } catch {
      return mockDashboardStats;
    }
  },

  async getChannelDistribution() {
    try {
      return await request<ChannelDistribution[]>('/dashboard/channel-distribution');
    } catch {
      return mockChannelDistribution;
    }
  },

  async getActivity(days = 30) {
    try {
      return await request<ActivityPoint[]>(`/dashboard/activity?days=${days}`);
    } catch {
      return mockActivity.slice(-days);
    }
  },
};
