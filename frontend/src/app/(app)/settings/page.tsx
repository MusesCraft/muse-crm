'use client';

import { useState } from 'react';
import { mockQuickReplies, type QuickReply } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import {
  Settings,
  Plus,
  Trash2,
  Pencil,
  X,
  Save,
  Clock,
  AlertTriangle,
  Zap,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────

interface UrgencyRule {
  id: number;
  condition: string;
  keyword: string;
  urgency: 'high' | 'medium' | 'low';
}

// ── Customer Status Settings ───────────────────────────

function CustomerStatusCard() {
  const [activeDays, setActiveDays] = useState(3);
  const [silentDays, setSilentDays] = useState(3);
  const [unansweredHours, setUnansweredHours] = useState(24);

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
      <div className="flex items-center gap-2 mb-5">
        <Clock className="w-4 h-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">客戶狀態定義</h3>
      </div>

      <div className="space-y-4">
        {/* 活躍門檻 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">活躍門檻</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">最後互動在 X 天內視為「活躍」</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={30}
              value={activeDays}
              onChange={(e) => setActiveDays(Number(e.target.value))}
              className="w-16 text-sm text-center bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">天</span>
          </div>
        </div>

        {/* 沉默門檻 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">沉默門檻</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">超過 X 天未互動視為「沉默」</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={30}
              value={silentDays}
              onChange={(e) => setSilentDays(Number(e.target.value))}
              className="w-16 text-sm text-center bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">天</span>
          </div>
        </div>

        {/* 未回定義 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">未回定義</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">我方最後訊息後客戶 X 小時未回</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={168}
              value={unansweredHours}
              onChange={(e) => setUnansweredHours(Number(e.target.value))}
              className="w-16 text-sm text-center bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">小時</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Urgency Rules Card ─────────────────────────────────

function UrgencyRulesCard() {
  const [rules, setRules] = useState<UrgencyRule[]>([
    { id: 1, condition: '包含關鍵字', keyword: '報價', urgency: 'high' },
    { id: 2, condition: '包含關鍵字', keyword: '丈量', urgency: 'high' },
    { id: 3, condition: '包含關鍵字', keyword: '投訴,裂', urgency: 'high' },
    { id: 4, condition: '客戶標籤為', keyword: 'VIP', urgency: 'medium' },
  ]);

  const conditions = ['包含關鍵字', '訊息數超過', '客戶標籤為', '提及產品'];
  const urgencies: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];
  const urgencyLabels = { high: '高', medium: '中', low: '低' };
  const urgencyColors = {
    high: 'bg-red-500/10 text-red-600 dark:text-red-400',
    medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    low: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
  };

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      { id: Date.now(), condition: '包含關鍵字', keyword: '', urgency: 'medium' },
    ]);
  };

  const removeRule = (id: number) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRule = (id: number, field: keyof UrgencyRule, value: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">緊急度規則</h3>
        </div>
        <button
          onClick={addRule}
          className="flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          新增規則
        </button>
      </div>

      <div className="space-y-3">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center gap-2 p-3 bg-zinc-50 dark:bg-zinc-700/30 rounded-lg"
          >
            {/* Condition */}
            <select
              value={rule.condition}
              onChange={(e) => updateRule(rule.id, 'condition', e.target.value)}
              className="text-xs bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {conditions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Keyword */}
            <input
              type="text"
              value={rule.keyword}
              onChange={(e) => updateRule(rule.id, 'keyword', e.target.value)}
              placeholder="關鍵字..."
              className="flex-1 text-xs bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            {/* Urgency */}
            <span className="text-xs text-zinc-400 dark:text-zinc-500">→</span>
            <select
              value={rule.urgency}
              onChange={(e) => updateRule(rule.id, 'urgency', e.target.value)}
              className={cn(
                'text-xs border-0 rounded-lg px-2 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500',
                urgencyColors[rule.urgency]
              )}
            >
              {urgencies.map((u) => (
                <option key={u} value={u}>{urgencyLabels[u]}</option>
              ))}
            </select>

            {/* Delete */}
            <button
              onClick={() => removeRule(rule.id)}
              className="p-1 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {rules.length === 0 && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center py-4">尚無規則，點擊上方「+ 新增規則」開始</p>
        )}
      </div>
    </div>
  );
}

// ── Quick Replies Management Card ──────────────────────

function QuickRepliesManagementCard() {
  const [replies, setReplies] = useState<QuickReply[]>([...mockQuickReplies]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formCategory, setFormCategory] = useState('問候語');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');

  const categories = ['問候語', '產品介紹', '報價相關', '售後回覆'];

  const handleAdd = () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    const newReply: QuickReply = {
      id: Date.now(),
      category: formCategory,
      title: formTitle.trim(),
      content: formContent.trim(),
    };
    setReplies((prev) => [...prev, newReply]);
    setFormTitle('');
    setFormContent('');
    setShowAddForm(false);
  };

  const handleDelete = (id: number) => {
    setReplies((prev) => prev.filter((r) => r.id !== id));
  };

  const handleEdit = (reply: QuickReply) => {
    setEditingId(reply.id);
    setFormCategory(reply.category);
    setFormTitle(reply.title);
    setFormContent(reply.content);
  };

  const handleSaveEdit = () => {
    if (!formTitle.trim() || !formContent.trim() || !editingId) return;
    setReplies((prev) =>
      prev.map((r) =>
        r.id === editingId
          ? { ...r, category: formCategory, title: formTitle.trim(), content: formContent.trim() }
          : r
      )
    );
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
    setShowAddForm(false);
  };

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">預存語錄管理</h3>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setEditingId(null); setFormTitle(''); setFormContent(''); }}
          className="flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          新增語錄
        </button>
      </div>

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <div className="mb-4 p-4 bg-zinc-50 dark:bg-zinc-700/30 rounded-lg border border-zinc-200 dark:border-zinc-600 space-y-3">
          <div className="flex items-center gap-3">
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className="text-xs bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="標題..."
              className="flex-1 text-xs bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <textarea
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            placeholder="內容..."
            rows={2}
            className="w-full text-xs bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleCancelEdit}
              className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-3 py-1.5 rounded-md transition-colors"
            >
              取消
            </button>
            <button
              onClick={editingId ? handleSaveEdit : handleAdd}
              disabled={!formTitle.trim() || !formContent.trim()}
              className="flex items-center gap-1 text-xs font-medium bg-blue-500 text-white px-3 py-1.5 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-3 h-3" />
              {editingId ? '儲存' : '新增'}
            </button>
          </div>
        </div>
      )}

      {/* Replies List */}
      <div className="space-y-2">
        {categories.map((cat) => {
          const items = replies.filter((r) => r.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
                {cat}
              </p>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{item.title}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{item.content}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => handleEdit(item)}
                      className="p-1 text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Settings Page ─────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
            <Settings className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-white">設定</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">管理客戶狀態、緊急度規則與預存語錄</p>
          </div>
        </div>

        {/* Cards */}
        <div className="space-y-6">
          <CustomerStatusCard />
          <UrgencyRulesCard />
          <QuickRepliesManagementCard />
        </div>
      </div>
    </div>
  );
}
