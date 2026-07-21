# Servidor MCP

**Estado:** v2.1 — actualizado para reflejar la implementación real (el diseño original era del paso 4; desde entonces se añadieron mapas de combate, el catálogo de hechizos, el modelo de rondas, posicionamiento en el tablero, objetos/condiciones, cierre de combate y lanzamiento real de hechizos)
**Se apoya en:** `03-arquitectura-clean-api-nestjs.md`
**Tools reales:** 23 (fueron creciendo desde las 6 originales; las dos últimas, `end_combat` y `cast_spell`, se añadieron para cerrar el combate de verdad tras derrotar a todos los enemigos y para que un hechizo narrado consuma una ranura y aplique daño real, respectivamente — ver `09.` más abajo)

---

## 1. Qué expone el MCP y qué no

No todo lo que hace la API necesita ser una tool. El criterio es simple: **¿quién decide ejecutar esta acción, el jugador humano o el DM-IA?**

| Acción | ¿Quién la decide? | Superficie |
|---|---|---|
| Configurar partida, crear personaje | Jugador | Solo REST |
| Atacar en mi turno | Jugador | Solo REST |
| Guardar partida (botón explícito) | Jugador | Solo REST |
| Asignar puntos de habilidad al subir de nivel | Jugador (app móvil) | Solo REST |
| **"Mi turno" (reclamar el candado de la ronda)** | Jugador (app móvil) | Solo REST |
| **Escribir la acción del personaje (o hablar con el DM fuera de combate)** | Jugador (app móvil) | Solo REST |
| **Tirada ad-hoc con "Tirar Dados"** | Jugador (app móvil) | Solo REST |
| **Reasignar quién es el capitán** | Jugador (host, app móvil) | Solo REST |
| **Iniciar combate, elegir enemigos y mapa** | DM-IA | **MCP** |
| **Resolver el turno de un enemigo** | DM-IA | **MCP** |
| **Reabrir la ronda de jugadores tras resolver enemigos** | DM-IA | **MCP** |
| **Tirada ad-hoc narrativa** (ej. "¿la puerta aguanta?") | DM-IA | **MCP** |
| **Consultar catálogo de enemigos** | DM-IA | **MCP** (solo lectura) |
| **Consultar catálogo de mapas de combate** | DM-IA | **MCP** (solo lectura) |
| **Consultar catálogo de hechizos** | DM-IA | **MCP** (solo lectura) |
| **Consultar estado actual de la partida** | DM-IA | **MCP** (solo lectura) |
| **Otorgar XP tras un evento narrativo** | DM-IA | **MCP** |
| **Cerrar por completo un combate ya resuelto** | DM-IA | **MCP** (`end_combat`) |
| **Lanzar un hechizo narrado (consumir ranura real, aplicar daño real)** | DM-IA | **MCP** (`cast_spell`; existe también una ruta REST equivalente para cuando es el propio jugador quien la dispara desde el móvil, con comprobación de propiedad del personaje) |

Esto evita el error típico de "exponer toda la API como tools": cuantas menos tools, más predecible es el comportamiento del LLM. Nótese el paralelismo con el modelo de rondas (ver `01-especificacion-funcional.md`): "Mi turno" y la acción del jugador son siempre REST porque las decide el jugador humano, aunque ocurran en pleno combate — el DM-IA nunca reclama turno ni escribe la acción de un jugador por él.

## 2. Transporte: Streamable HTTP, en modo *stateless*

El transporte `stdio` de MCP es para clientes de escritorio que lanzan el servidor como subproceso local. Aquí el Motor IA - DM (`dm-engine`, un proceso aparte) y el servidor MCP viven en procesos distintos — el transporte correcto es **Streamable HTTP**, montado como una ruta más de la misma aplicación NestJS.

**Corrección importante sobre el diseño original:** el patrón inicial de este documento creaba **un único** `McpServer`/transporte compartido para todas las peticiones. En la práctica esto rompía al segundo turno con un 500 — el patrón oficial del SDK para modo *stateless* (sin sesión, que es el nuestro) crea una instancia **nueva de `McpServer` y de transporte en cada petición** (ver `examples/server/simpleStatelessStreamableHttp` del propio paquete `@modelcontextprotocol/sdk`). `GameMcpTools` sí se reutiliza (se recupera una vez del contenedor de Nest), solo el servidor/transporte MCP se recrean por petición.

