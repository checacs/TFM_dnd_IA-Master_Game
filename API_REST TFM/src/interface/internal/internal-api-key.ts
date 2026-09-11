import { timingSafeEqual } from 'crypto';

/**
 * Autenticación servicio-a-servicio entre la API y dm-engine.
 *
 * /mcp expone tools que mutan partidas (grant_xp, grant_item, resolve_attack,
 * end_combat...) y estaba abierto en la API pública de Render: cualquiera con
 * la URL podía llamarlas (docs/04 dice que /mcp no se expone públicamente,
 * pero en Render free no hay red privada). Lo mismo con /turn de dm-engine.
 * Ambos servicios comparten ahora un secreto, INTERNAL_API_KEY, que viaja en
 * esta cabecera.
 */
export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

/**
 * true si la petición trae la clave interna correcta. Si no hay clave
 * configurada (desarrollo local), no bloquea -- main.ts avisa al arrancar.
 * Comparación en tiempo constante para no filtrar la clave por timing.
 */
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
