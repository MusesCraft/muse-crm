'use client';

import { useState } from 'react';
import { conversationOpsApi } from '@/lib/api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserCheck, Loader2 } from 'lucide-react';

interface AgentOption {
  id: string;
  name: string;
}

interface Props {
  conversationId: string | number;
  agents: AgentOption[];
  currentHandlerId?: string | null;
  onAssigned?: () => void;
}

/**
 * 分配 / 重新指派下拉選單（PRD §F3.2）。
 * 主管在「待認領」、「團隊視圖」可手動指派 / 重新指派。
 */
export function AssignMenu({ conversationId, agents, currentHandlerId, onAssigned }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleAssign = async (userId: string) => {
    setBusy(true);
    try {
      await conversationOpsApi.assign(conversationId, userId);
      setOpen(false);
      onAssigned?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20">
          <UserCheck className="w-3.5 h-3.5" />
          分配
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1">
        <div className="text-[10px] uppercase tracking-wider text-zinc-400 px-2 pt-1 pb-0.5">指派給</div>
        {agents.length === 0 ? (
          <div className="px-2 py-2 text-xs text-zinc-400">沒有可指派的客服</div>
        ) : (
          agents.map((a) => (
            <button
              key={a.id}
              onClick={() => handleAssign(a.id)}
              disabled={busy}
              className={`w-full text-left px-2 py-1.5 text-xs rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                a.id === currentHandlerId ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-200'
              }`}
            >
              {a.name}
              {a.id === currentHandlerId && <span className="ml-1 text-[10px]">（目前）</span>}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