## 3. Ubicación en la arquitectura

```
interface/
  http/              (paso 3)
  mcp/
    mcp.server.ts        # registro de las 8 tools con sus esquemas Zod
    game-mcp-tools.ts    # capa fina que invoca los casos de uso
```

(No hay subcarpeta `schemas/` con un archivo por tool — los esquemas Zod se declaran inline en cada `server.tool(...)`, más simple que lo previsto originalmente.)

Casos de uso de solo lectura que sostienen las tools:

- `SearchEnemiesUseCase` — busca en el catálogo de enemigos (334 importados de dnd5eapi.co) por etiquetas/dificultad.
- `SearchMapsUseCase` — busca en el catálogo de mapas de combate por etiquetas.
- `SearchSpellsUseCase` — busca en el catálogo de hechizos (319 importados de dnd5eapi.co) por clase/nivel máximo.
- `GetGameStateUseCase` — devuelve una foto del estado actual de la partida.
- `GrantXpUseCase` — suma XP y detecta si se cruza el umbral de nivel (marca `unassignedSkillPoints`, **no** los asigna — eso lo sigue haciendo el jugador vía `LevelUpUseCase`).

## 4. Capa fina de tools (adaptador, sin lógica de negocio) — código real

```ts
// interface/mcp/game-mcp-tools.ts
@Injectable()
export class GameMcpTools {
  constructor(
    private readonly rollDice: RollDiceUseCase,
    private readonly resolveAttack: ResolveAttackUseCase,
    private readonly startCombat: StartCombatUseCase,
    private readonly searchEnemies: SearchEnemiesUseCase,
    private readonly searchMaps: SearchMapsUseCase,
    private readonly searchSpells: SearchSpellsUseCase,
    private readonly getGameState: GetGameStateUseCase,
    private readonly grantXp: GrantXpUseCase,
  ) {}

  rollDiceTool(notation: string) {
    return this.rollDice.execute({ notation });
  }

  resolveAttackTool(input: ResolveAttackInput) {
    return this.resolveAttack.execute(input);
  }

  startCombatTool(input: StartCombatInput) {
    return this.startCombat.execute(input);
  }

  searchEnemiesTool(criteria: EnemySearchCriteria) {
    return this.searchEnemies.execute(criteria);
  }

  searchMapsTool(criteria: MapSearchCriteria) {
    return this.searchMaps.execute(criteria);
  }

  searchSpellsTool(criteria: SpellSearchCriteria) {
    return this.searchSpells.execute(criteria);
  }

  gameStateTool(gameId: string) {
    return this.getGameState.execute({ gameId });
  }

  grantXpTool(characterId: string, amount: number) {
    return this.grantXp.execute({ characterId, amount });
  }
}
```

## 5. Registro de las 8 tools — código real

