'use client';

/**
 * Settings — AI 設定 Tab（PR-7，PRD §F4.6）
 *
 * 本版為 stub UI，實際讀寫後端 system_settings 需後續配合 API 完善。
 */

import { useState } from 'react';

export default function AiTab() {
  const [primaryModel, setPrimaryModel] = useState('anthropic/claude-sonnet-4-6');
  const [fallbackModel, setFallbackModel] = useState('google/gemini-flash-lite');
  const [enableDraft, setEnableDraft] = useState(true);
  const [budgetUsd, setBudgetUsd] = useState(200);
  const [tone, setTone] = useState<'formal' | 'friendly' | 'professional'>('professional');

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        管理 AI Copilot 模型、預算與語氣設定。
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">主模型</label>
          <input value={primaryModel} onChange={(e) => setPrimaryModel(e.target.value)} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">兜底模型</label>
          <input value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value)} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <input id="draft" type="checkbox" checked={enableDraft} onChange={(e) => setEnableDraft(e.target.checked)} />
          <label htmlFor="draft" className="text-xs text-zinc-600 dark:text-zinc-300">啟用即時草稿</label>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">月預算上限（USD）</label>
          <input type="number" value={budgetUsd} onChange={(e) => setBudgetUsd(Number(e.target.value))} className="w-32 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">品牌語氣</label>
          <select value={tone} onChange={(e) => setTone(e.target.value as 'formal' | 'friendly' | 'professional')} className="w-40 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm">
            <option value="formal">正式</option>
            <option value="friendly">親切</option>
            <option value="professional">專業</option>
          </select>
        </div>
        <p className="text-[10px] text-zinc-400">TODO：接 system_settings API 後實際儲存。</p>
      </div>
    </div>
  );
}
