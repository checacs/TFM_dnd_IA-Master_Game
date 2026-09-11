import { isInternalRequestAuthorized, INTERNAL_API_KEY_HEADER } from './internal-api-key';

/**
 * /mcp (tools que mutan partidas: grant_xp, resolve_attack, end_combat...)
 * estaba expuesto sin ninguna autenticación en la API pública -- cualquiera
 * con la URL de Render podía llamar a las tools. Ahora API y dm-engine
 * comparten un secreto (INTERNAL_API_KEY) que viaja en una cabecera.
 */
describe('isInternalRequestAuthorized', () => {
  it('usa la cabecera x-internal-api-key', () => {
    expect(INTERNAL_API_KEY_HEADER).toBe('x-internal-api-key');
  });

  it('acepta la petición si la clave coincide', () => {
    expect(isInternalRequestAuthorized('s3cr3t-largo', 's3cr3t-largo')).toBe(true);
  });

  it('rechaza una clave distinta, vacía, ausente o de otro tipo', () => {
    expect(isInternalRequestAuthorized('s3cr3t-largo', 's3cr3t-larga')).toBe(false);
    expect(isInternalRequestAuthorized('s3cr3t-largo', '')).toBe(false);
    expect(isInternalRequestAuthorized('s3cr3t-largo', undefined)).toBe(false);
    expect(isInternalRequestAuthorized('s3cr3t-largo', ['s3cr3t-largo'])).toBe(false);
    expect(isInternalRequestAuthorized('s3cr3t-largo', 's3cr3t')).toBe(false);
  });

  it('si no hay clave configurada no bloquea (modo desarrollo; main.ts avisa al arrancar)', () => {
    expect(isInternalRequestAuthorized(undefined, undefined)).toBe(true);
    expect(isInternalRequestAuthorized('', 'lo-que-sea')).toBe(true);
  });
});
