'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Inbox, Users, LayoutDashboard, CheckSquare, Zap, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

const navItems = [
  { href: '/inbox', label: '收件匣', icon: Inbox },
  { href: '/contacts', label: '客戶', icon: Users },
  { href: '/dashboard', label: '儀表板', icon: LayoutDashboard },
  { href: '/actions', label: '待辦事項', icon: CheckSquare },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const initials = user?.name
    ? user.name
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-zinc-950 border-r border-zinc-800 flex flex-col z-50">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2 px-5 border-b border-zinc-800">
        <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <span className="text-lg font-bold text-white tracking-tight">MUSE CRM</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer: Current user + Logout */}
      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-300 font-medium">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{user?.name || '使用者'}</p>
            <p className="text-xs text-zinc-500 truncate">{user?.email || ''}</p>
          </div>
          <button
            onClick={handleLogout}
            title="登出"
            className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
