# mobile-app — D&D con IA Master (móvil)

App móvil (React Native + Expo, TypeScript) para jugar desde el teléfono: el jugador inicia sesión, elige una de sus partidas, se une creando un personaje (nombre + clase) y espera en la sala hasta que el host lanza la partida. Tras un rediseño del sistema de turnos, **es la única superficie desde la que se juega** — `ui-web` pasó a ser de solo lectura (narración + mapa + combate, ver su propio README). Una vez en curso, la pantalla del móvil combina la ficha de personaje con los controles de juego: botón "Mi turno" (reclama el candado de la ronda de jugadores — ya no hay iniciativa ni orden fijo entre jugadores), botón "Tirar Dados" (tirada ad-hoc `1d20`) y un campo de texto para la acción del personaje (o para hablar con el DM fuera de combate, si eres el capitán del grupo).

## Stack

- React Native + Expo (TypeScript), plantilla `blank-typescript`
- React Navigation (native-stack) para Login → Lista de partidas → Sala de espera → Ficha de personaje
- TanStack Query (mismo patrón que `ui-web`) para las llamadas a `API_REST TFM`, con polling de la partida mientras está en la sala de espera
- `@react-native-async-storage/async-storage` para persistir el token JWT (equivalente móvil de `localStorage`)

## Estado actual (paso a paso, "de menos a más")

- [x] Login (usuario/contraseña contra `POST /auth/login`), con el mismo fondo de pergamino que `ui-web` (`assets/fondo_aventura.jpg`).
- [x] Lista de partidas del usuario (`GET /games`), navegación a la sala de espera de una partida.
- [x] Unirse a una partida creando personaje (nombre + clase, `POST /games/:id/join`) y sala de espera con los huecos de jugador (`GameDetailScreen`).
- [x] El host puede lanzar la partida (`POST /games/:id/launch`); al pasar a `en_curso`, cada jugador salta solo a su ficha de personaje.
- [x] Ficha de personaje de solo lectura (`GET /characters/:id`): HP, CA, barra de XP, atributos con botón "+" para asignar puntos de habilidad (`POST /characters/:id/assign-skill-point`), hechizos y ranuras si es conjurador, inventario/arma equipada si tiene.
- [x] Botón "Mi turno" (`POST /games/:id/claim-turn`) — reclama el candado de turno de la ronda de jugadores en curso; se deshabilita si no es la fase de jugadores, si ya actué esta ronda o si otro jugador tiene el turno reclamado.
- [x] Botón "Tirar Dados" (`POST /games/:id/player-roll`, notación `1d20` por defecto) — tirada ad-hoc, no muta el estado de la partida.
- [x] Campo de acción al fondo de la pantalla (`POST /games/:id/player-action`) — equivale a responder al chat del DM. Habilitado solo si tengo el turno reclamado (en combate) o si soy el capitán del grupo (fuera de combate); libera el turno automáticamente al enviar.
- [x] Sondeo (`GET /games/:id`) cada 3s mientras la partida no esté `finalizada`, para reflejar en tiempo casi real la fase de ronda, quién tiene el turno y la última narración, venga de este móvil o de otro.

## Inicio rápido

```bash
npm install
npx expo start
```

En React Native `localhost` apunta al propio dispositivo/emulador, no al ordenador donde corre el backend. Configura la URL real de la API con una variable de entorno pública de Expo antes de arrancar:

```bash
EXPO_PUBLIC_API_URL=http://TU_IP_LOCAL:3000 npx expo start
```

Sin definirla, se usa `http://localhost:3000` (válido solo en modo web de Expo o emulador Android con el puerto reenviado). **Sin sufijo `/api`**: a diferencia de `ui-web` (que llama a `/api/*` y depende del proxy de Vite para reescribir esa ruta antes de reenviarla), `mobile-app` llama directo al backend sin proxy, y el backend no tiene ningún prefijo global — sus rutas son `/auth/login`, `/games`, etc.

## Estructura

```
src/
  api/         cliente HTTP (fetch + token) y hooks de TanStack Query
  auth/        contexto de sesión (token en AsyncStorage) + decodificación del userId del JWT
  navigation/  stack de React Navigation y tipado de rutas
  screens/     LoginScreen, GameListScreen, GameDetailScreen (sala de espera), CharacterSheetScreen
  theme/       paleta de colores compartida con ui-web (papiro/pergamino)
  types/       contrato con la API (mismo shape que ui-web/src/types/api.ts)
  utils/       cálculo de progreso de XP (umbrales espejo de Character.entity.ts)
```

## Nota sobre `node_modules`

Este proyecto se generó y se probó en un entorno sandbox cuya carpeta de trabajo tiene problemas de renombrado atómico de archivos con instalaciones grandes de npm (paquetes nativos de React Native). Si al abrir el proyecto ves carpetas `node_modules_broken*` o `node_modules` con un tamaño sospechosamente pequeño, bórralas y ejecuta `npm install` de nuevo desde tu máquina — no debería reproducirse fuera de ese sandbox.
