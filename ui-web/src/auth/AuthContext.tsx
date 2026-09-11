import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setToken, getToken, setUnauthorizedHandler } from '../api/client';
import { AuthContext } from './AuthContextValue';
import { decodeJwtPayload } from './jwt';

export interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (token: string) => void;
  logout: () => void;
}

/** El JWT lleva { userId, role } (ver docs/10) -- solo se usa para mostrar u
 * ocultar la UI de administración; la API lo comprueba siempre (AdminGuard). */
function decodeIsAdmin(token: string | null): boolean {
  return decodeJwtPayload(token)?.role === 'admin';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken);
  const queryClient = useQueryClient();

  const login = useCallback((newToken: string) => {
    setToken(newToken);
    setTokenState(newToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    // Sin esto, el siguiente usuario que entrara en el mismo navegador veía
    // por un momento las partidas cacheadas del anterior.
    queryClient.clear();
  }, [queryClient]);

  // Un 401 de la API (token caducado o usuario borrado) cierra la sesión.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, isAdmin: decodeIsAdmin(token), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
