'use client';

import { useState, useEffect, useCallback } from 'react';
import { broadcastApi, tagsApi, type Broadcast, type Tag } from '@/lib/api';

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
  const [imageUrl, setImageUrl] = useState('');
  const [includeTags, setIncludeTags] = useState<string[]>([]);
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [targetChannels, setTargetChannels] = useState<string[]>(['messenger', 'instagram', 'line']);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const handleCreate = async () => {
    if (!title.trim() || !content.trim() || includeTags.length === 0) return;
    setSubmitting(true);
    try {
      await broadcastApi.create({
        title: title.trim(),
        content: content.trim(),
        image_url: imageUrl.trim() || undefined,
        include_tags: includeTags,
        exclude_tags: excludeTags.length > 0 ? excludeTags : undefined,
        target_channels: targetChannels,
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
    setTitle(''); setContent(''); setImageUrl('');
    setIncludeTags([]); setExcludeTags([]);
    setTargetChannels(['messenger', 'instagram', 'line']);
    setPreviewCount(null);
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
          <p className="text-zinc-500 text-sm">尚無廣播</p>
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
                  <div className="flex gap-3 mt-2 text-[11px] text-zinc-500">
                    <span>標籤：{b.include_tags.join(', ')}</span>
                    {b.exclude_tags?.length > 0 && <span>排除：{b.exclude_tags.join(', ')}</span>}
                    <span>渠道：{b.target_channels.join(', ')}</span>
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
                      <button onClick={() => handlePreview(b.id)} className="text-xs text-zinc-400 hover:text-zinc-200">預覽</button>
                      <button onClick={() => handleSend(b.id)} className="text-xs text-brand-gold hover:text-brand-gold-light">發送</button>
                      <button onClick={() => handleDelete(b.id)} className="text-xs text-red-400 hover:text-red-300">刪除</button>
                    </>
                  )}
                  {b.status === 'failed' && (
                    <button onClick={() => handleSend(b.id)} className="text-xs text-brand-gold hover:text-brand-gold-light">重試</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 建立廣播 Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-zinc-100 mb-4">建立廣播</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">標題 *</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
                  placeholder="例：三月新品上市通知" />
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">訊息內容 *</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 resize-none"
                  placeholder="輸入廣播訊息..." />
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">圖片 URL（選填）</label>
                <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
                  placeholder="https://..." />
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">包含標籤 *（至少選一個）</label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(t => (
                    <button key={`inc-${t.id}`}
                      onClick={() => toggleTag(t.name, includeTags, setIncludeTags)}
                      className={`px-2 py-1 rounded text-xs border transition-colors ${
                        includeTags.includes(t.name)
                          ? 'bg-brand-gold/20 border-brand-gold text-brand-gold'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">排除標籤（選填）</label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(t => (
                    <button key={`exc-${t.id}`}
                      onClick={() => toggleTag(t.name, excludeTags, setExcludeTags)}
                      className={`px-2 py-1 rounded text-xs border transition-colors ${
                        excludeTags.includes(t.name)
                          ? 'bg-red-500/20 border-red-500 text-red-400'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

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
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setShowCreate(false); resetForm(); }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
                取消
              </button>
              <button onClick={handleCreate} disabled={submitting || !title.trim() || !content.trim() || includeTags.length === 0}
                className="px-4 py-2 bg-brand-gold text-black text-sm font-medium rounded hover:bg-brand-gold-light disabled:opacity-50 transition-colors">
                {submitting ? '建立中...' : '建立廣播'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