```ts
// interface/mcp/mcp.server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerGameTools(server: McpServer, tools: GameMcpTools): void {
  server.tool('roll_dice', '...', { notation: z.string() }, async ({ notation }) => ({
    content: [{ type: 'text', text: JSON.stringify(tools.rollDiceTool(notation)) }],
  }));

  server.tool('resolve_attack', '...', {
    gameId: z.string(), targetId: z.string(), attackerModifier: z.number().int(),
    targetArmorClass: z.number().int(), damageDice: z.string(),
  }, async (input) => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.resolveAttackTool(input)) }],
  }));

  server.tool('start_combat',
    'Inicia un combate con los enemigos indicados, arrancando en fase "jugadores" (ya no hay ' +
    'iniciativa entre jugadores, ver sección de rondas más abajo). ' +
    'Opcionalmente aplica un mapa de fondo al tablero (mapId, ver get_battle_maps).',
    { gameId: z.string(), enemyIds: z.array(z.string()), mapId: z.string().optional() },
    async (input) => {
      const result = await tools.startCombatTool(input);
      return { content: [{ type: 'text', text: JSON.stringify({ started: true, ...result }) }] };
    },
  );

  // NUEVA — cierra la fase "enemigos" y reabre la ronda de jugadores (ver
  // sección de rondas más abajo). El DM-IA la llama tras resolver con
  // resolve_attack a todos los enemigos vivos de la ronda.
  server.tool('advance_to_player_round',
    'Reabre la ronda de jugadores tras resolver la fase de enemigos de un combate activo.',
    { gameId: z.string() },
    async ({ gameId }) => {
      await tools.advanceToPlayerRoundTool(gameId);
      return { content: [{ type: 'text', text: JSON.stringify({ advanced: true }) }] };
    },
  );

  server.tool('get_enemy_catalog', '...',
    { tags: z.array(z.string()).optional(), maxChallengeRating: z.number().optional() },
    async ({ tags, maxChallengeRating }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.searchEnemiesTool({ tags, maxChallengeRating })) }],
    }),
  );

  // NUEVA — no estaba en el diseño original
  server.tool('get_battle_maps',
    'Busca mapas de combate del catálogo por etiquetas. Úsalo para elegir un mapId antes de start_combat.',
    { tags: z.array(z.string()).optional() },
    async ({ tags }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.searchMapsTool({ tags })) }],
    }),
  );

  // NUEVA — no estaba en el diseño original
  server.tool('get_spell_catalog',
    'Busca hechizos por clase o nivel máximo. Nunca inventes el efecto, daño o tirada de salvación de un hechizo.',
    { classIndex: z.string().optional(), maxLevel: z.number().optional() },
    async ({ classIndex, maxLevel }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.searchSpellsTool({ classIndex, maxLevel })) }],
    }),
  );

  server.tool('get_game_state', '...', { gameId: z.string() }, async ({ gameId }) => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.gameStateTool(gameId)) }],
  }));

  server.tool('grant_xp', '...',
    { characterId: z.string(), amount: z.number().int().positive() },
    async ({ characterId, amount }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.grantXpTool(characterId, amount)) }],
    }),
  );
}
```

## 6. Montaje real sobre NestJS — instancia nueva por petición

```ts
// main.ts (fragmento real)
const gameMcpTools = app.get(GameMcpTools); // esta sí se reutiliza
const httpAdapter = app.getHttpAdapter().getInstance();

httpAdapter.post('/mcp', async (req, res) => {
  try {
    const mcpServer = new McpServer({ name: 'dnd-game-mcp', version: '1.0.0' });
    registerGameTools(mcpServer, gameMcpTools);

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on('close', () => {
      transport.close();
      mcpServer.close();
    });
  } catch (error) {
    console.error('Error manejando la petición MCP:', error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

httpAdapter.get('/mcp', (_req, res) => {
  res.writeHead(405).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }));
});
httpAdapter.delete('/mcp', (_req, res) => {
  res.writeHead(405).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }));
});
```

Nota para quien conecte un cliente MCP a este servidor: si una tool falla (ej. `get_game_state` con un `gameId` que no existe), el SDK lo convierte en un resultado con `isError: true` y **texto plano** en `content` (no JSON) — cualquier cliente que asuma que el contenido siempre es JSON y haga `JSON.parse` a ciegas debe comprobar `isError` primero. Esto se detectó de verdad al conectar `dm-engine` (ver el mapeo de `McpToolCaller` en el proyecto `dm-engine`).

## 7. Ejemplo de flujo — un turno de combate completo

