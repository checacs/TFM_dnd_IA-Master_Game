# UI Web — D&D con IA Master

Interfaz web del juego de rol D&D con Dungeon Master IA.

## Stack

- React 19 + TypeScript + Vite
- TanStack Query (estado servidor)
- React Router (navegacion)

## Inicio rapido

```bash
npm install
npm run dev        # http://localhost:5173
```

La app espera que la API (`API_REST TFM`) este corriendo en `http://localhost:3000`.
Configura la variable de entorno `VITE_API_URL` si el backend esta en otra direccion.

## Pantallas

| Ruta | Pantalla |
|---|---|
| `/login` | Inicio de sesion (JWT) |
| `/` | Configuracion de partida |
| `/game/:id/lobby` | Sala de espera |
| `/game/:id` | Juego (chat + tablero + enemigos + dados) |

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — compilacion de produccion
- `npm run lint` — ESLint
- `npm run preview` — preview de produccion
