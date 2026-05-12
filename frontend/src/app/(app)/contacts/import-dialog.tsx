'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type ImportState = 'idle' | 'importing' | 'success' | 'error';

interface ImportResult {
  message: string;
  created: number;
  failed: number;
  errors: string[];
}

export function ImportDialog({ open, onOpenChange, onSuccess }: ImportDialogProps) {
  const [state, setState] = useState<ImportState>('idle');
  const [sheetUrl, setSheetUrl] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      // 關閉時重置狀態
      setState('idle');
      setSheetUrl('');
      setResult(null);
      setErrorMessage('');
    }
    onOpenChange(isOpen);
  };

  const handleImport = async () => {
    if (!sheetUrl.trim()) return;
    setState('importing');
    setErrorMessage('');
    setResult(null);

    try {
      const res = await adminApi.importCsv(sheetUrl.trim());
      setResult(res);
      setState('success');
      onSuccess();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '匯入失敗，請檢查 URL 是否正確');
      setState('error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-500" />
            CSV 匯入客戶
          </DialogTitle>
          <DialogDescription>
            輸入 Google Sheets CSV 網址，系統將自動匯入客戶資料
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* URL 輸入 */}
          {(state === 'idle' || state === 'error') && (
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Google Sheets CSV URL
              </label>
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* 匯入中 */}
          {state === 'importing' && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">正在匯入資料...</p>
            </div>
          )}

          {/* 成功結果 */}
          {state === 'success' && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-medium">{result.message}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{result.created}</p>
                  <p className="text-xs text-emerald-500 dark:text-emerald-500">成功建立</p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-zinc-600 dark:text-zinc-300">{result.failed}</p>
                  <p className="text-xs text-zinc-500">失敗筆數</p>
                </div>
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    錯誤詳情
                  </p>
                  <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <li key={i} className="text-xs text-red-500 dark:text-red-400">{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 錯誤訊息 */}
          {state === 'error' && errorMessage && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {state === 'success' ? (
            <button
              onClick={() => handleClose(false)}
              className="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-colors"
            >
              完成
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={state === 'importing' || !sheetUrl.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
              >
                {state === 'importing' && <Loader2 className="w-4 h-4 animate-spin" />}
                匯入
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