1. Es el turno del jugador → la UI llama a `POST /games/:id/attack` (REST). El jugador ve el resultado al instante.
2. Un mensaje libre del jugador (HU2) llega a `POST /games/:id/message` (REST) → la API lo reenvía a `dm-engine` (`SendMessageUseCase` → `HttpDmEngineClient`), pasando el `gameId` — el DM-IA necesita saberlo para poder llamar a `get_game_state`/`start_combat`/`resolve_attack` con el id correcto (esto tampoco estaba en el diseño original: el primer intento real falló porque el `gameId` nunca llegaba al system prompt del motor).
3. El Motor IA llama a las tools que necesite — `get_game_state`, `get_enemy_catalog`, `get_spell_catalog`, `get_battle_maps`, `resolve_attack`, `start_combat`, `grant_xp` — **mismo caso de uso, mismo `DiceRoller`**, ninguna lógica duplicada.
4. El Motor IA narra el resultado; la API traduce cada llamada a tool en un evento (`combate_iniciado`, `ataque_resuelto`, `tirada_realizada`, `xp_otorgada`) para que la UI actualice tablero/enemigos/dados sin tener que interpretar texto libre.

## 8. Seguridad

- El endpoint `/mcp` no se expone públicamente: el único cliente esperado es `dm-engine`, dentro de la misma red de confianza — sigue siendo así incluso ahora que `dm-engine` usa DeepSeek en vez de la API de Anthropic (si se hubiera usado el conector MCP nativo de Anthropic, `/mcp` habría tenido que exponerse públicamente; con DeepSeek, `dm-engine` es su propio cliente MCP y la conexión se queda interna).
- Cada tool valida su entrada con Zod exactamente igual que los DTOs de `class-validator` en REST.
- Ninguna tool puede saltarse las invariantes del dominio — todas pasan por el mismo caso de uso que usa la REST.

## 9. Definición de terminado

- Las 23 tools están registradas y responden a `tools/list` (verificado con el inspector oficial de MCP: `npx @modelcontextprotocol/inspector`, transporte "Streamable HTTP", conectado a `http://localhost:3000/mcp`).
- `interface/mcp/` no contiene reglas de negocio.
- Confirmado en vivo (no solo en teoría): una partida real, con Mongo real, respondiendo a `tools/list` y a llamadas de tool individuales.

## 10. Añadidas tras detectar fallos reales en partida (`end_combat`, `cast_spell`)

Dos tools no estaban en ninguna versión anterior de este documento porque el hueco que cubren solo se detectó jugando partidas reales, no en el diseño:

- **`end_combat(gameId)`** — se detectó que, tras derrotar a todos los enemigos de un combate, no existía ninguna forma de cerrar `activeEncounter` de verdad: `startEncounter()` incluso lanza error si ya hay uno activo, así que el combate se quedaba "abierto" para siempre aunque la narración ya hubiera pasado a otra escena — el panel de "Combate" y los marcadores de enemigos derrotados seguían mostrándose en el tablero del jugador. `dm-turn.ts` fuerza la llamada con un chequeo verificable contra `get_game_state` (no por impresión narrativa) en cuanto detecta que todos los enemigos atacados ese turno están a 0 HP real y `end_combat` todavía no se llamó.
- **`cast_spell(gameId, casterCharacterId, spellId, targetId?)`** — se detectó que un personaje conjurador (mago/clérigo) podía llegar a un combate sin ningún hechizo conocido ni equipo arcano, y que aunque los tuviera, el DM-IA solo podía *narrar* que lanzaba un hechizo sin ningún efecto mecánico real (sin consumir ranura, sin aplicar daño). Comparte caso de uso (`CastSpellUseCase`) con el endpoint REST `POST /games/:id/cast-spell` (el jugador lanzando su propio hechizo desde el móvil), pero a diferencia de esa ruta, la tool MCP no manda `requestingUserId`: es el DM-IA quien decide resolver el hechizo, igual que `end_player_turn` o `grant_item` no comprueban propiedad porque las invoca el DM, no el jugador.

Ambas siguen exactamente el mismo patrón que el resto: Zod + descripción imperativa en `mcp.server.ts`, método de una línea en `game-mcp-tools.ts`, caso de uso con tests en `application/`, y evento documentado en `05-motor-ia-dm-deepseek.md` sección 4 (`combate_terminado`, `hechizo_lanzado`).

---

*La hoja de ruta original (pasos 1-10) está completa. Los desarrollos posteriores (mapas, hechizos, el fallo de instancia compartida, el cierre de combate y el lanzamiento real de hechizos) se añadieron sobre esa base y quedan reflejados aquí.*