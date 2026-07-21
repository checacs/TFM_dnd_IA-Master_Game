import { ChatClient, ChatMessage, ToolCaller, ToolDefinition } from './ports';
import { toGameEvent, GameEvent } from './game-events';
import { buildDmSystemPrompt } from './dm-system-prompt';

/**
 * Límite máximo de vueltas del bucle de tool-calling. Sin esto, un fallo del
 * modelo (que no deje de pedir tools) lo dejaría llamando indefinidamente —
 * quedó anotado como pendiente desde el diseño del paso 5 y se resuelve aquí.
 */
const MAX_TOOL_CALL_ITERATIONS = 8;

export interface DmTurnResult {
  narrative: string;
  events: GameEvent[];
}

/**
 * Frases tipicas de "salir de un sitio" / "entrar, bajar, cruzar a otro" en
 * castellano. Se exige que aparezcan LAS DOS clases (una de salida Y una de
 * entrada/transito) para reducir falsos positivos: un simple "entras en la
 * sala del fondo" dentro de la misma mazmorra no debería disparar esto (ese
 * caso ya lo cubre la regla de place_participant), pero "sales de la taberna...
 * bajas... " sí es una transición de localización real. No es infalible (es
 * un heurístico de texto, no un análisis semántico), pero es un empujón
 * adicional barato para el caso que se detectó en partida real: el DM narraba
 * salir de una taberna y entrar en una cripta sin tocar ninguna tool de mapa,
 * y el tablero se quedaba con la imagen de la taberna.
 */
const LOCATION_EXIT_CUES = [/\bsales? de\b/i, /\babandonas\b/i, /\bdejas atr[aá]s\b/i, /\bte alejas de\b/i];
const LOCATION_ENTRY_CUES = [
  /\bentr[aá]is?\b/i, /\bdesciend[ea]s?\b/i, /\bacced[ea]s?\b/i, /\bte adentras\b/i,
  /\bcruzas\b/i, /\bllega[sn]?\b/i, /\bbaj[ao]s?\b/i, /\bsub[ei]s?\b/i,
];

function narrativeSuggestsLocationChange(text: string): boolean {
  const hasExit = LOCATION_EXIT_CUES.some((p) => p.test(text));
  const hasEntry = LOCATION_ENTRY_CUES.some((p) => p.test(text));
  return hasExit && hasEntry;
}

/**
 * El system prompt (dm-system-prompt.ts) le pide al modelo un protocolo de pasos
 * (describe_map -> set_battle_map -> place_participant) pero es solo texto: nada
 * en el código obligaba a cumplirlo. Se comprobó en producción que DeepSeek puede
 * explorar mapas con describe_map/get_battle_maps y narrar la escena como si
 * hubiera fijado el mapa sin haber llamado realmente a set_battle_map — el
 * tablero se quedaba sin imagen pese a que la narración sonaba coherente.
 * Esta función detecta ese hueco entre lo que se llamó y lo que el protocolo
 * exige, para dar al modelo un empujón correctivo antes de aceptar su respuesta.
 */
function protocolNudge(
    calledTools: Set<string>,
    events: GameEvent[],
    combatEnemyIds: Set<string>,
    placedParticipantIds: Set<string>,
    narrativeText: string,
): string | null {
  // Se comprobó en partida real que el DM narraba salir de una localización
  // (taberna) y entrar en otra (cripta) SIN LLAMAR A NINGUNA tool de mapa --
  // ni siquiera get_battle_maps/describe_map, así que el aviso de "aún no has
  // resuelto el mapa" (más abajo) no llegaba a dispararse porque ESE requiere
  // haber explorado el mapa primero. Este chequeo cubre justo el hueco previo:
  // "no tocaste el sistema de mapas para nada, pese a que tu propio texto
  // suena a que cambiaste de sitio".
  const touchedMapSystem =
      calledTools.has('get_battle_maps') || calledTools.has('describe_map') ||
      calledTools.has('set_battle_map') || calledTools.has('clear_battle_map') ||
      calledTools.has('start_combat');
  if (!touchedMapSystem && narrativeSuggestsLocationChange(narrativeText)) {
    return 'Tu narración de este turno suena a que el grupo ha cambiado de localización (salís de un sitio y ' +
        'entráis/bajáis/llegáis a otro), pero no has llamado a ninguna tool de mapa en este turno. Antes de dar ' +
        'la escena por buena: llama a get_battle_maps con etiquetas del sitio nuevo -- si hay un mapId que ' +
        'encaje, aplícalo con set_battle_map y coloca a los participantes con place_participant; si ninguno ' +
        'encaja, llama a clear_battle_map para no dejar en pantalla el mapa de la escena anterior.';
  }
  // exploredMap se mide por intento de llamada (describe_map/get_battle_maps no
  // generan evento, son de solo lectura) — resolvedMap/placedParticipant se miden
  // por evento realmente generado, no por el mero intento: si set_battle_map
  // falló (tool con error), no cuenta como "mapa resuelto" y no debe disparar
  // el siguiente aviso (colocar participantes) sobre un mapa que nunca se fijó.
  // resolvedMap acepta TANTO aplicar un mapa nuevo COMO limpiarlo explícitamente
  // (clear_battle_map, cuando no hay ninguno del catálogo que encaje) — las dos
  // son resoluciones válidas de "ya decidiste qué hacer con el mapa", solo la
  // colocación de participantes exige que haya un mapa real de por medio.
  const exploredMap = calledTools.has('get_battle_maps') || calledTools.has('describe_map');
  const mapApplied = events.some((e) => e.type === 'mapa_aplicado');
  const mapResolved = mapApplied || events.some((e) => e.type === 'mapa_limpiado');
  const placedParticipant = events.some((e) => e.type === 'participante_colocado');

  if (exploredMap && !mapResolved) {
    return 'Aún no has resuelto el mapa. Si encontraste uno que encaje, aplícalo con set_battle_map ' +
        '(gameId y mapId) y coloca a los participantes con place_participant; si ninguno encaja, llama a ' +
        'clear_battle_map para no dejar en pantalla el mapa de la escena anterior.';
  }
  if (mapApplied && !placedParticipant) {
    return 'Has aplicado un mapa con set_battle_map pero no has colocado a ningún participante. Llama a ' +
        'place_participant para cada jugador (y enemigo si hay combate) antes de narrar.';
  }

  // start_combat solo crea el registro del enemigo — el tablero no lo muestra
  // hasta que se llame a place_participant con SU instanceId concreto. Se
  // comprobó en producción que el DM colocaba al jugador pero olvidaba a uno o
  // varios enemigos (el mapa solo mostraba al jugador). A diferencia del aviso
  // de mapa (que solo comprueba "se colocó a alguien"), aquí se verifica
  // participante por participante usando los instanceId reales que devolvió
  // start_combat, no solo la presencia de algún evento de colocación.
  const missingEnemyPlacements = [...combatEnemyIds].filter((id) => !placedParticipantIds.has(id));
  if (missingEnemyPlacements.length > 0) {
    return 'Has iniciado un combate pero faltan enemigos por colocar en el tablero. Llama a ' +
        `place_participant para cada uno de estos instanceId antes de narrar: ${missingEnemyPlacements.join(', ')}.`;
  }

  // Igual que con la colocación de enemigos: se comprobó que el DM resolvía
  // los ataques de la fase de enemigos (resolve_attack) pero se olvidaba de
  // reabrir la ronda de jugadores — el móvil se quedaba sin poder reclamar
  // turno hasta el siguiente mensaje. Solo se dispara si YA resolvió al
  // menos un ataque en este turno (si no hubo fase de enemigos que resolver,
  // no tiene sentido pedirle que la cierre).
  const resolvedAnyAttack = events.some((e) => e.type === 'ataque_resuelto');
  const advancedRound = calledTools.has('advance_to_player_round');
  if (resolvedAnyAttack && !advancedRound) {
    return 'Has resuelto ataques de enemigos pero no has llamado a advance_to_player_round. ' +
        'Llámala ahora para reabrir la ronda de jugadores antes de terminar tu narración.';
  }

  return null;
}

