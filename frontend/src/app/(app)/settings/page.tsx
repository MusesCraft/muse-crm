'use client';

import { useState, useEffect } from 'react';
import { mockQuickReplies, type QuickReply } from '@/lib/mock-data';
import { quickRepliesApi, llmApi, type QuickReplyItem, type LlmUsageSummary, type LlmBudget } from '@/lib/api';
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
  Link2,
  Brain,
  Bell,
  Copy,
  CheckCircle,
  DollarSign,
  Loader2,
} from 'lucide-react';

// ── Tab system ─────────────────────────────────────────

type TabId = 'integration' | 'ai' | 'quick-replies' | 'notifications' | 'status' | 'urgency' | 'llm-cost';

const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'integration', label: 'LINE 整合', icon: Link2 },
  { id: 'ai', label: 'AI 模型', icon: Brain },
  { id: 'llm-cost', label: 'LLM 成本', icon: DollarSign },
  { id: 'quick-replies', label: '快捷回覆', icon: Zap },
  { id: 'notifications', label: '通知偏好', icon: Bell },
  { id: 'status', label: '客戶狀態', icon: Clock },
  { id: 'urgency', label: '緊急度規則', icon: AlertTriangle },
];

// ── LINE Integration Card ──────────────────────────────

function IntegrationCard() {
  const [copied, setCopied] = useState<string | null>(null);

  const configs = [
    { label: 'Webhook URL', value: 'https://crm.musecraft.com/api/v1/webhook/line', readonly: true },
    { label: 'Channel Access Token', value: '••••••••••••••••••••••••Abc123', readonly: true },
    { label: 'Channel Secret', value: '••••••••••••def456', readonly: true },
    { label: '狀態', value: '✅ 已連接', readonly: true, isStatus: true },
  ];

  const handleCopy = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">LINE 官方帳號整合設定，Webhook 資訊為唯讀。</p>
      {configs.map((config) => (
        <div key={config.label} className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">{config.label}</label>
            {config.isStatus ? (
              <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{config.value}</span>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={config.value}
                  readOnly
                  className="flex-1 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-600 dark:text-zinc-300 font-mono"
                />
                <button
                  onClick={() => handleCopy(config.label, config.value)}
                  className="p-2 rounded-lg text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {copied === config.label ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── AI Model Card ──────────────────────────────────────

function AIModelCard() {
  const [model, setModel] = useState('gpt-4o');
  const [temperature, setTemperature] = useState(0.3);
  const [autoAnalysis, setAutoAnalysis] = useState(true);

  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">配置 AI 分析模型與參數。</p>

      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200 mb-1.5 block">分析模型</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
        >
          <option value="gpt-4o">GPT-4o（推薦）</option>
          <option value="gpt-4o-mini">GPT-4o Mini（快速）</option>
          <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
          <option value="claude-3-haiku">Claude 3 Haiku（經濟）</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200 mb-1.5 block">
          溫度（Temperature）: {temperature}
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
        <div className="flex justify-between text-[10px] text-zinc-400">
          <span>精確 (0)</span>
          <span>創意 (1)</span>
        </div>
      </div>

      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">自動分析</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">對話結束後自動觸發 AI 分析</p>
        </div>
        <button
          onClick={() => setAutoAnalysis(!autoAnalysis)}
          className={cn(
            'w-11 h-6 rounded-full transition-colors relative',
            autoAnalysis ? 'bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-600'
          )}
        >
          <div className={cn(
            'w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm',
            autoAnalysis ? 'translate-x-[22px]' : 'translate-x-0.5'
          )} />
        </button>
      </div>
    </div>
  );
}

// ── Notifications Card ─────────────────────────────────

function NotificationsCard() {
  const [settings, setSettings] = useState({
    newMessage: true,
    urgentOnly: false,
    dailyDigest: true,
    sound: true,
  });

  const toggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const items = [
    { key: 'newMessage' as const, label: '新訊息通知', desc: '收到新客戶訊息時通知' },
    { key: 'urgentOnly' as const, label: '僅緊急通知', desc: '只在高緊急度訊息時通知' },
    { key: 'dailyDigest' as const, label: '每日摘要', desc: '每天上午 9:00 發送摘要' },
    { key: 'sound' as const, label: '通知音效', desc: '啟用通知音效' },
  ];

  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">自定義通知方式與頻率。</p>
      {items.map((item) => (
        <div key={item.key} className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{item.label}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{item.desc}</p>
          </div>
          <button
            onClick={() => toggle(item.key)}
            className={cn(
              'w-11 h-6 rounded-full transition-colors relative',
              settings[item.key] ? 'bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-600'
            )}
          >
            <div className={cn(
              'w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm',
              settings[item.key] ? 'translate-x-[22px]' : 'translate-x-0.5'
            )} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Customer Status Card ───────────────────────────────

function CustomerStatusCard() {
  const [activeDays, setActiveDays] = useState(3);
  const [silentDays, setSilentDays] = useState(3);
  const [unansweredHours, setUnansweredHours] = useState(24);

  const items = [
    { label: '活躍門檻', desc: '最後互動在 X 天內視為「活躍」', value: activeDays, onChange: setActiveDays, unit: '天', min: 1, max: 30 },
    { label: '沉默門檻', desc: '超過 X 天未互動視為「沉默」', value: silentDays, onChange: setSilentDays, unit: '天', min: 1, max: 30 },
    { label: '未回定義', desc: '我方最後訊息後客戶 X 小時未回', value: unansweredHours, onChange: setUnansweredHours, unit: '小時', min: 1, max: 168 },
  ];

  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">定義客戶活躍狀態的時間門檻。</p>
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{item.label}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{item.desc}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={item.min}
              max={item.max}
              value={item.value}
              onChange={(e) => item.onChange(Number(e.target.value))}
              className="w-16 text-sm text-center bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Urgency Rules Card ─────────────────────────────────

interface UrgencyRule {
  id: number;
  condition: string;
  keyword: string;
  urgency: 'high' | 'medium' | 'low';
}

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
    setRules((prev) => [...prev, { id: Date.now(), condition: '包含關鍵字', keyword: '', urgency: 'medium' }]);
  };
  const removeRule = (id: number) => setRules((prev) => prev.filter((r) => r.id !== id));
  const updateRule = (id: number, field: keyof UrgencyRule, value: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">定義訊息緊急度自動判定規則。</p>
        <button
          onClick={addRule}
          className="flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-600 dark:text-indigo-400"
        >
          <Plus className="w-3.5 h-3.5" /> 新增規則
        </button>
      </div>

      <div className="space-y-3">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
            <select
              value={rule.condition}
              onChange={(e) => updateRule(rule.id, 'condition', e.target.value)}
              className="text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text"
              value={rule.keyword}
              onChange={(e) => updateRule(rule.id, 'keyword', e.target.value)}
              placeholder="關鍵字..."
              className="flex-1 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <span className="text-xs text-zinc-400">→</span>
            <select
              value={rule.urgency}
              onChange={(e) => updateRule(rule.id, 'urgency', e.target.value)}
              className={cn('text-xs border-0 rounded-lg px-2 py-1.5 font-medium', urgencyColors[rule.urgency])}
            >
              {urgencies.map((u) => <option key={u} value={u}>{urgencyLabels[u]}</option>)}
            </select>
            <button onClick={() => removeRule(rule.id)} className="p-1 text-zinc-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {rules.length === 0 && <p className="text-xs text-zinc-400 text-center py-4">尚無規則</p>}
      </div>
    </div>
  );
}

// ── Quick Replies Management ───────────────────────────

function QuickRepliesManagementCard() {
  const [replies, setReplies] = useState<QuickReply[]>([...mockQuickReplies]);
  const [apiReplies, setApiReplies] = useState<QuickReplyItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formCategory, setFormCategory] = useState('問候語');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');

  // Try to load from API
  useEffect(() => {
    quickRepliesApi.getAll().then((res) => {
      console.log('Quick replies loaded:', res);
      if (res.data && res.data.length > 0) {
        setApiReplies(res.data);
      }
    }).catch((err) => {
      console.error('Quick replies load failed:', err);
    });
  }, []);

  const categories = ['問候語', '產品介紹', '報價相關', '售後回覆'];

  const handleAdd = () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    setReplies((prev) => [...prev, { id: Date.now(), category: formCategory, title: formTitle.trim(), content: formContent.trim() }]);
    setFormTitle(''); setFormContent(''); setShowAddForm(false);
  };

  const handleDelete = (id: number) => setReplies((prev) => prev.filter((r) => r.id !== id));

  const handleEdit = (reply: QuickReply) => {
    setEditingId(reply.id); setFormCategory(reply.category); setFormTitle(reply.title); setFormContent(reply.content);
  };

  const handleSaveEdit = () => {
    if (!formTitle.trim() || !formContent.trim() || !editingId) return;
    setReplies((prev) => prev.map((r) => r.id === editingId ? { ...r, category: formCategory, title: formTitle.trim(), content: formContent.trim() } : r));
    setEditingId(null); setFormTitle(''); setFormContent('');
  };

  const handleCancelEdit = () => { setEditingId(null); setFormTitle(''); setFormContent(''); setShowAddForm(false); };

  // Show API replies if available, otherwise mock
  const displayReplies = apiReplies.length > 0 ? apiReplies.map((r, i) => ({
    id: i + 10000,
    category: r.category,
    title: r.title,
    content: r.content,
  })) : replies;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          管理預存語錄，供收件匣快速回覆使用。
          {apiReplies.length > 0 && <span className="text-emerald-500 ml-1">（已連接 API，{apiReplies.length} 條語錄）</span>}
        </p>
        <button
          onClick={() => { setShowAddForm(true); setEditingId(null); setFormTitle(''); setFormContent(''); }}
          className="flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-600 dark:text-indigo-400"
        >
          <Plus className="w-3.5 h-3.5" /> 新增語錄
        </button>
      </div>

      {(showAddForm || editingId) && (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-3">
          <div className="flex items-center gap-3">
            <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}
              className="text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="標題..."
              className="flex-1 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>
          <textarea value={formContent} onChange={(e) => setFormContent(e.target.value)} placeholder="內容..." rows={2}
            className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          <div className="flex items-center gap-2 justify-end">
            <button onClick={handleCancelEdit} className="text-xs font-medium text-zinc-500 px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700">取消</button>
            <button onClick={editingId ? handleSaveEdit : handleAdd} disabled={!formTitle.trim() || !formContent.trim()}
              className="flex items-center gap-1 text-xs font-medium bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors">
              <Save className="w-3 h-3" /> {editingId ? '儲存' : '新增'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {categories.map((cat) => {
          const items = displayReplies.filter((r) => r.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">{cat}</p>
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{item.title}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{item.content}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => handleEdit(item as QuickReply)} className="p-1 text-zinc-400 hover:text-indigo-500"><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-1 text-zinc-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
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

// ── LLM Cost Dashboard ─────────────────────────────────

type LlmPeriod = 'day' | 'week' | 'month';
const periodLabels: Record<LlmPeriod, string> = { day: '日', week: '週', month: '月' };

function LlmCostCard() {
  const [period, setPeriod] = useState<LlmPeriod>('month');
  const [summary, setSummary] = useState<LlmUsageSummary | null>(null);
  const [budget, setBudget] = useState<LlmBudget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      llmApi.getUsageSummary(period).catch(() => null),
      llmApi.getBudget().catch(() => null),
    ]).then(([s, b]) => {
      setSummary(s);
      setBudget(b);
      if (!s && !b) setError('無法載入 LLM 用量資料');
    }).finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        <span className="ml-2 text-sm text-zinc-400">載入中…</span>
      </div>
    );
  }

  if (error && !summary && !budget) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">請確認後端 /api/v1/llm/* 端點已啟用</p>
      </div>
    );
  }

  const budgetPct = budget && budget.monthly_limit > 0
    ? Math.min(100, Math.round((budget.current_usage / budget.monthly_limit) * 100))
    : 0;
  const budgetColor = budgetPct >= 90 ? 'bg-red-500' : budgetPct >= 70 ? 'bg-amber-500' : 'bg-indigo-500';

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">監控 LLM API 用量與成本。</p>

      {/* Period selector */}
      <div className="flex items-center gap-1 p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-fit">
        {(['day', 'week', 'month'] as LlmPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              period === p
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            )}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">總 Tokens</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">
              {summary.total_tokens.toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">總成本</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">
              ${summary.total_cost.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Budget progress */}
      {budget && (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">月預算</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              ${budget.current_usage.toFixed(2)} / ${budget.monthly_limit.toFixed(2)}
            </p>
          </div>
          <div className="w-full h-2.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', budgetColor)}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              已使用 {budgetPct}%
            </p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              剩餘 ${budget.remaining.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* By model table */}
      {summary && summary.by_model.length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-2">依模型分類</p>
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="text-left px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">模型</th>
                  <th className="text-right px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">Tokens</th>
                  <th className="text-right px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">成本</th>
                </tr>
              </thead>
              <tbody>
                {summary.by_model.map((row) => (
                  <tr key={row.model} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200 font-mono">{row.model}</td>
                    <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-300">{row.tokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-300">${row.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By task_type table */}
      {summary && summary.by_task_type.length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-2">依任務類型分類</p>
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="text-left px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">類型</th>
                  <th className="text-right px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">次數</th>
                  <th className="text-right px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">Tokens</th>
                  <th className="text-right px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">成本</th>
                </tr>
              </thead>
              <tbody>
                {summary.by_task_type.map((row) => (
                  <tr key={row.task_type} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">{row.task_type}</td>
                    <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-300">{row.count}</td>
                    <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-300">{row.tokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-300">${row.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Settings Page ─────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('integration');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'integration': return <IntegrationCard />;
      case 'ai': return <AIModelCard />;
      case 'quick-replies': return <QuickRepliesManagementCard />;
      case 'notifications': return <NotificationsCard />;
      case 'status': return <CustomerStatusCard />;
      case 'urgency': return <UrgencyRulesCard />;
      case 'llm-cost': return <LlmCostCard />;
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            <Settings className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-white">設定</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">管理系統整合、AI 模型與偏好設定</p>
          </div>
        </div>

        {/* Tabs + Content */}
        <div className="flex gap-6">
          {/* Tab Navigation */}
          <div className="w-48 flex-shrink-0">
            <nav className="space-y-0.5">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                      isActive
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                        : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800'
                    )}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
              {tabs.find((t) => t.id === activeTab)?.label}
            </h2>
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
