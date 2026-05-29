'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { useAuth } from '@/lib/auth';
import { LoadingSpinner } from '@/components/loading';
import { Menu, ShieldAlert } from 'lucide-react';
import { canAccessRoute } from '@/lib/rbac';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Listen to sidebar collapse state
  useEffect(() => {
    const check = () => {
      if (typeof window !== 'undefined') {
        setSidebarCollapsed(localStorage.getItem('muse_sidebar_collapsed') === 'true');
      }
    };
    check();
    window.addEventListener('storage', check);
    window.addEventListener('sidebar-toggle', check);
    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener('sidebar-toggle', check);
    };
  }, []);

  // 當路由變化時（透過 sidebar 導航），關閉手機版 sidebar
  const handleMobileSidebarClose = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const canAccessCurrentRoute = canAccessRoute(user?.role, pathname);

  return (
    <div className="min-h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg">
        跳到主要內容
      </a>

      {/* 手機版漢堡按鈕 */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shadow-sm min-h-[44px] min-w-[44px] flex items-center justify-center"
        title="開啟選單"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* 手機版 backdrop */}
      {mobileSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={handleMobileSidebarClose}
        />
      )}

      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={handleMobileSidebarClose}
      />
      <main
        id="main-content"
        className={`min-h-screen transition-all duration-200 ${sidebarCollapsed ? 'md:ml-[68px]' : 'md:ml-[220px]'}`}
      >
        {canAccessCurrentRoute ? children : <ForbiddenPage />}
      </main>
    </div>
  );
}

function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 flex items-center justify-center">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-red-600 dark:text-red-400">403</p>
        <h1 className="mt-2 text-xl font-bold text-zinc-900 dark:text-white">沒有權限存取此頁面</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          這個功能需要更高的角色權限，請改用側欄中可用的功能。
        </p>
      </div>
    </div>
  );
}
