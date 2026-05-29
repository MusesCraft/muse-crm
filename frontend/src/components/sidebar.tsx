'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Inbox, Users, LayoutDashboard, CheckSquare, Settings, Zap, LogOut, Sun, Moon, ChevronLeft, ChevronRight, X, Package, FileText, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useState, useEffect } from 'react';
import { dashboardApi } from '@/lib/api';
import { canAccessRoute } from '@/lib/rbac';

const navItems = [
  { href: '/inbox', label: '收件匣', icon: Inbox, badgeKey: 'active_conversations' as const },
  { href: '/contacts', label: '客戶', icon: Users },
  { href: '/quotes', label: '報價', icon: FileText },
  { href: '/dashboard', label: '儀表板', icon: LayoutDashboard },
  { href: '/actions', label: '待辦事項', icon: CheckSquare, badgeKey: 'pending_actions' as const },
  { href: '/inventory', label: '庫存', icon: Package },
  { href: '/knowledge-base', label: '知識庫', icon: BookOpen },
  { href: '/settings', label: '設定', icon: Settings },
];

interface SidebarProps {
  /** 手機版是否展開 */
  mobileOpen?: boolean;
  /** 手機版關閉 callback */
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('muse_sidebar_collapsed') === 'true';
    }
    return false;
  });
  const [badges, setBadges] = useState<Record<string, number>>({});
  const canViewDashboard = canAccessRoute(user?.role, '/dashboard');

  // Fetch badge counts from API
  useEffect(() => {
    if (!canViewDashboard) return;

    dashboardApi.getStats()
      .then((stats) => {
        setBadges({
          active_conversations: stats.active_conversations || 0,
          pending_actions: stats.pending_actions || 0,
        });
      })
      .catch(() => {});
  }, [canViewDashboard]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('muse_sidebar_collapsed', String(next));
    window.dispatchEvent(new Event('sidebar-toggle'));
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const handleNavClick = () => {
    // 手機版點擊導航後自動關閉 sidebar
    if (onMobileClose) {
      onMobileClose();
    }
  };

  const initials = user?.name
    ? user.name
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  const sidebarWidth = collapsed ? 'w-[68px]' : 'w-[220px]';
  const visibleNavItems = navItems.filter((item) => canAccessRoute(user?.role, item.href));

  return (
    <aside className={cn(
      'fixed left-0 top-0 bottom-0 bg-white border-r border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 flex flex-col z-50 transition-all duration-200',
      sidebarWidth,
      // 手機版：預設隱藏，mobileOpen 時顯示（always expanded 在手機上）
      mobileOpen ? 'translate-x-0' : '-translate-x-full',
      'md:translate-x-0'
    )}>
      {/* Logo */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">MUSE</span>
        )}
        {/* 手機版：關閉按鈕；桌面版：折疊按鈕 */}
        <button
          onClick={onMobileClose}
          className="md:hidden ml-auto p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="關閉選單"
        >
          <X className="w-5 h-5" />
        </button>
        <button
          onClick={toggleCollapsed}
          className={cn(
            'hidden md:flex p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors',
            collapsed ? 'ml-auto' : 'ml-auto'
          )}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      {!collapsed && (
        <p className="px-4 pt-4 pb-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">主選單</p>
      )}
      <nav className={cn('flex-1 py-2 space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
        {visibleNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onClick={handleNavClick}
              className={cn(
                'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
                collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5',
                isActive
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                  : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/50'
              )}
            >
              <item.icon className={cn('w-[18px] h-[18px] flex-shrink-0', isActive && 'text-indigo-500 dark:text-indigo-400')} />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {canViewDashboard && item.badgeKey && badges[item.badgeKey] > 0 && (
                    <span className={cn(
                      'text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5',
                      isActive
                        ? 'bg-indigo-500 text-white'
                        : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
                    )}>
                      {badges[item.badgeKey]}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
        {/* Theme + Logout buttons */}
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? '切換至淺色模式' : '切換至深色模式'}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleLogout}
              title="登出"
              className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-red-400 dark:hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{user?.name || '使用者'}</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{user?.email || ''}</p>
            </div>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? '切換至淺色模式' : '切換至深色模式'}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleLogout}
              title="登出"
              className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-red-400 dark:hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
