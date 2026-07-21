# Motor IA - DM (con DeepSeek)

**Estado:** v1.0 — Paso 5 de la hoja de ruta
**Se apoya en:** `04-servidor-mcp.md`
**Precede a:** `agents.md` + skills del repo

---

## 0. Nota sobre el paso 4: el servidor MCP se queda privado

Iba a corregirte la nota de seguridad del paso 4 porque la API de Anthropic tiene un "conector MCP nativo" (parámetro `mcp_servers` en la Messages API) que conecta Claude directamente a un servidor MCP remoto — pero para eso el servidor tiene que ser accesible públicamente desde la infraestructura de Anthropic, lo cual habría obligado a exponer `/mcp` a internet.

**Con DeepSeek esto no aplica.** Su API es compatible con OpenAI (function calling estándar), pero no tiene un conector MCP nativo equivalente. Eso significa que **el propio Motor IA tiene que ser el cliente MCP**: se conecta a nuestro servidor MCP privado, descubre las tools, las traduce al formato de function calling de DeepSeek, y ejecuta el bucle de llamada-respuesta él mismo. Buena noticia doble: la nota original del paso 4 (`/mcp` no se expone públicamente) sigue siendo válida, y de paso vais a implementar el mecanismo de un cliente MCP real en vez de apoyaros en un atajo de un proveedor — más trabajo, pero más valor demostrativo para el TFM.

## 1. Dónde vive el Motor IA en la arquitectura

Es un servicio propio (`dm-engine/`), no una capa dentro de la Clean Architecture del paso 3 — es un **consumidor** del adaptador MCP, exactamente igual que la UI web es consumidor del adaptador REST. Sus dos dependencias externas:

- **Servidor MCP** (nuestro, privado, paso 4) — para ejecutar acciones y consultar estado del juego.
- **API de DeepSeek** (externa, pública) — el LLM que razona y decide.

## 2. El bucle de orquestación

```ts
// dm-engine/dm-turn.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import OpenAI from 'openai';

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com', // API compatible con OpenAI
});

const mcpClient = new Client({ name: 'dnd-dm-engine', version: '1.0.0' });
await mcpClient.connect(
  new StreamableHTTPClientTransport(new URL(process.env.MCP_SERVER_URL!)), // ej. http://api:3000/mcp, red interna
);

async function getToolsForDeepSeek() {
  const { tools } = await mcpClient.listTools();
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

export async function runDmTurn(messages: ChatMessage[]) {
  const tools = await getToolsForDeepSeek();
  const events: GameEvent[] = [];
  const withSystem = () => [{ role: 'system' as const, content: DM_SYSTEM_PROMPT }, ...messages];

  let response = await deepseek.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL!, // comprobar el id vigente en api-docs.deepseek.com — cambia con frecuencia
    messages: withSystem(),
    tools,
  });

  while (response.choices[0].message.tool_calls?.length) {
    messages.push(response.choices[0].message);

    for (const call of response.choices[0].message.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      const result = await mcpClient.callTool({ name: call.function.name, arguments: args });
      events.push(toGameEvent(call.function.name, result));
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result.content) });
    }

    response = await deepseek.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL!,
      messages: withSystem(),
      tools,
    });
  }

  return { narrative: response.choices[0].message.content, events };
}
```

Nota de implementación: el nombre exacto del modelo de DeepSeek ha cambiado varias veces este año (alias como `deepseek-chat`/`deepseek-reasoner` conviven con nombres de la familia más reciente) — configúralo por variable de entorno y verifica el id vigente en la documentación oficial antes de desplegar, en vez de fijarlo en el código.

## 3. System prompt (extracto)

```
Eres el Dungeon Master de una partida de D&D 5e simplificado.

Reglas innegociables:
- Nunca inventas el resultado de una tirada. Toda tirada pasa por la tool roll_dice
  o queda implícita en resolve_attack / start_combat.
- Nunca inventas estadísticas de un enemigo. Antes de introducir uno en la narración,
  consúltalo con get_enemy_catalog.
- Si no tienes el estado actual de la partida en el contexto reciente, llama a
  get_game_state antes de narrar — no asumas el estado a partir de la conversación.
- Al derrotar un enemigo, llama a grant_xp para los personajes que participaron.

Estilo narrativo: dramático pero conciso (2-4 frases por turno salvo momentos clave).
Tu respuesta final de texto es siempre narración pura — nunca emitas JSON tú mismo,
el sistema ya construye los eventos estructurados a partir de tus llamadas a tools.
```

## 4. De llamada a tool → evento para la UI

El `dm-engine` intercepta cada `tool_call`/resultado del bucle y lo traduce a un evento tipado antes de mandarlo a la UI — el modelo nunca construye este JSON directamente.

