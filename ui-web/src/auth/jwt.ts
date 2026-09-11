/**
 * Decodifica (sin verificar -- eso lo hace siempre la API) el payload de un
 * JWT { userId, role }. El payload va en base64url (sin padding, '-' y '_'),
 * que atob no entiende directamente.
 */
export function decodeJwtPayload(token: string | null): { userId?: string; role?: string } | null {
  if (!token) return null;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}
