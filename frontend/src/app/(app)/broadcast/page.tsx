'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { broadcastApi, tagsApi, uploadApi, type Broadcast, type Tag } from '@/lib/api';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'bg-zinc-500/20 text-zinc-400' },
  scheduled: { label: '已排程', color: 'bg-blue-500/20 text-blue-400' },
  sending: { label: '發送中', color: 'bg-yellow-500/20 text-yellow-400' },
  completed: { label: '已完成', color: 'bg-green-500/20 text-green-400' },
  failed: { label: '失敗', color: 'bg-red-500/20 text-red-400' },
};

const CHANNELS = [
  { value: 'messenger', label: 'Messenger' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'line', label: 'LINE' },
];

export default function BroadcastPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [includeTags, setIncludeTags] = useState<string[]>([]);
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [targetChannels, setTargetChannels] = useState<string[]>(['messenger', 'instagram', 'line']);
  const [activeWithinDays, setActiveWithinDays] = useState<string>('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [bRes, tRes] = await Promise.all([
        broadcastApi.list(),
        tagsApi.getTags(),
      ]);
      setBroadcasts(bRes.data || []);
      setTags(tRes || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (!title.trim() || !content.trim() || includeTags.length === 0) return;
    setSubmitting(true);
    try {
      // Upload image first if selected
      let imageUrl: string | undefined;
      if (imageFile) {
        const uploadRes = await uploadApi.uploadImage(imageFile);
        imageUrl = uploadRes.url;
      }

      await broadcastApi.create({
        title: title.trim(),
        content: content.trim(),
        image_url: imageUrl,
        include_tags: includeTags,
        exclude_tags: excludeTags.length > 0 ? excludeTags : undefined,
        target_channels: targetChannels,
        active_within_days: activeWithinDays ? parseInt(activeWithinDays) : undefined,
        scheduled_at: scheduledAt || undefined,
      });
      setShowCreate(false);
      resetForm();
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '建立失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async (id: string) => {
    if (!confirm('確定要發送此廣播？發送後無法撤回。')) return;
    try {
      await broadcastApi.send(id);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '發送失敗');
    }
  };

  const handlePreview = async (id: string) => {
    try {
      const res = await broadcastApi.preview(id);
      alert(`符合條件的受眾：${res.recipient_count} 人`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '預覽失敗');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此廣播？')) return;
    try {
      await broadcastApi.remove(id);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除失敗');
    }
  };

  const toggleTag = (tag: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag]);
  };

  const resetForm = () => {
    setTitle(''); setContent(''); setImageFile(null); setImagePreview(null);
    setIncludeTags([]); setExcludeTags([]);
    setTargetChannels(['messenger', 'instagram', 'line']);
    setActiveWithinDays(''); setScheduledAt('');
  };

  if (loading) return <div className="p-8 text-zinc-400">載入中...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-100 tracking-wider">📢 廣播管理</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-brand-gold text-black text-sm font-medium rounded hover:bg-brand-gold-light transition-colors"
        >
          建立廣播
        </button>
      </div>

      {/* 廣播列表 */}
      <div className="space-y-3">
        {broadcasts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm mb-2">尚無廣播</p>
            <p className="text-zinc-600 text-xs">點擊「建立廣播」開始發送批量訊息給客戶</p>
          </div>
        ) : broadcasts.map((b) => {
          const st = STATUS_LABELS[b.status] || STATUS_LABELS.draft;
          return (
            <div key={b.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-zinc-100 font-medium">{b.title}</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] tracking-wider ${st.color}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="text-zinc-400 text-sm line-clamp-2">{b.content}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-zinc-500">
                    <span>📌 標籤：{b.include_tags.join(', ')}</span>
                    {b.exclude_tags?.length > 0 && <span>🚫 排除：{b.exclude_tags.join(', ')}</span>}
                    <span>📡 渠道：{b.target_channels.join(', ')}</span>
                    {b.active_within_days && <span>📅 {b.active_within_days}天內互動</span>}
                    {b.scheduled_at && <span>⏰ 排程：{new Date(b.scheduled_at).toLocaleString('zh-TW')}</span>}
                  </div>
                  {b.status === 'completed' && (
                    <div className="mt-1 text-[11px] text-zinc-500">
                      ✅ 已送達 {b.sent_count}/{b.total_recipients} 人
                      {b.failed_count > 0 && <span className="text-red-400 ml-2">❌ {b.failed_count} 失敗</span>}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  {b.status === 'draft' && (
                    <>
                      <button onClick={() => handlePreview(b.id)} className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 border border-zinc-700 rounded">預覽受眾</button>
                      <button onClick={() => handleSend(b.id)} className="text-xs text-black bg-brand-gold hover:bg-brand-gold-light px-2 py-1 rounded">立即發送</button>
                      <button onClick={() => handleDelete(b.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 border border-red-800 rounded">刪除</button>
                    </>
                  )}
                  {b.status === 'failed' && (
                    <button onClick={() => handleSend(b.id)} className="text-xs text-brand-gold hover:text-brand-gold-light px-2 py-1 border border-brand-gold rounded">重試</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 建立廣播 Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowCreate(false); resetForm(); }}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-100 mb-4">建立廣播</h2>

            <div className="space-y-4">
              {/* 標題 */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">標題 *</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:border-brand-gold focus:outline-none"
                  placeholder="例：三月新品上市通知" />
              </div>

              {/* 訊息內容 */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">訊息內容 *</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 resize-none focus:border-brand-gold focus:outline-none"
                  placeholder="輸入廣播訊息..." />
              </div>

              {/* 圖片上傳 */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">附帶圖片（選填）</label>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="預覽" className="w-full max-h-48 object-cover rounded border border-zinc-700" />
                    <button onClick={() => { setImageFile(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="absolute top-2 right-2 bg-black/60 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs hover:bg-black/80">✕</button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-zinc-700 rounded-lg py-6 text-zinc-500 text-sm hover:border-zinc-500 transition-colors">
                    📷 點擊上傳圖片
                  </button>
                )}
              </div>

              {/* 包含標籤 */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">包含標籤 *（至少選一個，符合任一即選中）</label>
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(t => (
                      <button key={`inc-${t.id}`}
                        onClick={() => toggleTag(t.name, includeTags, setIncludeTags)}
                        className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                          includeTags.includes(t.name)
                            ? 'bg-brand-gold/20 border-brand-gold text-brand-gold'
                            : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                        }`}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-600 text-xs py-2">⚠️ 尚無標籤，請先在客戶管理中建立標籤</p>
                )}
                {includeTags.length > 0 && (
                  <p className="text-xs text-brand-gold mt-1">已選：{includeTags.join('、')}</p>
                )}
              </div>

              {/* 排除標籤 */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">排除標籤（選填，符合任一即排除）</label>
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(t => (
                      <button key={`exc-${t.id}`}
                        onClick={() => toggleTag(t.name, excludeTags, setExcludeTags)}
                        className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                          excludeTags.includes(t.name)
                            ? 'bg-red-500/20 border-red-500 text-red-400'
                            : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                        }`}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-600 text-xs py-2">⚠️ 尚無標籤</p>
                )}
                {excludeTags.length > 0 && (
                  <p className="text-xs text-red-400 mt-1">排除：{excludeTags.join('、')}</p>
                )}
              </div>

              {/* 目標渠道 */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">目標渠道</label>
                <div className="flex gap-2">
                  {CHANNELS.map(ch => (
                    <button key={ch.value}
                      onClick={() => toggleTag(ch.value, targetChannels, setTargetChannels)}
                      className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                        targetChannels.includes(ch.value)
                          ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                          : 'border-zinc-700 text-zinc-400'
                      }`}>
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 活躍度篩選 */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">互動時間篩選（選填）</label>
                <select value={activeWithinDays} onChange={e => setActiveWithinDays(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:border-brand-gold focus:outline-none">
                  <option value="">不限（所有客戶）</option>
                  <option value="7">7 天內有互動</option>
                  <option value="30">30 天內有互動</option>
                  <option value="60">60 天內有互動</option>
                  <option value="90">90 天內有互動</option>
                  <option value="180">180 天內有互動</option>
                  <option value="365">1 年內有互動</option>
                </select>
                {activeWithinDays && (
                  <p className="text-xs text-blue-400 mt-1">📅 只發送 {activeWithinDays} 天內有互動的客戶</p>
                )}
              </div>

              {/* 排程時間 */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">排程發送（選填，留空則手動發送）</label>
                <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:border-brand-gold focus:outline-none" />
                {scheduledAt && (
                  <p className="text-xs text-blue-400 mt-1">⏰ 將於 {new Date(scheduledAt).toLocaleString('zh-TW')} 自動發送</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setShowCreate(false); resetForm(); }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded">
                取消
              </button>
              <button onClick={handleCreate} disabled={submitting || !title.trim() || !content.trim() || includeTags.length === 0}
                className="px-4 py-2 bg-brand-gold text-black text-sm font-medium rounded hover:bg-brand-gold-light disabled:opacity-50 transition-colors">
                {submitting ? '建立中...' : scheduledAt ? '建立排程廣播' : '建立廣播'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
