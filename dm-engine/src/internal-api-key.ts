import { timingSafeEqual } from 'crypto';

/**
 * Autenticación servicio-a-servicio con la API (mismo contrato que
 * "API_REST TFM/src/interface/internal/internal-api-key.ts").
 *
 * /turn estaba abierto a internet en Render: cualquiera podía gastar la key
 * de DeepSeek o mandar mensajes 'system' inventados para que el DM llamara a
 * grant_currency/grant_item sobre cualquier partida. Ahora API y dm-engine
 * comparten INTERNAL_API_KEY, que viaja en esta cabecera en /turn (API ->
 * dm-engine) y en /mcp (dm-engine -> API).
 */
export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

/** true si la cabecera trae la clave correcta; sin clave configurada (desarrollo) no bloquea. */
export function isInternalRequestAuthorized(expectedKey: string | undefined, providedHeader: unknown): boolean {
  if (!expectedKey) {
    return true;
  }
  if (typeof providedHeader !== 'string' || providedHeader.length === 0) {
    return false;
  }
  const provided = Buffer.from(providedHeader);
  const expected = Buffer.from(expectedKey);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
