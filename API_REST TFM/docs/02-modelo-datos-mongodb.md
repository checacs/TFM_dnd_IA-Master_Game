# Modelo de datos — MongoDB

**Estado:** v2.0 — actualizado para reflejar la implementación real (el diseño original de este documento era del paso 2; desde entonces se añadieron autenticación, mapas de combate y catálogos importados de dnd5eapi.co, y el esquema evolucionó con ellos)
**Se apoya en:** `01-especificacion-funcional.md`
**Colecciones reales:** `characters`, `games`, `enemies`, `maps`, `users`, `spells`

---

## 1. Decisiones de diseño

MongoDB no es relacional: el criterio no es "normalizar como en SQL" sino **guardar junto lo que se consulta junto**. Con eso en mente:

- **`characters`** — colección propia. Un personaje se consulta solo (ficha en el móvil) y también dentro de una partida.
- **`enemies`, `maps`, `spells`** — catálogos maestros, **reutilizables entre partidas**. Nunca se embeben completos en una partida; se referencian por `_id`. `enemies` y `spells` se importan de la SRD API real (dnd5eapi.co); `maps` se siembra a mano con imágenes propias (ver `scripts/import-monsters.ts`, `scripts/import-spells.ts`, `scripts/seed-maps.ts`).
- **`games`** — es el *aggregate root* de una partida. Embebe el **combate activo** (`activeEncounter`) y el **tablero** (`board`) porque la UI necesita tablero + enemigos + turno actual en una sola lectura.
- **`users`** — cuentas de jugador (paso 10, autenticación). Sin registro público: se crean con `scripts/seed-users.ts`.
- Se evita el `$lookup`: dentro de `games.players` se guarda una **copia ligera** de cada personaje (nombre, clase, HP actual) para pintar el tablero sin una consulta extra.

**Cambio importante respecto al diseño original: todos los `_id` son `String`, no `ObjectId`.** Para `characters`/`games`/`users` coinciden con el UUID que genera el propio dominio (`crypto.randomUUID()`); para los catálogos importados (`enemies`, `spells`) coinciden con el `index` de la SRD API (ej. `"goblin"`, `"fireball"`), y para `maps` con el id que tú elijas al sembrarlo (ej. `"taverna"`). Así el dominio nunca tiene que enterarse de un `ObjectId` de Mongo, y los ids de catálogo son legibles en vez de UUIDs opacos.

## 2. Colección `characters`

```ts
interface Character {
  _id: string;                // UUID del dominio
  ownerId: string;             // users._id — antes era ownerName (texto libre), cambió al añadir auth (paso 10)
  gameId: string;
  name: string;
  class: 'guerrero' | 'picaro' | 'mago' | 'clerigo';
  level: number;               // 1-5 en el MVP
  xp: number;
  attributes: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  hp: { current: number; max: number };
  ac: number;
  unassignedSkillPoints: number;
  spellcaster: boolean;
  spells: {
    known: string[];
    slots: { level1: { max: number; used: number }; level2: { max: number; used: number } };
  } | null;
  createdAt: Date;
  updatedAt: Date;
}
```

Índices: `{ ownerId: 1 }`, `{ gameId: 1 }`.

## 3. Colección `enemies` (catálogo maestro — importado de dnd5eapi.co)

```ts
interface Enemy {
  _id: string;                // index de dnd5eapi.co, ej. "goblin"
  name: string;
  description: string;        // generada a partir de tamaño/tipo/alineamiento + special_abilities
  tags: string[];              // [type, subtype] de la SRD API, ej. ["humanoid", "goblinoide"]
  challengeRating: number;
  attributes: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  hp: number;
  ac: number;
  attacks: { name: string; toHitBonus: number; damageDice: string; damageType: string }[];
  resistances: string[];
  source?: string;             // "dnd5eapi.co (SRD 2014)"
}
```

334 monstruos importados con `npm run import:monsters` (`scripts/import-monsters.ts` + `src/infrastructure/dnd5eapi/monster-mapper.ts`). Índices: `{ tags: 1 }`, `{ challengeRating: 1 }`.

## 4. Colección `games` (partidas)

