import { createContext } from 'react';

export interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  /** true mientras se lee el token guardado de AsyncStorage al arrancar la
   * app — evita que la navegación decida "no autenticado" y muestre el login
   * por un instante aunque el usuario ya tuviera sesión iniciada. */
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);
