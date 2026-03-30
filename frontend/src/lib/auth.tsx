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
    if (savedToken && savedToken !== 'mock-demo-token') {
      setToken(savedToken);
      // 驗證 real token 有效性
      fetchMe(savedToken)
        .then((u) => setUser(u))
        .catch(async (err) => {
          if (err.message === 'BACKEND_OFFLINE' && process.env.NODE_ENV === 'development') {
            setUser(MOCK_USER);
          } else {
            // Token invalid/expired — try refresh
            const refreshed = await tryRefreshToken();
            if (!refreshed) {
              localStorage.removeItem('muse_token');
              localStorage.removeItem('muse_refresh_token');
              setToken(null);
            }
          }
        })
        .finally(() => setIsLoading(false));
    } else if (savedToken === 'mock-demo-token') {
      if (process.env.NODE_ENV !== 'development') {
        localStorage.removeItem('muse_token');
        setIsLoading(false);
      } else {
        checkBackendAvailable()
          .then((available) => {
            if (available) {
              localStorage.removeItem('muse_token');
            } else {
              setToken('mock-demo-token');
              setUser(MOCK_USER);
            }
          })
          .finally(() => setIsLoading(false));
      }
    } else {
      checkBackendAvailable()
        .then((available) => {
          if (!available && process.env.NODE_ENV === 'development') {
            localStorage.setItem('muse_token', 'mock-demo-token');
            setToken('mock-demo-token');
            setUser(MOCK_USER);
          }
        })
        .finally(() => setIsLoading(false));
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
      if (data.refresh_token) {
        localStorage.setItem('muse_refresh_token', data.refresh_token);
      }
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      // Distinguish network error (backend offline) from auth error
      if (err instanceof TypeError && err.message.includes('fetch') && process.env.NODE_ENV === 'development') {
        // Network error — backend unavailable, use mock (development only)
        localStorage.setItem('muse_token', 'mock-demo-token');
        setToken('mock-demo-token');
        setUser(MOCK_USER);
      } else {
        // Real auth error from backend — re-throw to show in UI
        throw err;
      }
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('muse_token');
    localStorage.removeItem('muse_refresh_token');
    setToken(null);
    setUser(null);
  }, []);

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
  } catch (err) {
    // Network/abort error → backend is offline
    if (err instanceof TypeError || (err instanceof DOMException && err.name === 'AbortError')) {
      throw new Error('BACKEND_OFFLINE');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkBackendAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${API_BASE.replace('/api/v1', '')}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}
