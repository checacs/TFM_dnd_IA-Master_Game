const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

/** Las imágenes de mapas viven en el backend (assets/maps, servidas en /maps) —
 * se piden con el mismo prefijo /api que el resto de la REST, así que el
 * proxy de Vite (una sola regla /api) también las cubre sin configuración aparte. */
export function assetUrl(path: string): string {
  return `${API_BASE}${path}`;
}

let token: string | null = localStorage.getItem('token');

export function setToken(t: string | null) {
  token = t;
  if (t) {
    localStorage.setItem('token', t);
  } else {
    localStorage.removeItem('token');
  }
}

export function getToken(): string | null {
  return token;
}

/**
 * Se invoca cuando la API responde 401 a una petición autenticada (token
 * caducado -- 7 días por defecto -- o usuario borrado por un admin). Antes no
 * se hacía nada: las pantallas se quedaban en blanco o en "Cargando..." para
 * siempre sin volver al login. AuthProvider registra aquí su logout.
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

  // Se lee como texto primero: algunos endpoints (ej. /launch) devuelven un
  // cuerpo vacío con 200/201 porque el caso de uso no tiene nada que retornar.
  // Llamar a response.json() directamente sobre un cuerpo vacío lanza
  // "Unexpected end of JSON input" — hay que distinguir "vacío" de "JSON real".
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    // Típico de un VITE_API_URL mal configurado en producción: la petición
    // acaba en el index.html de Vercel y el error era un críptico
    // "Unexpected token '<'".
    throw new Error(
      response.ok
        ? 'Respuesta inesperada del servidor (¿está bien configurada VITE_API_URL?)'
        : `Error ${response.status}`,
    );
  }

  if (response.status === 401 && sentToken && sentToken === token) {
    setToken(null);
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

  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },
};
