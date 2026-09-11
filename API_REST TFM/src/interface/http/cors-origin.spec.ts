import { isCorsOriginAllowed } from './cors-origin';

/**
 * Para jugar en local desde el navegador del móvil (mobile-app en modo web,
 * servido desde el PC en http://192.168.x.x:8081), la API tiene que aceptar
 * orígenes de la red local, cuya IP no se conoce de antemano. Solo se activa
 * con CORS_ALLOW_LAN=true (docker-compose local), nunca en Render.
 */
describe('isCorsOriginAllowed', () => {
  const whitelist = ['http://localhost:3001', 'https://ui-web-three.vercel.app'];

  it('acepta los orígenes de la lista', () => {
    expect(isCorsOriginAllowed('https://ui-web-three.vercel.app', whitelist, false)).toBe(true);
  });

  it('acepta peticiones sin Origin (app nativa, curl)', () => {
    expect(isCorsOriginAllowed(undefined, whitelist, false)).toBe(true);
  });

  it('rechaza un origen de la red local si CORS_ALLOW_LAN no está activo', () => {
    expect(isCorsOriginAllowed('http://192.168.1.50:8081', whitelist, false)).toBe(false);
  });

  it('con CORS_ALLOW_LAN acepta IPs privadas (192.168/16, 10/8, 172.16/12) y localhost en cualquier puerto', () => {
    for (const origin of [
      'http://192.168.1.50:8081',
      'http://10.0.0.7:19006',
      'http://172.20.3.4:8081',
      'http://localhost:8082',
      'http://127.0.0.1:8081',
    ]) {
      expect(isCorsOriginAllowed(origin, whitelist, true)).toBe(true);
    }
  });

  it('con CORS_ALLOW_LAN sigue rechazando orígenes públicos o parecidos', () => {
    for (const origin of [
      'https://evil.example.com',
      'http://172.32.0.1:8081',
      'http://192.168.1.50.evil.com',
      'http://11.0.0.1',
    ]) {
      expect(isCorsOriginAllowed(origin, whitelist, true)).toBe(false);
    }
  });
});
