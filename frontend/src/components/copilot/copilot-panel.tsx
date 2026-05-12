'use client';

import { useState, useCallback, useMemo } from 'react';
import { aiCopilotApi, type Analysis } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { openSse } from '@/lib/sse';
import { inboxApi, type Conversation } from '@/lib/api';
import { IntentCard } from './intent-card';
import { SummaryCard } from './summary-card';
import { ReplySuggestion } from './reply-suggestion';
import { KbCard } from './kb-card';
import { RiskAlert } from './risk-alert';
import { Loader2 } from 'lucide-react';

interface Props {
  conversationId: string | number;
}

interface SuggestionItem {
  text: string;
  confidence?: number;
  kb_refs?: string[];
}

interface KbItem {
  id: string;
  title: string;
  content: string;
  category?: string | null;
}

/** 把 analyses 結果歸納成 IntentCard 需要的格式 */
function extractIntentFields(analyses: Analysis[] | undefined): {
  intent?: string;
  identity?: string;
  sentiment?: string;
  urgency?: string;
  risks: string[];
} {
  const empty = { intent: undefined, identity: undefined, sentiment: undefined, urgency: undefined, risks: [] as string[] };
  if (!analyses || analyses.length === 0) return empty;
  const latest = analyses[0]?.result || {};
  const risks = Array.isArray(latest.risk_flags) ? (latest.risk_flags as string[]) : [];
  return {
    intent: (latest.intent as string) || undefined,
    identity: (latest.customer_identity as string) || (latest.customer_stage as string) || undefined,
    sentiment: (latest.sentiment as string) || undefined,
    urgency: (latest.urgency as string) || undefined,
    risks,
  };
}

export function CopilotPanel({ conversationId }: Props) {
  // 對話摘要
  const { data: summaryData } = useAsync(
    () => aiCopilotApi.getSummary(conversationId),
    [conversationId],
  );

  // 對話內容（要用其中的 analyses / 最後客戶訊息）
  const { data: conv } = useAsync<Conversation>(
    () => inboxApi.getConversation(conversationId),
    [conversationId],
  );

  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [streamMode, setStreamMode] = useState(true);

  // 注意：切換對話時用父層 key={conversationId} 重新掛載本元件，
  // 即可自然重置上述 state，無須在 effect 內 setState。

  // 最近一則客戶訊息（給 KB 檢索用）
  const lastCustomerContent = useMemo(() => {
    const lastCustomer = (conv?.messages || [])
      .filter((m) => m.sender_type === 'customer' && !m.is_internal)
      .slice(-1)[0];
    return lastCustomer?.content || '';
  }, [conv?.messages]);

  // 根據最近一則客戶訊息抓 KB
  const { data: kbResult, loading: kbLoading } = useAsync(
    async () => {
      if (!lastCustomerContent) return { data: [] as KbItem[] };
      return await aiCopilotApi.searchKnowledge(lastCustomerContent, undefined, 3);
    },
    [lastCustomerContent],
  );
  const kbItems: KbItem[] = kbResult?.data || [];

  const intentFields = extractIntentFields(conv?.analyses);

  const handleGenerate = useCallback(() => {
    if (generating) return;
    setGenerating(true);
    setSuggestions([]);
    setRecordId(null);

    if (streamMode) {
      const close = openSse(`/ai/suggestions?conversation_id=${conversationId}&stream=1`, {
        onSuggestion: (idx, sug) => {
          setSuggestions((prev) => {
            const next = [...prev];
            next[idx] = sug;
            return next;
          });
        },
        onDone: (rid) => {
          if (rid) setRecordId(rid);
          setGenerating(false);
        },
        onError: () => {
          setGenerating(false);
        },
      });
      return close;
    }

    // 非串流 fallback
    aiCopilotApi
      .getSuggestions(conversationId)
      .then((res) => {
        setSuggestions(res.data?.suggestions || []);
        setRecordId(res.data?.id || null);
      })
      .finally(() => setGenerating(false));
  }, [conversationId, generating, streamMode]);

  const handleUseSuggestion = useCallback(
    (idx: number) => {
      if (!recordId) return;
      // 標記為已採用、未編輯
      aiCopilotApi.markSuggestionUsed(recordId, idx, false).catch(() => {});
    },
    [recordId],
  );

  return (
    <div className="p-3 space-y-3">
      {intentFields.risks.length > 0 && <RiskAlert risks={intentFields.risks} />}

      <IntentCard
        intent={intentFields.intent}
        identity={intentFields.identity}
        sentiment={intentFields.sentiment}
        urgency={intentFields.urgency}
      />

      <SummaryCard summary={summaryData?.summary || ''} />

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] uppercase tracking-wider text-zinc-400">回覆草稿</h4>
          <label className="flex items-center gap-1 text-[10px] text-zinc-400 select-none">
            <input
              type="checkbox"
              checked={streamMode}
              onChange={(e) => setStreamMode(e.target.checked)}
              className="w-3 h-3"
            />
            串流
          </label>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50"
        >
          {generating && <Loader2 className="w-3 h-3 animate-spin" />}
          {generating ? '生成中…' : '產生回覆草稿'}
        </button>
        <div className="mt-3 space-y-2">
          {suggestions.map((s, i) => (
            <ReplySuggestion
              key={i}
              text={s.text}
              confidence={s.confidence}
              onUse={() => handleUseSuggestion(i)}
            />
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
        <h4 className="text-[10px] uppercase tracking-wider text-zinc-400 mb-2">知識庫推薦</h4>
        {kbLoading ? (
          <p className="text-[11px] text-zinc-400 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            檢索中…
          </p>
        ) : kbItems.length === 0 ? (
          <p className="text-[11px] text-zinc-400">尚無相關內容</p>
        ) : (
          <div className="space-y-2">
            {kbItems.map((kb) => (
              <KbCard
                key={kb.id}
                title={kb.title}
                excerpt={kb.content.slice(0, 100)}
                category={kb.category}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
