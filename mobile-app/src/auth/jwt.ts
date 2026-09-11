/**
 * Igual que en ui-web (token.split('.')[1] decodificado con atob): el
 * backend no expone un endpoint "quien soy", así que el userId se lee
 * directamente del payload del JWT en el cliente. React Native (Hermes,
 * desde RN 0.74+) expone atob/btoa globalmente igual que un navegador, asi
 * que no hace falta un polyfill aparte.
 */
export function decodeUserId(token: string | null): string | null {
  if (!token) return null;
  try {
    // base64url (sin padding, '-' y '_') -> base64 estándar, que es lo que entiende atob.
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { userId?: string };
    return payload.userId ?? null;
  } catch {
    return null;
  }
}