```ts
interface Game {
  _id: string;
  name: string;
  hostUserId: string;          // users._id — quién creó la partida y puede lanzarla (paso 10)
  maxPlayers: number;          // 1-4, validado en Game.create()
  status: 'configuracion' | 'en_curso' | 'pausada' | 'finalizada';
  players: {
    userId: string;             // users._id (paso 10)
    characterId: string;
    name: string;               // copia ligera
    class: 'guerrero' | 'picaro' | 'mago' | 'clerigo'; // copia ligera, añadido para pintar la UI sin ir a characters
    currentHp: number;          // copia ligera
  }[];
  board: {
    rows: number;
    cols: number;
    imageUrl: string | null;    // ruta estática (assets/maps/), null hasta que se aplique un mapa
    combatPoint: { row: number; col: number } | null;
  };
  activeEncounter: {
    // Modelo de rondas (sustituyó a initiativeOrder/currentTurnIndex — ver
    // nota más abajo): roundPhase indica si toca actuar a los jugadores o al
    // DM-IA (enemigos); turnClaims son los characterId con turno reclamado
    // desde el móvil ("Mi turno") -- YA NO es un candado exclusivo, varios
    // jugadores pueden reclamarlo a la vez sin bloquearse entre ellos;
    // actedThisRound son los characterId que ya actuaron en la ronda de
    // jugadores actual.
    roundPhase: 'jugadores' | 'enemigos';
    turnClaims: string[];
    actedThisRound: string[];
    enemies: { instanceId: string; enemyRefId: string; name: string; currentHp: number }[];
    log: string[];
  } | null;
  narrativeLog: { role: 'user' | 'assistant'; content: string }[];
  // Único jugador que puede escribir al DM fuera de combate (ver paso 10 y
  // SendPlayerActionUseCase). null hasta que se lanza la partida (entonces
  // por defecto es el host) o se reasigna a mano.
  captainUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**`narrativeLog` sí existe** (a pesar de lo que decía una versión anterior de este documento): el historial de conversación con el DM-IA se persiste en la propia partida, no solo en el cliente — así ui-web (de solo lectura) y el móvil de cada jugador ven la misma narración sin depender de qué dispositivo la disparó.

**Ya no hay iniciativa entre jugadores.** El diseño original calculaba `1d20 + mod destreza` para jugadores y enemigos y fijaba un `currentTurnIndex`. Tras una revisión basada en la experiencia de partidas de rol de mesa, se sustituyó por el modelo de rondas de arriba: dentro de la fase "jugadores", cualquiera actúa en el orden que quiera (`turnClaims` ya no es un candado exclusivo, solo evita repetir turno en la misma ronda vía `actedThisRound`); los enemigos los resuelve el DM-IA libremente en la fase "enemigos", sin orden fijo tampoco.

Índices: `{ name: 1 }` (único), `{ status: 1 }`.

## 5. Colección `maps` (catálogo de mapas de combate)

```ts
interface BattleMap {
  _id: string;                // el que elijas al sembrar, ej. "taverna"
  name: string;
  description: string;
  tags: string[];
  rows: number;
  cols: number;
  imageUrl: string;            // servido como estático desde assets/maps/, ver src/main.ts
}
```

No estaba en el diseño original — se añadió al pedir tableros con imagen de fondo generada por IA. Se siembra a mano con `npm run seed:maps` (`scripts/seed-maps.ts`), no se importa de ninguna API externa. Índice: `{ tags: 1 }`.

## 6. Colección `users` (paso 10 — autenticación)

```ts
interface User {
  _id: string;
  username: string;
  passwordHash: string;        // bcrypt, nunca en claro
}
```

Sin registro público — se crean con `npm run seed:users` (`scripts/seed-users.ts`). Índice: `{ username: 1 }` (único).

## 7. Colección `spells` (catálogo maestro — importado de dnd5eapi.co)

```ts
interface Spell {
  _id: string;                 // index de dnd5eapi.co, ej. "fireball"
  name: string;
  level: number;                // 0 = truco (cantrip)
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  components: string[];
  material: string | null;
  description: string;          // desc[] + higher_level[] concatenados
  classes: string[];             // índices de clase de la API, ej. ["sorcerer", "wizard"] — todavía no coinciden 1:1 con nuestras 4 clases simplificadas
  damageType: string | null;
  damageAtSlotLevel: Record<string, string> | null;
  savingThrowAbility: string | null;
  savingThrowSuccess: string | null;
  areaOfEffectType: string | null;
  areaOfEffectSize: number | null;
}
```

319 hechizos importados con `npm run import:spells`. Índices: `{ level: 1 }`, `{ classes: 1 }`.

## 8. Relación entre colecciones

```
games.players[].characterId  ──▶  characters._id
games.players[].userId        ──▶  users._id
games.hostUserId               ──▶  users._id
characters.ownerId             ──▶  users._id
characters.gameId              ──▶  games._id
activeEncounter.enemies[].enemyRefId  ──▶  enemies._id  (catálogo, solo lectura)
```

Sigue sin haber `$lookup` en el camino crítico de renderizado del tablero — todo lo necesario vive en el propio documento `games`.

## 9. Índices reales (declarados en los propios esquemas de Mongoose)

```js
db.characters.createIndex({ ownerId: 1 });
db.characters.createIndex({ gameId: 1 });
db.enemies.createIndex({ tags: 1 });
db.enemies.createIndex({ challengeRating: 1 });
db.maps.createIndex({ tags: 1 });
db.users.createIndex({ username: 1 }, { unique: true });
db.spells.createIndex({ level: 1 });
db.spells.createIndex({ classes: 1 });
db.games.createIndex({ name: 1 }, { unique: true });
db.games.createIndex({ status: 1 });
```

## 10. Un bug real que este ejercicio de documentación destapó

Al comparar este documento con el código, `board.imageUrl` estaba en la entidad de dominio (`Game`) pero **no** en el sub-esquema de Mongoose (`boardSchema`) — Mongoose lo descartaba silenciosamente al guardar, así que un mapa aplicado con `start_combat` se "olvidaba" en cuanto se releía la partida de la base de datos. Ya está corregido en `src/infrastructure/persistence/mongoose/schemas/game.schema.ts`. Si ya tenías partidas guardadas con un mapa aplicado antes de este arreglo, ese campo se perdió — habría que volver a aplicarlo.

---

*Este documento ya no tiene un "siguiente paso" fijo — la hoja de ruta original (pasos 3-10) está completa; los desarrollos posteriores (mapas, autenticación, catálogos de dnd5eapi.co) se añadieron sobre esa base y quedan reflejados aquí.*