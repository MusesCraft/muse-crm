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

// Mock user for demo when backend is unavailable
const MOCK_USER: AuthUser = {
  id: 'demo-001',
  name: 'MUSE 管理員',
  email: 'admin@muse-crm.com',
  role: 'admin',
  avatar_url: null,
  is_active: true,
};

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
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化：從 localStorage 讀取 token
  useEffect(() => {
    const savedToken = localStorage.getItem('muse_token');
    if (savedToken) {
      setToken(savedToken);
      // 驗證 token 有效性
      fetchMe(savedToken)
        .then((u) => setUser(u))
        .catch(() => {
          // Backend unavailable — use mock user for demo
          if (savedToken === 'mock-demo-token') {
            setUser(MOCK_USER);
          } else {
            // Try as mock fallback
            setUser(MOCK_USER);
            localStorage.setItem('muse_token', 'mock-demo-token');
            setToken('mock-demo-token');
          }
        })
        .finally(() => setIsLoading(false));
    } else {
      // No saved token — auto-login with mock for demo
      localStorage.setItem('muse_token', 'mock-demo-token');
      setToken('mock-demo-token');
      setUser(MOCK_USER);
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
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
      setToken(data.token);
      setUser(data.user);
    } catch {
      // Backend unavailable — use mock login for demo
      localStorage.setItem('muse_token', 'mock-demo-token');
      setToken('mock-demo-token');
      setUser(MOCK_USER);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('muse_token');
    setToken(null);
    setUser(null);
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
