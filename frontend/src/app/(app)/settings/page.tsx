'use client';

import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { quickRepliesApi, llmApi, type QuickReplyAttachment, type QuickReplyItem, type LlmUsageSummary, type LlmBudget } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Settings,
  Plus,
  Trash2,
  Pencil,
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
  Image as ImageIcon,
  Loader2,
  Shield,
  X,
} from 'lucide-react';
import RolesTab from './roles-tab';

// ── Tab system ─────────────────────────────────────────

type TabId = 'integration' | 'ai' | 'quick-replies' | 'notifications' | 'status' | 'urgency' | 'llm-cost' | 'roles';

const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'integration', label: 'LINE 整合', icon: Link2 },
  { id: 'ai', label: 'AI 模型', icon: Brain },
  { id: 'llm-cost', label: 'LLM 成本', icon: DollarSign },
  { id: 'quick-replies', label: '快捷回覆', icon: Zap },
  { id: 'notifications', label: '通知偏好', icon: Bell },
  { id: 'status', label: '客戶狀態', icon: Clock },
  { id: 'urgency', label: '緊急度規則', icon: AlertTriangle },
  { id: 'roles', label: '身份組', icon: Shield },
];

// ── LINE Integration Card ──────────────────────────────

function IntegrationCard() {
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const idPrefix = useId();

  useEffect(() => () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current); }, []);

  const configs = [
    { key: 'webhook-url', label: 'Webhook URL', value: 'https://crm.musecraft.com/api/v1/webhook/line', readonly: true },
    { key: 'channel-token', label: 'Channel Access Token', value: '••••••••••••••••••••••••Abc123', readonly: true },
    { key: 'channel-secret', label: 'Channel Secret', value: '••••••••••••def456', readonly: true },
    { key: 'status', label: '狀態', value: '已連接', readonly: true, isStatus: true },
  ];

  const handleCopy = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">LINE 官方帳號整合設定，Webhook 資訊為唯讀。</p>
      {configs.map((config) => {
        const inputId = `${idPrefix}-${config.key}`;
        return (
          <div key={config.key} className="flex items-center gap-3">
            <div className="flex-1">
              <Label htmlFor={inputId} className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">{config.label}</Label>
              {config.isStatus ? (
                <span id={inputId} className="text-sm text-emerald-600 dark:text-emerald-400 font-medium block"><span role="img" aria-label="已連接">&#x2705;</span> {config.value}</span>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    id={inputId}
                    type="text"
                    value={config.value}
                    readOnly
                    className="flex-1 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-600 dark:text-zinc-300 font-mono"
                  />
                  <button
                    onClick={() => handleCopy(config.label, config.value)}
                    aria-label={`複製${config.label}`}
                    className="p-2 rounded-lg text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {copied === config.label ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── AI Model Card ──────────────────────────────────────

function AIModelCard() {
  const [model, setModel] = useState('gpt-4o');
  const [temperature, setTemperature] = useState(0.3);
  const [autoAnalysis, setAutoAnalysis] = useState(true);
  const idPrefix = useId();

  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">配置 AI 分析模型與參數。</p>

      <div>
        <Label htmlFor={`${idPrefix}-model`} className="text-sm font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">分析模型</Label>
        <select
          id={`${idPrefix}-model`}
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
        <Label htmlFor={`${idPrefix}-temperature`} className="text-sm font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
          溫度（Temperature）: {temperature}
        </Label>
        <input
          id={`${idPrefix}-temperature`}
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
          <Label htmlFor={`${idPrefix}-auto-analysis`} className="text-sm font-medium text-zinc-700 dark:text-zinc-200">自動分析</Label>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">對話結束後自動觸發 AI 分析</p>
        </div>
        <button
          id={`${idPrefix}-auto-analysis`}
          role="switch"
          aria-checked={autoAnalysis}
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
  const idPrefix = useId();

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
            <Label htmlFor={`${idPrefix}-${item.key}`} className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{item.label}</Label>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{item.desc}</p>
          </div>
          <button
            id={`${idPrefix}-${item.key}`}
            role="switch"
            aria-checked={settings[item.key]}
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
  const idPrefix = useId();

  const items = [
    { key: 'active', label: '活躍門檻', desc: '最後互動在 X 天內視為「活躍」', value: activeDays, onChange: setActiveDays, unit: '天', min: 1, max: 30 },
    { key: 'silent', label: '沉默門檻', desc: '超過 X 天未互動視為「沉默」', value: silentDays, onChange: setSilentDays, unit: '天', min: 1, max: 30 },
    { key: 'unanswered', label: '未回定義', desc: '我方最後訊息後客戶 X 小時未回', value: unansweredHours, onChange: setUnansweredHours, unit: '小時', min: 1, max: 168 },
  ];

  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">定義客戶活躍狀態的時間門檻。</p>
      {items.map((item) => (
        <div key={item.key} className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
          <div>
            <Label htmlFor={`${idPrefix}-${item.key}`} className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{item.label}</Label>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{item.desc}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              id={`${idPrefix}-${item.key}`}
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
              aria-label="條件類型"
              className="text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text"
              value={rule.keyword}
              onChange={(e) => updateRule(rule.id, 'keyword', e.target.value)}
              placeholder="關鍵字..."
              aria-label="關鍵字"
              className="flex-1 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <span className="text-xs text-zinc-400" aria-hidden="true">&#x2192;</span>
            <select
              value={rule.urgency}
              onChange={(e) => updateRule(rule.id, 'urgency', e.target.value)}
              aria-label="緊急度"
              className={cn('text-xs border-0 rounded-lg px-2 py-1.5 font-medium', urgencyColors[rule.urgency])}
            >
              {urgencies.map((u) => <option key={u} value={u}>{urgencyLabels[u]}</option>)}
            </select>
            <button onClick={() => removeRule(rule.id)} aria-label="刪除規則" className="p-1 text-zinc-400 hover:text-red-500 transition-colors">
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
  const [apiReplies, setApiReplies] = useState<QuickReplyItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formCategory, setFormCategory] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formAttachments, setFormAttachments] = useState<QuickReplyAttachment[]>([]);
  const [formAttachmentUrl, setFormAttachmentUrl] = useState('');
  const [formAttachmentLabel, setFormAttachmentLabel] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const categoryLabels: Record<string, string> = {
    basin: '一體盆', dm: 'DM資料', hot_bend: '熱彎', identity: '身分確認',
    material: '材質說明', visit: '參訪邀約', dimension: '尺寸規格',
    general: '通用回覆', project_info: '案場資訊', needs: '需求確認',
    store: '商城', follow_up: '回訪跟進',
  };

  const loadReplies = useCallback(async () => {
    try {
      setError(null);
      const res = await quickRepliesApi.getAll();
      setApiReplies(res.data || []);
      if (res.categories && res.categories.length > 0) {
        setCategories(res.categories);
      }
    } catch (err) {
      console.error('Quick replies load failed:', err);
      setError('無法載入語錄資料');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReplies(); }, [loadReplies]);

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormAttachments([]);
    setFormAttachmentUrl('');
    setFormAttachmentLabel('');
  };

  const handleAddAttachment = () => {
    const url = formAttachmentUrl.trim();
    if (!url) return;
    setFormAttachments((items) => [
      ...items,
      { type: 'image', url, label: formAttachmentLabel.trim() || undefined },
    ]);
    setFormAttachmentUrl('');
    setFormAttachmentLabel('');
  };

  const handleRemoveAttachment = (index: number) => {
    setFormAttachments((items) => items.filter((_, i) => i !== index));
  };

  const handleAdd = async () => {
    if (!formTitle.trim() || !formContent.trim() || !formCategory.trim()) return;
    setSaving(true);
    try {
      await quickRepliesApi.create({
        category: formCategory.trim(),
        title: formTitle.trim(),
        content: formContent.trim(),
        attachments: formAttachments,
      });
      resetForm(); setShowAddForm(false);
      await loadReplies();
    } catch (err) {
      console.error('Create failed:', err);
      setError('新增失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      await quickRepliesApi.delete(id);
      await loadReplies();
    } catch (err) {
      console.error('Delete failed:', err);
      setError('刪除失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (reply: QuickReplyItem) => {
    setEditingId(reply.id);
    setFormCategory(reply.category);
    setFormTitle(reply.title);
    setFormContent(reply.content);
    setFormAttachments(reply.attachments || []);
    setFormAttachmentUrl('');
    setFormAttachmentLabel('');
    setShowAddForm(false);
  };

  const handleSaveEdit = async () => {
    if (!formTitle.trim() || !formContent.trim() || !editingId) return;
    setSaving(true);
    try {
      await quickRepliesApi.update(editingId, {
        category: formCategory.trim(),
        title: formTitle.trim(),
        content: formContent.trim(),
        attachments: formAttachments,
      });
      setEditingId(null); resetForm();
      await loadReplies();
    } catch (err) {
      console.error('Update failed:', err);
      setError('更新失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => { setEditingId(null); setShowAddForm(false); resetForm(); };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        <span className="ml-2 text-sm text-zinc-400">載入中...</span>
      </div>
    );
  }

  if (error && apiReplies.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
        <button onClick={() => { setLoading(true); loadReplies(); }} className="mt-2 text-xs text-indigo-500 hover:text-indigo-600">重新載入</button>
      </div>
    );
  }

  const displayCategories = categories.length > 0 ? categories : ['general'];

  const filteredCategories = filterCategory === 'all'
    ? displayCategories
    : displayCategories.filter((c) => c === filterCategory);

  const filteredCount = filterCategory === 'all'
    ? apiReplies.length
    : apiReplies.filter((r) => r.category === filterCategory).length;

  return (
    <div className="space-y-4">
      {/* Header: 篩選 + 新增 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Label htmlFor="qr-filter" className="sr-only">篩選分類</Label>
          <select
            id="qr-filter"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">全部分類（{apiReplies.length}）</option>
            {displayCategories.map((c) => {
              const count = apiReplies.filter((r) => r.category === c).length;
              return <option key={c} value={c}>{categoryLabels[c] || c}（{count}）</option>;
            })}
          </select>
          <span className="text-xs text-zinc-400">{filteredCount} 條語錄</span>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setEditingId(null); resetForm(); setFormCategory(filterCategory !== 'all' ? filterCategory : displayCategories[0] || 'general'); }}
          className="flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> 新增語錄
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* 新增/編輯表單 */}
      {(showAddForm || editingId) && (
        <div className="p-3 md:p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div>
              <Label htmlFor="qr-category" className="sr-only">分類</Label>
              <input
                id="qr-category"
                list="qr-category-options"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="自訂分類"
                className="w-full sm:w-36 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <datalist id="qr-category-options">
                {displayCategories.map((c) => <option key={c} value={c}>{categoryLabels[c] || c}</option>)}
              </datalist>
            </div>
            <div className="flex-1">
              <Label htmlFor="qr-title" className="sr-only">標題</Label>
              <input id="qr-title" type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="標題..."
                className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
          </div>
          <div>
            <Label htmlFor="qr-content" className="sr-only">內容</Label>
            <textarea id="qr-content" value={formContent} onChange={(e) => setFormContent(e.target.value)} placeholder="內容..." rows={2}
              className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900/60">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              <ImageIcon className="h-3.5 w-3.5" />
              圖片附件
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
              <input
                type="url"
                value={formAttachmentUrl}
                onChange={(e) => setFormAttachmentUrl(e.target.value)}
                placeholder="圖片 URL"
                className="text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <input
                type="text"
                value={formAttachmentLabel}
                onChange={(e) => setFormAttachmentLabel(e.target.value)}
                placeholder="圖片名稱"
                className="text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                onClick={handleAddAttachment}
                disabled={!formAttachmentUrl.trim()}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                <Plus className="h-3.5 w-3.5" />
                加入
              </button>
            </div>
            {formAttachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {formAttachments.map((att, index) => (
                  <div key={`${att.url}-${index}`} className="group relative flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 pr-7 dark:border-zinc-700 dark:bg-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={att.url} alt={att.label || '快捷回覆圖片'} className="h-10 w-10 rounded object-cover" />
                    <span className="max-w-32 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{att.label || att.url}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(index)}
                      aria-label="移除圖片附件"
                      className="absolute right-1 top-1 rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-red-500 dark:hover:bg-zinc-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={handleCancelEdit} className="text-xs font-medium text-zinc-500 px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700">取消</button>
            <button onClick={editingId ? handleSaveEdit : handleAdd} disabled={!formTitle.trim() || !formContent.trim() || saving}
              className="flex items-center gap-1 text-xs font-medium bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} {editingId ? '儲存' : '新增'}
            </button>
          </div>
        </div>
      )}

      {/* 語錄列表 — 限高 + 捲動 */}
      <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
        {filteredCategories.map((cat) => {
          const items = apiReplies.filter((r) => r.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5 sticky top-0 bg-white dark:bg-zinc-900 py-1 z-10">
                {categoryLabels[cat] || cat}
                <span className="ml-1.5 text-zinc-300 dark:text-zinc-600">({items.length})</span>
              </p>
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-2 md:gap-3 p-2 md:p-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
	                  <div className="flex-1 min-w-0">
	                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200 truncate">{item.title}</p>
	                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">{item.content}</p>
	                    {item.attachments && item.attachments.length > 0 && (
	                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-indigo-500">
	                        <ImageIcon className="h-3 w-3" />
	                        {item.attachments.filter((att) => att.type === 'image').length} 張圖片
	                      </div>
	                    )}
	                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => handleEdit(item)} className="p-1.5 text-zinc-400 hover:text-indigo-500"><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => handleDelete(item.id)} disabled={saving} className="p-1.5 text-zinc-400 hover:text-red-500 disabled:opacity-50"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {filteredCount === 0 && (
          <p className="text-xs text-zinc-400 text-center py-6">此分類沒有語錄</p>
        )}
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

  const changePeriod = useCallback((p: LlmPeriod) => {
    setLoading(true);
    setError(null);
    setPeriod(p);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      llmApi.getUsageSummary(period).catch(() => null),
      llmApi.getBudget().catch(() => null),
    ]).then(([s, b]) => {
      if (cancelled) return;
      setSummary(s);
      setBudget(b);
      if (!s && !b) setError('無法載入 LLM 用量資料');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
            onClick={() => changePeriod(p)}
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

// ── Tab content mapping ──────────────────────────────────

const tabContentMap: Record<TabId, React.ComponentType> = {
  integration: IntegrationCard,
  ai: AIModelCard,
  'quick-replies': QuickRepliesManagementCard,
  notifications: NotificationsCard,
  status: CustomerStatusCard,
  urgency: UrgencyRulesCard,
  'llm-cost': LlmCostCard,
  'roles': RolesTab,
};

// ── Main Settings Page ─────────────────────────────────

export default function SettingsPage() {
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
        <Tabs defaultValue="integration" orientation="vertical" className="flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Tab Navigation — 手機水平滾動，桌面垂直列表 */}
          <TabsList variant="line" className="flex md:flex-col md:w-48 flex-shrink-0 items-stretch h-auto bg-transparent p-0 overflow-x-auto md:overflow-x-visible gap-1 md:gap-0">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap md:w-full md:justify-start',
                  'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800',
                  'data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-600 dark:data-[state=active]:bg-indigo-500/10 dark:data-[state=active]:text-indigo-400',
                  'after:hidden'
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden md:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Tab Content */}
          {tabs.map((tab) => {
            const Content = tabContentMap[tab.id];
            return (
              <TabsContent key={tab.id} value={tab.id} className="flex-1 min-w-0 mt-0">
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 md:p-6">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                    {tab.label}
                  </h2>
                  <Content />
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}
