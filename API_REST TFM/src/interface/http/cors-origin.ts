/**
 * Orígenes de la red local (IPs privadas RFC 1918 y localhost), en cualquier
 * puerto. Solo se aceptan con CORS_ALLOW_LAN=true -- pensado para jugar en
 * local desde el navegador del móvil (mobile-app en modo web servida desde el
 * PC, p.ej. http://192.168.1.50:8081), cuya IP no se conoce de antemano.
 */
const LAN_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d{1,5})?$/;

/**
 * ¿Se permite este Origin? Las peticiones sin Origin (app nativa, curl) no
 * pasan por CORS. No se usan cookies (JWT en Authorization), así que ampliar
 * orígenes no abre CSRF.
 */
export function isCorsOriginAllowed(origin: string | undefined, whitelist: string[], allowLan: boolean): boolean {
  if (!origin) {
    return true;
  }
  if (whitelist.includes(origin)) {
    return true;
  }
  return allowLan && LAN_ORIGIN.test(origin);
}
