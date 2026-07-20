/**
 * En React Native "localhost" apunta al propio dispositivo/emulador, no al
 * ordenador donde corre el backend (a diferencia del navegador en ui-web) —
 * por eso la URL de la API se saca de una variable de entorno pública de Expo
 * (EXPO_PUBLIC_*, embebida en el bundle en build time) en vez de asumir
 * localhost. Para probar en un móvil físico o emulador, define
 * EXPO_PUBLIC_API_URL con la IP de tu red local, ej:
 *   EXPO_PUBLIC_API_URL=http://192.168.1.50:3000 npx expo start
 *
 * OJO: sin sufijo /api — a diferencia de ui-web (que llama a /api/* y
 * depende de que el proxy de Vite reescriba esa ruta quitando el prefijo
 * antes de reenviarla al backend real), mobile-app llama directo a esta URL
 * sin ningún proxy de por medio, y el backend (API_REST TFM/src/main.ts) no
 * tiene ningún prefijo global — sus rutas reales son /auth/login, /games,
 * etc., nunca /api/algo. Añadir /api aquí producía "Cannot POST
 * /api/auth/login" (404) en cualquier login desde el móvil o desde el modo
 * web de Expo.
 */
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
