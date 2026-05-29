'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api/v1';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  is_active: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('muse_token');
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(true);

  // 用 refresh token 換發新 access token
  const tryRefreshToken = useCallback(async (): Promise<boolean> => {
    const refreshToken = localStorage.getItem('muse_refresh_token');
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      localStorage.setItem('muse_token', data.token);
      setToken(data.token);

      const u = await fetchMe(data.token);
      setUser(u);
      return true;
    } catch {
      return false;
    }
  }, []);

  // 初始化：驗證已儲存的 token
  useEffect(() => {
    const savedToken = localStorage.getItem('muse_token');
    if (savedToken) {
      fetchMe(savedToken)
        .then((u) => setUser(u))
        .catch(async () => {
          // Token invalid/expired — try refresh
          const refreshed = await tryRefreshToken();
          if (!refreshed) {
            localStorage.removeItem('muse_token');
            localStorage.removeItem('muse_refresh_token');
            setToken(null);
          }
        })
        .finally(() => setIsLoading(false));
    } else {
      Promise.resolve().then(() => setIsLoading(false));
    }
  }, [tryRefreshToken]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '登入失敗');
    }

    const data = await res.json();
    localStorage.setItem('muse_token', data.token);
    if (data.refresh_token) {
      localStorage.setItem('muse_refresh_token', data.refresh_token);
    }
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('muse_token');
    localStorage.removeItem('muse_refresh_token');
    setToken(null);
    setUser(null);
  }, []);

  // API 層偵測到 401 時自動清除登入狀態
  useEffect(() => {
    const handleAuthExpired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

async function fetchMe(token: string): Promise<AuthUser> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('Token invalid');
    const data = await res.json();
    return data.user;
  } finally {
    clearTimeout(timeout);
  }
}
