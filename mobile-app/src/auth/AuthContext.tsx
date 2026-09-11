import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setToken, loadStoredToken, setUnauthorizedHandler } from '../api/client';
import { AuthContext } from './AuthContextValue';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

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
    // Sin esto, el siguiente usuario del mismo móvil veía por un momento las
    // partidas y la ficha cacheadas del anterior.
    queryClient.clear();
  }, [queryClient]);

  // Un 401 de la API (token caducado o usuario borrado) cierra la sesión.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