export async function runDmTurn(
    chatClient: ChatClient,
    toolCaller: ToolCaller,
    messages: ChatMessage[],
    gameId: string,
): Promise<DmTurnResult> {
  const mcpTools = await toolCaller.listTools();
  const tools: ToolDefinition[] = mcpTools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));

  const events: GameEvent[] = [];
  const calledTools = new Set<string>();
  const placedParticipantIds = new Set<string>();
  const combatEnemyIds = new Set<string>();
  const systemPrompt = buildDmSystemPrompt(gameId);
  const withSystem = (): ChatMessage[] => [{ role: 'system', content: systemPrompt }, ...messages];

  let iterations = 0;
  let correctionUsed = false;
  let response = await chatClient.createCompletion({ messages: withSystem(), tools });

  for (;;) {
    if (response.message.tool_calls?.length) {
      iterations += 1;
      if (iterations > MAX_TOOL_CALL_ITERATIONS) {
        throw new Error(
            `Se superó el límite de ${MAX_TOOL_CALL_ITERATIONS} iteraciones de tool-calling en un mismo turno`,
        );
      }

      messages.push(response.message);

      for (const call of response.message.tool_calls) {
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>;

        if ('gameId' in args) {
          args['gameId'] = gameId;
        }

        calledTools.add(call.function.name);

        let result: unknown;
        try {
          result = await toolCaller.callTool(call.function.name, args);
        } catch (error) {
          // Sin este try/catch, cualquier tool que falle (mapId inválido, timeout
          // MCP, etc.) reventaba todo el turno con un 500 sin que el modelo se
          // enterase — ahora el error se le pasa como resultado de la tool para
          // que pueda reaccionar (reintentar, elegir otra cosa, o admitirlo).
          result = { error: true, message: error instanceof Error ? error.message : String(error) };
        }

        const failed = (result as { error?: boolean } | null)?.error === true;
        const event = failed ? null : toGameEvent(call.function.name, result);
        if (event) {
          events.push(event);
        }

        if (!failed) {
          if (call.function.name === 'place_participant' && typeof args['participantId'] === 'string') {
            placedParticipantIds.add(args['participantId'] as string);
          }
          if (call.function.name === 'start_combat') {
            const enemies = (result as { enemies?: Array<{ instanceId?: unknown }> } | null)?.enemies ?? [];
            for (const enemy of enemies) {
              if (typeof enemy.instanceId === 'string') {
                combatEnemyIds.add(enemy.instanceId);
              }
            }
          }
        }

        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }

      response = await chatClient.createCompletion({ messages: withSystem(), tools });
      continue;
    }

    if (!correctionUsed) {
      const nudge = protocolNudge(calledTools, events, combatEnemyIds, placedParticipantIds, response.message.content ?? '');
      if (nudge) {
        correctionUsed = true;
        console.log(`[dm-engine] Aviso correctivo de protocolo: ${nudge}`);
        messages.push(response.message);
        messages.push({ role: 'user', content: nudge });
        response = await chatClient.createCompletion({ messages: withSystem(), tools });
        continue;
      }
    }

    break;
  }

  console.log(
      `[dm-engine] Turno terminado. Tools llamadas: [${[...calledTools].join(', ') || 'ninguna'}] — ` +
      `Eventos: [${events.map((e) => e.type).join(', ') || 'ninguno'}]`,
  );

  return { narrative: response.message.content ?? '', events };
}
