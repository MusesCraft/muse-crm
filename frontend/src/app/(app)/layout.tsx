'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { useAuth } from '@/lib/auth';
import { LoadingSpinner } from '@/components/loading';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    const interval = setInterval(check, 500);
    return () => {
      window.removeEventListener('storage', check);
      clearInterval(interval);
    };
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

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className={`min-h-screen transition-all duration-200 ${sidebarCollapsed ? 'ml-[68px]' : 'ml-[220px]'}`}>
        {children}
      </main>
    </div>
  );
}
