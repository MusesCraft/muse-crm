'use client';

import { useState } from 'react';
import { conversationOpsApi } from '@/lib/api';
import { Shield, Undo2, Loader2 } from 'lucide-react';

interface Props {
  conversationId: string | number;
  supervisorName?: string | null;
  isSupervisor: boolean; // 當前使用者是否為接管中的主管
  onReturned?: () => void;
}

/**
 * 主管接管橫幅（PRD §F3.3）。
 * 顯示在對話頂端，告知此對話正由主管處理；主管本人可看到「歸還」按鈕。
 */
export function TakeOverBanner({ conversationId, supervisorName, isSupervisor, onReturned }: Props) {
  const [returning, setReturning] = useState(false);

  const handleReturn = async () => {
    if (returning) return;
    setReturning(true);
    try {
      await conversationOpsApi.returnToAgent(conversationId);
      onReturned?.();
    } finally {
      setReturning(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20">
      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
        <Shield className="w-4 h-4" />
        <span>主管處理中{supervisorName ? `（${supervisorName}）` : ''}</span>
      </div>
      {isSupervisor && (
        <button
          onClick={handleReturn}
          disabled={returning}
          className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200"
        >
          {returning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
          歸還對話
        </button>
      )}
    </div>
  );
}
