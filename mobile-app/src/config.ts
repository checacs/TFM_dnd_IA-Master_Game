import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { resolveApiBase } from './utils/api-base';

/**
 * URL de la API. En React Native "localhost" apunta al propio dispositivo, no
 * al PC donde corre el backend, así que:
 *  - Si EXPO_PUBLIC_API_URL está definida (perfiles de EAS en eas.json, o a
 *    mano), se usa tal cual.
 *  - Si no, se deduce sola para jugar en la red local (ver resolveApiBase):
 *    en Expo Go, la IP del PC que sirve el bundle; en el navegador del móvil,
 *    el host desde el que se abrió la página. En ambos casos, puerto 3000.
 *
 * OJO: sin sufijo /api — mobile-app llama directo a la API (sin proxy), y el
 * backend no tiene prefijo global: sus rutas son /auth/login, /games...
 *
 * process.env.EXPO_PUBLIC_API_URL tiene que leerse así, literal: Expo lo
 * sustituye por su valor al generar el bundle.
 */
export const API_BASE = resolveApiBase({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  platform: Platform.OS,
  webLocation:
    Platform.OS === 'web' && typeof window !== 'undefined' && window.location
      ? { protocol: window.location.protocol, hostname: window.location.hostname }
      : undefined,
  devServerHostUri: Constants.expoConfig?.hostUri,
});
