import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { setToken, loadStoredToken } from '../api/client';
import { AuthContext } from './AuthContextValue';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadStoredToken().then((stored) => {
      if (!cancelled) {
        setTokenState(stored);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((newToken: string) => {
    void setToken(newToken);
    setTokenState(newToken);
  }, []);

  const logout = useCallback(() => {
    void setToken(null);
    setTokenState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
