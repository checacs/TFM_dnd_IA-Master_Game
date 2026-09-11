# assets/maps

Coloca aquí las imágenes de mapas de combate que generes (PNG/JPG/WEBP).

La API las sirve como estáticas en `http://localhost:3000/maps/<archivo>` (ver `useStaticAssets` en `src/main.ts`).

## Cómo darlas de alta en el catálogo

1. Copia la imagen aquí, ej. `assets/maps/taberna-jabali.png`.
2. Añade una entrada en `scripts/seed-maps.ts` con su `_id`, `name`, `description`, `tags`, `rows`/`cols` (dimensiones de la cuadrícula que quieres superponer) e `imageUrl: "/maps/taberna-jabali.png"`.
3. Ejecuta `npm run seed:maps`.
4. Ya puedes usar ese `_id` como `mapId` al iniciar un combate:
   `POST /games/:gameId/start-combat` con `{ "enemyIds": [...], "mapId": "taberna-jabali" }`.
