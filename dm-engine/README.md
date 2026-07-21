# dm-engine — Motor IA del Dungeon Master

Orquesta al Dungeon Master IA (DeepSeek) sobre el servidor MCP de `API_REST TFM`: recibe el historial de chat de una partida, deja que el modelo llame a las tools MCP que necesite (tiradas, combate, mapas, catálogos...) y devuelve la narrativa final junto con los eventos de juego generados. Ver `docs/05-motor-ia-dm-deepseek.md` para el diseño original.

## Stack

- Node + TypeScript, servidor Express mínimo (`src/server.ts`)
- Cliente MCP propio (`src/mcp-tool-caller.ts`) contra el servidor MCP de `API_REST TFM`
- OpenAI SDK apuntando al endpoint de DeepSeek (`src/deepseek-chat-client.ts`)

## Inicio rápido

```bash
cp .env.example .env    # rellena DEEPSEEK_API_KEY y DEEPSEEK_MODEL (ver nota abajo)
npm install
npm test
npm run start            # http://localhost:4000
```

`MCP_SERVER_URL` debe apuntar al servidor MCP de `API_REST TFM` (por defecto `http://localhost:3000/mcp`), que tiene que estar arrancado antes de que `dm-engine` reciba turnos.

> **Verificar antes de desplegar:** el id de `DEEPSEEK_MODEL` cambia con frecuencia — comprobarlo en `api-docs.deepseek.com` en vez de asumir el valor de un ejemplo antiguo.

## El bucle de un turno (`runDmTurn`, `src/dm-turn.ts`)

1. Se construye el system prompt con el `gameId` de la partida (`dm-system-prompt.ts`) y se envía el historial al modelo junto con las tools MCP disponibles.
2. Mientras el modelo pida tool calls, se ejecutan contra el servidor MCP y su resultado se devuelve como mensaje `tool` — si una tool falla, el error se pasa al modelo en vez de reventar el turno completo.
3. Antes de aceptar la narrativa final, `protocolNudge()` comprueba tres cosas y fuerza **una única** ronda de corrección si detecta un hueco:
   - Se exploró el catálogo de mapas pero nunca se llamó a `set_battle_map`.
   - Se aplicó un mapa pero no se colocó a ningún participante con `place_participant`.
   - Se inició un combate (`start_combat`) pero no se colocó a **todos** los enemigos que devolvió (comparando instanceId por instanceId, no solo "algo se colocó").
4. `checkCombatStateNudge()` hace una comprobación aparte, con prioridad sobre `protocolNudge()`, apoyada en un `get_game_state` real (no en heurísticas de texto) cuando el turno llamó a `grant_xp` tras atacar a algún enemigo:
   - **Victoria prematura:** si algún enemigo atacado ese turno sigue con `currentHp` real > 0, fuerza la corrección para que el combate siga (nunca declarar muerto a un enemigo por impresión narrativa — "llevamos varios golpes", "suena a que ya debería estar muerto").
   - **Combate no cerrado:** si todos los enemigos del combate están a 0 HP real pero no se llamó a `end_combat`, fuerza la llamada — si no, el panel de "Combate" y los marcadores de enemigos derrotados se quedan en el tablero del jugador para siempre, aunque la narración ya haya pasado a otra escena.
5. Límite de `MAX_TOOL_CALL_ITERATIONS` (8) para que un modelo que no deje de pedir tools no cuelgue el turno indefinidamente.

## Limitaciones conocidas

El bucle anterior detecta huecos de protocolo verificables por código (tools que debían llamarse y no se llamaron) y, desde `checkCombatStateNudge()`, también contradicciones entre la narrativa y el HP real de los enemigos ya atacados o el cierre del combate — pero **sigue sin poder verificar cualquier otra afirmación en texto libre que no tenga ya un chequeo dedicado**. Dos casos concretos, mitigados solo por el system prompt (no por código) en `dm-system-prompt.ts`, sección "Reglas de combate y movimiento EN CURSO":

- El DM puede narrar que un enemigo golpea al jugador sin llamar a `resolve_attack` — si pasa, el HP que ve el jugador en la interfaz no se actualiza aunque el texto lo cuente.
- El DM puede narrar que un personaje se mueve/huye/se esconde sin volver a llamar a `place_participant` — si pasa, la posición que devuelve `get_game_state` no coincide con lo narrado. Esto incluye moverse a otra zona dentro del **mismo** mapa ya aplicado (no solo cambiar de mapa por completo): el `narrativeSuggestsLocationChange` actual solo detecta cambios de localización lo bastante explícitos como para disparar un mapa nuevo, no un simple cambio de sala/zona dentro de la escena ya montada.

Si estos síntomas reaparecen con frecuencia pese al refuerzo del system prompt, el siguiente paso sería una verificación más estricta (ej. comparar el texto de la narrativa contra los eventos generados y forzar una re-narración si hay contradicción), no cubierta todavía.

## Tests

`npm test` usa Jest. En algunos entornos sandbox `ts-jest` puede no resolverse correctamente aunque esté instalado — si eso ocurre, verificar manualmente con un script `ts-node` que reproduzca el escenario del test (patrón usado durante el desarrollo, ver historial de `dm-turn.spec.ts`).
