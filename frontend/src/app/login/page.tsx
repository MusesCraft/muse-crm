'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Zap, Loader2, Shield, Lock, CheckCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/inbox');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || isAuthenticated) {
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      router.replace('/inbox');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 via-indigo-50/30 to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-5">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
              <Zap className="w-8 h-8 text-indigo-500" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 border-2 border-white dark:border-zinc-950" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">MUSE CRM</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">繆思精工 — 智能客服管理系統</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white shadow-xl shadow-zinc-200/50 dark:bg-zinc-900 dark:shadow-none dark:border dark:border-zinc-800 rounded-2xl p-7 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-500 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
              placeholder="輸入 Email"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                密碼
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300"
              >
                {showPassword ? '隱藏' : '顯示'}
              </button>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50 px-4 py-3 pr-10 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                placeholder="••••••••"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                登入中...
              </>
            ) : (
              '登入'
            )}
          </button>

          {/* Security info */}
          <div className="pt-2">
            <div className="flex items-center justify-center gap-1 mb-3">
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 px-2">安全登入</span>
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
            </div>
            <div className="flex items-center justify-center gap-4 text-xs text-zinc-400 dark:text-zinc-500">
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" />SSL 加密</span>
              <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-indigo-400" />端對端加密</span>
            </div>
          </div>
        </form>

        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-6">© 2026 繆思精工有限公司</p>
      </div>
    </div>
  );
}
