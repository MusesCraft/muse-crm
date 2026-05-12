// Mock Data for MUSE CRM — 岩板建材銷售場景（精簡版，後端不可用時 fallback）
// PR-1/PR-2 後重寫：移除 tags / broadcasts，新增 customer_identity / sales_stage。

import type {
  Contact,
  ContactDetail,
  Conversation,
  Message,
  Action,
  Note,
  DashboardStats,
  ChannelDistribution,
  ActivityPoint,
  PaginatedResponse,
} from './api';

// ── Helpers ────────────────────────────────────────────

function daysAgo(days: number, hours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours, 0, 0, 0);
  return d.toISOString();
}

function hoursAgo(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours, 0, 0, 0);
  return d.toISOString();
}

function minutesAgo(minutes: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - minutes, 0, 0);
  return d.toISOString();
}

// ── Contacts ───────────────────────────────────────────

export const mockContacts: Contact[] = [
  {
    id: 1,
    platform_id: 'fb_wang_designer',
    name: '王設計師',
    display_name: '王雅婷 Interior Design',
    channel: 'messenger',
    avatar_url: null,
    source_type: 'organic',
    first_seen: daysAgo(14),
    last_seen: minutesAgo(35),
    conversation_count: 2,
    priority: 'medium',
    customer_identity: 'designer',
    sales_stage: 'evaluating',
    contact_status: 'following_up',
    intent: 'interested',
  },
  {
    id: 2,
    platform_id: 'ig_chen_mr',
    name: '陳先生',
    display_name: 'chen_home_2026',
    channel: 'instagram',
    avatar_url: null,
    source_type: 'organic',
    first_seen: daysAgo(5),
    last_seen: hoursAgo(2),
    conversation_count: 1,
    priority: 'low',
    customer_identity: 'homeowner',
    sales_stage: 'initial',
    contact_status: 'new',
    intent: 'browsing',
  },
  {
    id: 3,
    platform_id: 'line_lin_ms',
    name: '林小姐',
    display_name: '宏達建材行-林',
    channel: 'line',
    avatar_url: null,
    source_type: 'organic',
    first_seen: daysAgo(60),
    last_seen: hoursAgo(5),
    conversation_count: 3,
    priority: 'high',
    customer_identity: 'dealer',
    sales_stage: 'quoted',
    contact_status: 'quoted',
    intent: 'ready_to_buy',
  },
];

// ── Messages ───────────────────────────────────────────

export const mockMessages: Message[] = [
  {
    id: 1,
    conversation_id: 1,
    sender_type: 'customer',
    message_type: 'text',
    content: '請問米白色岩板 90x270 有現貨嗎？',
    media_url: null,
    timestamp: minutesAgo(60),
    is_read: true,
    platform_message_id: 'mid_1',
  },
  {
    id: 2,
    conversation_id: 1,
    sender_type: 'business',
    message_type: 'text',
    content: '有的，目前庫存 12 片，請問需要的數量？',
    media_url: null,
    timestamp: minutesAgo(45),
    is_read: true,
    platform_message_id: null,
  },
];

// ── Conversations ──────────────────────────────────────

export const mockConversations: Conversation[] = [
  {
    id: 1,
    contact_id: 1,
    channel: 'messenger',
    status: 'active',
    urgency: 'medium',
    started_at: daysAgo(2),
    ended_at: null,
    message_count: 12,
    platform_conversation_id: 'conv_1',
    contact: mockContacts[0],
    last_message: mockMessages[1],
  },
  {
    id: 2,
    contact_id: 2,
    channel: 'instagram',
    status: 'waiting_customer',
    urgency: 'low',
    started_at: hoursAgo(5),
    ended_at: null,
    message_count: 5,
    platform_conversation_id: 'conv_2',
    contact: mockContacts[1],
  },
  {
    id: 3,
    contact_id: 3,
    channel: 'line',
    status: 'escalated',
    urgency: 'high',
    started_at: daysAgo(1),
    ended_at: null,
    message_count: 23,
    platform_conversation_id: 'conv_3',
    contact: mockContacts[2],
  },
];

