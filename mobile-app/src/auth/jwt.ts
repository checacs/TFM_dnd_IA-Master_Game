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
    const payload = JSON.parse(atob(token.split('.')[1])) as { userId?: string };
    return payload.userId ?? null;
  } catch {
    return null;
  }
}
