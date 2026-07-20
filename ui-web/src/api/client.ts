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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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
  const parsed: unknown = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const body = (parsed ?? {}) as { message?: string };
    throw new Error(body.message ?? `Error ${response.status}`);
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
