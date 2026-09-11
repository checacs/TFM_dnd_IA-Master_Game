/** Puerto en el que escucha la API (API_REST TFM) en local y en docker-compose. */
const LOCAL_API_PORT = 3000;

export interface ApiBaseInput {
  /** process.env.EXPO_PUBLIC_API_URL -- la fijan los perfiles de EAS (APK contra Render). */
  envUrl?: string;
  /** Platform.OS */
  platform: string;
  /** window.location cuando la app corre en un navegador (modo web de Expo). */
  webLocation?: { protocol: string; hostname: string };
  /** Constants.expoConfig.hostUri: "IP-del-PC:8081" en Expo Go / dev client. */
  devServerHostUri?: string | null;
}

/**
 * Decide a qué URL llama la app. Antes era EXPO_PUBLIC_API_URL o, si no,
 * http://localhost:3000 -- que en un móvil físico apunta al propio móvil, así
 * que para jugar en local había que averiguar la IP del PC y pasarla a mano.
 * Ahora, sin EXPO_PUBLIC_API_URL, se deduce sola:
 *  - Navegador (modo web): el mismo host desde el que se abrió la página
 *    (http://192.168.1.50:8081 -> API en http://192.168.1.50:3000).
 *  - Expo Go / dev client: el PC que sirve el bundle por la red local.
 */
export function resolveApiBase(input: ApiBaseInput): string {
  if (input.envUrl) {
    return input.envUrl.replace(/\/+$/, '');
  }
  if (input.platform === 'web' && input.webLocation?.hostname) {
    return `${input.webLocation.protocol}//${input.webLocation.hostname}:${LOCAL_API_PORT}`;
  }
  const devHost = input.devServerHostUri?.split(':')[0];
  // Con `expo start --tunnel` el hostUri es un dominio de Expo, no el PC: ahí no hay API.
  if (devHost && !devHost.endsWith('.exp.direct')) {
    return `http://${devHost}:${LOCAL_API_PORT}`;
  }
  return `http://localhost:${LOCAL_API_PORT}`;
}
