# UI Web — D&D con IA Master

Interfaz web del juego de rol D&D con Dungeon Master IA. Reconstruida desde cero (ver `docs/07-ui-web.md` y el historial del proyecto) sobre Vite + React + TanStack Query + React Router, con una estética de pergamino/papiro tanto en las pantallas de portada como en la partida.

## Stack

- React 19 + TypeScript + Vite
- TanStack Query (estado servidor, polling de partida)
- React Router (navegación)

## Inicio rápido

```bash
npm install
npm run dev        # http://localhost:5173
```

La app espera que la API (`API_REST TFM`) esté corriendo en `http://localhost:3000`.
Configura la variable de entorno `VITE_API_URL` si el backend está en otra dirección.

## Pantallas

| Ruta | Pantalla |
|---|---|
| `/login` | Inicio de sesión (JWT) — fondo a pantalla completa `pantalla_inicial.png` |
| `/` | Configuración de partida (crear / unirse) |
| `/game/:gameId/lobby` | Sala de espera |
| `/game/:gameId` | Partida (solo lectura): narración del DM + eco de jugadores (izquierda) + tablero de jugadores/mapa/combate (derecha), sobre fondo de pergamino `fondo_aventura.jpg`. Se juega desde la app móvil, no desde aquí. |

### Pantalla de partida (`GameScreen` + `BoardPanel`)

- **Jugadores**: dos columnas — roster de jugadores (nombre, clase, HP, condiciones) a la izquierda; mapa de batalla con marcadores de posición a la derecha, dimensionado para no recortar ni deformar tableros con más filas que columnas.
- **Combate**: cuando hay un encuentro activo, la caja de combate (enemigos, fase de ronda, quién tiene el turno reclamado) aparece pegada debajo del roster de jugadores, en vez de duplicar la lista de enemigos en un panel aparte. Es de solo lectura — no hay botón de ataque aquí, eso vive en la app móvil (ver `mobile-app/README.md`). Además de que exista `activeEncounter`, `GameScreen` exige que quede al menos un enemigo con `currentHp > 0`: es una red de seguridad en el propio frontend para el caso en que el backend no haya cerrado el combate (ver `end_combat` en `docs/04-servidor-mcp.md`) — sin ella, el panel y el marcador del enemigo ya derrotado se quedaban en pantalla aunque la partida ya hubiera avanzado a otra escena.
- Los marcadores del mapa (jugadores y enemigos) dependen de que el DM-IA llame a `place_participant` — ver la sección "Limitaciones conocidas" del README de `dm-engine`.

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — compilación de producción
- `npm run lint` — ESLint
- `npm run preview` — preview de producción
