'use client';

import { AlertCircle } from 'lucide-react';

interface Props {
  risks: string[];
}

const RISK_LABELS: Record<string, string> = {
  churn: '客戶可能流失',
  complaint: '投訴可能升級',
  high_amount: '高金額異動',
  long_no_response: '客戶長時間未回',
};

export function RiskAlert({ risks }: Props) {
  if (!risks || risks.length === 0) return null;
  return (
    <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1 text-xs font-medium text-red-700 dark:text-red-400">
        <AlertCircle className="w-4 h-4" />
        風險預警
      </div>
      <ul className="text-xs text-red-700 dark:text-red-400 space-y-0.5">
        {risks.map((r) => (
          <li key={r}>• {RISK_LABELS[r] || r}</li>
        ))}
      </ul>
    </div>
  );
}