| Tool invocada | Evento emitido a la UI | Qué hace la UI con él |
|---|---|---|
| `start_combat` | `combate_iniciado` | Pinta el punto de combate en el tablero (ya no hay "orden de turnos" que pintar — ver más abajo) |
| `resolve_attack` | `ataque_resuelto` | Actualiza HP en el panel de enemigos/jugador y muestra la tirada |
| `roll_dice` | `tirada_realizada` | Muestra el resultado en el panel de dados |
| `set_battle_map` | `mapa_aplicado` | BoardPanel pinta la imagen del mapa aplicado (al arrancar la partida o cuando la escena cambia de localización) |
| `clear_battle_map` | `mapa_limpiado` | BoardPanel vuelve a la cuadrícula plana de fallback — usado cuando la escena cambia de localización y ningún mapa del catálogo encaja todavía |
| `advance_to_player_round` | `ronda_reabierta` | ui-web/móvil reflejan que `roundPhase` volvió a "jugadores" y el candado de turno está libre |
| `end_player_turn` | `turno_jugador_cerrado` | El móvil deja de mostrar "Ya has actuado esta ronda" solo cuando esta tool se llamó de verdad — antes se liberaba el turno automáticamente al enviar cualquier mensaje (ver nota abajo) |
| `get_enemy_catalog` | *(sin evento)* | Solo contexto interno para el LLM, la UI no reacciona |
| `get_game_state` | *(sin evento)* | Igual, es una consulta de fundamentación |
| `grant_xp` | `xp_otorgada` | Notifica en la app móvil si el personaje puede subir de nivel |

## 5. Quién dispara `runDmTurn`

**Ya no hay iniciativa ni "siguiente turno" calculado por el backend.** Tras revisar el diseño con la experiencia real de partidas de mesa, se sustituyó por un modelo de rondas simple (`Game.roundPhase`/`turnClaim`/`actedThisRound`, ver `01-especificacion-funcional.md` y `02-modelo-datos-mongodb.md`):

- **Acción de un jugador en combate** → el jugador reclama el candado con "Mi turno" (`POST /games/:id/claim-turn`) y, cuando quiere actuar, escribe su acción (`POST /games/:id/player-action`). Ese endpoint es el que dispara `runDmTurn` — el DM-IA narra la acción de ESE jugador. **El candado ya NO se libera automáticamente al enviar el mensaje**: antes `SendPlayerActionUseCase` llamaba a `Game.releaseTurnAfterAction` incondicionalmente tras cada intercambio, lo que en partidas de 1 jugador lo bloqueaba para siempre en cuanto el DM-IA respondía con una simple pregunta aclaratoria ("¿la empuñas a una o dos manos?") sin haber resuelto nada todavía. Ahora es el propio DM-IA quien decide, llamando a la tool `end_player_turn(gameId, characterId)`, cuándo ha resuelto de verdad la acción de ese jugador — el candado se mantiene entre mensajes sucesivos del mismo jugador (puede responder preguntas de seguimiento) hasta que esa tool se llama. Solo cuando `roundPhase` pasa a "enemigos" (todos los jugadores vivos ya actuaron, vía `end_player_turn`) el DM-IA resuelve él mismo, en ese mismo turno, los ataques de los enemigos con `resolve_attack` y termina llamando a `advance_to_player_round`.
- **Mensaje del capitán fuera de combate** (HU2) → mismo endpoint `player-action`, pero solo lo puede llamar el jugador marcado como capitán (`Game.captainUserId`) — evita que varios jugadores narren a la vez cuando no hay pelea.
- No existe ya un "turno de enemigo" disparado por la API de forma independiente: todo el turno de los enemigos ocurre dentro de la misma llamada a `runDmTurn` que resolvió la acción del último jugador de la ronda.

## 6. Gestión del contexto — sin necesidad de RAG

El historial que se manda a DeepSeek en `messages` es solo la conversación narrativa reciente (acotada, como ya preveíamos para `narrativeLog` en el paso 2) — nunca el estado completo del juego. El estado real (HP, posiciones, inventario de conjuros) vive siempre en MongoDB y se recupera con `get_game_state`/`get_enemy_catalog` cuando hace falta. Esto evita dos problemas a la vez: contexto innecesariamente largo, y la posibilidad de que el modelo "recuerde mal" un HP que cambió hace varios turnos.

## 7. Testing del motor de IA

Un LLM no se testea como una función pura, pero sí se puede testear con rigor:

- **Tests de integración del bucle** (deterministas): sustituir la llamada real a DeepSeek por una respuesta grabada/mock con `tool_calls` fijos, y verificar que `dm-engine` llama al MCP correcto y traduce bien a eventos. Esto sí es TDD normal.
- **Evaluación del comportamiento del modelo** (no determinista): conjunto pequeño de "conversaciones doradas" (prompt + secuencia esperada de tools llamadas) que se ejecutan contra la API real de DeepSeek periódicamente, no en cada commit — para detectar si el modelo empieza a "inventar" datos en vez de llamar a las tools.
- **E2E completo** (Playwright, según vuestro material de curso): una partida jugada de principio a fin contra el entorno de staging, verificando que UI, API, MCP y DeepSeek encajan.

## 8. Definición de terminado de este paso

- `dm-engine` no importa nada de Mongoose ni de las entidades de dominio directamente — solo habla con el mundo a través del cliente MCP.
- El bucle tiene un límite máximo de iteraciones (evitar bucles infinitos de tool calls) con un log de aviso si se alcanza.
- Cada evento de la tabla del punto 4 tiene un test que verifica su forma exacta.

---

*Siguiente paso: `agents.md` + skills del repo — ahora que hay 5 piezas de arquitectura distintas (dominio, REST, MCP, motor IA con DeepSeek, y los esquemas de Mongo), es el momento de fijar las convenciones para que cualquier agente de codificación las respete.*
