import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';

const TOKEN_KEY = 'token';

// Cache en memoria del token, igual que ui-web/src/api/client.ts — pero aquí
// la carga inicial es forzosamente asíncrona (AsyncStorage no tiene el
// equivalente síncrono de localStorage), así que arranca en null y hay que
// llamar a loadStoredToken() una vez al iniciar la app (ver AuthContext)
// antes de fiarse de getToken().
let token: string | null = null;

export async function loadStoredToken(): Promise<string | null> {
  token = await AsyncStorage.getItem(TOKEN_KEY);
  return token;
}

export async function setToken(t: string | null): Promise<void> {
  token = t;
  if (t) {
    await AsyncStorage.setItem(TOKEN_KEY, t);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export function getToken(): string | null {
  return token;
}

/**
 * Se invoca cuando la API responde 401 a una petición autenticada (token
 * caducado o usuario borrado): AuthProvider registra aquí su logout. Antes
 * no se hacía nada y las pantallas se quedaban vacías sin volver al login.
 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Token con el que sale ESTA petición: si vuelve 401 cuando el usuario ya
  // ha iniciado otra sesión, no debe cerrar la sesión nueva.
  const sentToken = token;
  if (sentToken) {
    headers['Authorization'] = `Bearer ${sentToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Igual que en ui-web: algunos endpoints devuelven un cuerpo vacío con
  // 200/201 (ej. /launch) — leer como texto primero evita reventar con
  // "Unexpected end of JSON input" al llamar a response.json() a pelo.
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(
      response.ok
        ? 'Respuesta inesperada del servidor (¿está bien configurada EXPO_PUBLIC_API_URL?)'
        : `Error ${response.status}`,
    );
  }

  if (response.status === 401 && sentToken && sentToken === token) {
    await setToken(null);
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    const body = (parsed ?? {}) as { message?: string | string[] };
    // ValidationPipe de Nest devuelve message como array de errores.
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
    throw new Error(message ?? `Error ${response.status}`);
  }

  return parsed as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },
};
