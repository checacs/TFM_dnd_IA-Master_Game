import { useState, useCallback, type ReactNode } from 'react';
import { setToken, getToken } from '../api/client';
import { AuthContext } from './AuthContextValue';

export interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (token: string) => void;
  logout: () => void;
}

/** El JWT lleva { userId, role } (ver docs/10) -- se decodifica a mano porque
 * el proyecto no trae ninguna librería jwt-decode, igual que ya se hacía en
 * LobbyScreen.tsx solo para userId antes de que el payload incluyera role. */
function decodeIsAdmin(token: string | null): boolean {
  if (!token) return false;
  try {
    return JSON.parse(atob(token.split('.')[1])).role === 'admin';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken);

  const login = useCallback((newToken: string) => {
    setToken(newToken);
    setTokenState(newToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, isAdmin: decodeIsAdmin(token), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