// ── Actions ────────────────────────────────────────────

export const mockActions: Action[] = [
  {
    id: 1,
    contact_id: 1,
    conversation_id: 1,
    source: 'llm',
    action_type: 'quote',
    description: '提供米白色岩板正式報價單',
    priority: 'high',
    status: 'pending',
    due_date: daysAgo(-2),
    completed_at: null,
    created_at: hoursAgo(2),
    contact: mockContacts[0],
  },
  {
    id: 2,
    contact_id: 3,
    conversation_id: 3,
    source: 'manual',
    action_type: 'visit',
    description: '安排師傅實地丈量',
    priority: 'medium',
    status: 'in_progress',
    due_date: daysAgo(-5),
    completed_at: null,
    created_at: daysAgo(1),
    contact: mockContacts[2],
  },
];

// ── Notes ──────────────────────────────────────────────

export const mockNotes: Note[] = [
  {
    id: 1,
    contact_id: 1,
    content: '客戶偏好米白與淺灰色系，預算約 30 萬。',
    author_id: 'user_1',
    created_by: '小陳',
    created_at: daysAgo(3),
  },
];

// ── ContactDetail（合成單一聯絡人完整資料） ────────────────

export function mockContactDetail(id: string | number): ContactDetail {
  const contact = mockContacts.find((c) => String(c.id) === String(id)) || mockContacts[0];
  return {
    ...contact,
    phone: '0912-345-678',
    email: 'sample@example.com',
    notes_text: '客戶偏好米白與淺灰色系。',
    conversations: mockConversations.filter((c) => c.contact_id === contact.id),
    analyses: [],
    actions: mockActions.filter((a) => a.contact_id === contact.id),
    notes: mockNotes.filter((n) => n.contact_id === contact.id),
  };
}

// ── Pagination Helper ──────────────────────────────────

export function mockPaginated<T>(items: T[], page = 1, perPage = 20): PaginatedResponse<T> {
  const start = (page - 1) * perPage;
  return {
    data: items.slice(start, start + perPage),
    pagination: {
      page,
      per_page: perPage,
      total: items.length,
      pages: Math.max(1, Math.ceil(items.length / perPage)),
    },
  };
}

// ── Dashboard ──────────────────────────────────────────

export const mockDashboardStats: DashboardStats = {
  total_contacts: mockContacts.length,
  total_conversations: mockConversations.length,
  active_conversations: 2,
  total_messages: 40,
  pending_actions: 1,
  urgency_distribution: { high: 1, medium: 1, low: 1 },
  status_distribution: { active: 1, silent: 1, unanswered: 1 },
  today_messages: { count: 5, yesterdayCount: 3 },
  channel_distribution: [
    { channel: 'messenger', count: 1 },
    { channel: 'instagram', count: 1 },
    { channel: 'line', count: 1 },
  ],
  contact_status: { new: 1, following_up: 1, quoted: 1 },
  intent_distribution: { browsing: 1, interested: 1, ready_to_buy: 1 },
  avg_response_hours: 1.5,
  conversion_funnel: { total: 3, engaged: 2, quoted: 1, won: 0 },
  top_conversations: mockConversations.map((c) => ({
    id: String(c.id),
    contact_name: c.contact?.name || '未知',
    channel: c.channel,
    message_count: c.message_count,
    status: c.status,
    last_message_at: c.last_message?.timestamp ?? null,
  })),
  message_activity: Array.from({ length: 7 }, (_, i) => ({
    date: daysAgo(6 - i).slice(0, 10),
    count: Math.floor(Math.random() * 20) + 5,
  })),
};

export const mockChannelDistribution: ChannelDistribution[] =
  mockDashboardStats.channel_distribution || [];

export const mockActivityPoints: ActivityPoint[] = Array.from({ length: 14 }, (_, i) => ({
  date: daysAgo(13 - i).slice(0, 10),
  messages: Math.floor(Math.random() * 30) + 10,
  conversations: Math.floor(Math.random() * 8) + 2,
}));
