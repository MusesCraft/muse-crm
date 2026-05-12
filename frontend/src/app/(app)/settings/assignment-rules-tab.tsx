'use client';

/**
 * Settings — 自動分配規則 Tab（PR-7，PRD §F3.1）
 *
 * 本版為 stub UI；實際規則設定後續接 system_settings 或新 settings API。
 */

import { useState } from 'react';

export default function AssignmentRulesTab() {
  const [reuseDays, setReuseDays] = useState(30);
  const [useAiRouting, setUseAiRouting] = useState(false);
  const [enableRoundRobin, setEnableRoundRobin] = useState(true);
  const [offlineReclaimMinutes, setOfflineReclaimMinutes] = useState(60);

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        對話自動分配規則：沿用上次負責人 → AI 路由 → 輪詢 → 降級為待認領。
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">
            沿用上次負責人 — 視為近期接觸的天數
          </label>
          <input
            type="number"
            value={reuseDays}
            onChange={(e) => setReuseDays(Number(e.target.value))}
            className="w-24 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <input id="ai-route" type="checkbox" checked={useAiRouting} onChange={(e) => setUseAiRouting(e.target.checked)} />
          <label htmlFor="ai-route" className="text-xs text-zinc-600 dark:text-zinc-300">啟用 AI 路由（依意圖匹配擅長標籤）</label>
        </div>
        <div className="flex items-center gap-2">
          <input id="rr" type="checkbox" checked={enableRoundRobin} onChange={(e) => setEnableRoundRobin(e.target.checked)} />
          <label htmlFor="rr" className="text-xs text-zinc-600 dark:text-zinc-300">啟用輪詢分配</label>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">
            客服離線多少分鐘後將對話收回待認領池
          </label>
          <input
            type="number"
            value={offlineReclaimMinutes}
            onChange={(e) => setOfflineReclaimMinutes(Number(e.target.value))}
            className="w-24 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm"
          />
        </div>
        <p className="text-[10px] text-zinc-400">TODO：接後端 settings API 後實際儲存。</p>
      </div>
    </div>
  );
}
