import { ChatClient, ChatCompletionResult, ChatMessage, ToolCaller, ToolDefinition } from './ports';
import { toGameEvent, GameEvent } from './game-events';
import { buildDmSystemPrompt } from './dm-system-prompt';

/**
 * Se detectó en partida real que un fallo transitorio de DeepSeek (rate-limit,
 * blip de red -- DeepSeekChatClient usa maxRetries: 0 a propósito, ver su
 * comentario) durante la PRIMERA llamada de un turno -- antes de que se
 * llamara a ninguna tool -- se convertía en un 500 genérico indistinguible de
 * "dm-engine ya mutó la partida antes de fallar". HttpDmEngineClient (lado
 * API) nunca reintenta un 500 por diseño, precisamente para no arriesgarse a
 * duplicar una mutación real -- pero si NINGUNA tool llegó a llamarse todavía,
 * no hay nada que duplicar, y negarse a reintentar solo obliga al jugador a
 * reescribir su mensaje a mano. Esta clase marca justo ese caso seguro.
 */
export class NoMutationYetError extends Error {
  constructor(public readonly cause: Error) {
    super(cause.message);
  }
}

/**
 * Límite máximo de vueltas del bucle de tool-calling. Sin esto, un fallo del
 * modelo (que no deje de pedir tools) lo dejaría llamando indefinidamente —
 * quedó anotado como pendiente desde el diseño del paso 5 y se resuelve aquí.
 */
const MAX_TOOL_CALL_ITERATIONS = 8;

/**
 * Límite de avisos correctivos por turno. Antes era un booleano de un solo
 * uso (correctionUsed): en cuanto se disparaba UN aviso, ningún otro podía
 * dispararse en ese turno, ni siquiera el MISMO otra vez. Se comprobó en
 * partida real que el modelo, tras recibir la nota de corrección, a veces
 * "arregla" solo el TEXTO de la narración (deja de sonar mal) pero sigue sin
 * llamar a la tool real que la corrección le pedía -- con un único intento,
 * esa respuesta a medio corregir se aceptaba tal cual. Permitir un segundo
 * intento le da al modelo una vuelta más para completar la corrección de
 * verdad (llamar a la tool, no solo mejorar el texto) antes de rendirse y
 * aceptar la respuesta. No se sube más para no disparar la latencia del
 * turno sin límite si el modelo insiste en no corregir.
 */
const MAX_CORRECTION_ATTEMPTS = 2;

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
// Cobertura amplia de conjugaciones (2a persona singular/plural, 1a plural,
// 3a singular/plural, gerundio) para cada verbo -- las listas anteriores solo
// cubrian un puñado de formas sueltas (ej. /\bentr[aá]is?\b/i SOLO reconocia
// "entrais"/"entráis", ni siquiera "entra" o "entras"; a "entramos" -- la
// forma mas natural con la que un DM narra un grupo entero moviendose junto,
// "Entramos en la sala de armas" -- le faltaba por completo). Se detecto en
// partida real que un cambio de localizacion narrado con "entramos" no
// disparaba este chequeo y el tablero se quedaba con el mapa anterior.
const LOCATION_EXIT_CUES = [
  /\bsal(e|es|imos|[ií]s|en|iendo)\s+de\b/i,
  /\babandon(a|as|amos|[aá]is|an|ando)\b/i,
  /\bdej(a|as|amos|[aá]is|an|ando)\s+atr[aá]s\b/i,
  /\b(te|nos|se)?\s*alej(a|as|amos|[aá]is|an|ando)\s+de\b/i,
];
const LOCATION_ENTRY_CUES = [
  /\bentr(a|as|amos|[aá]is|an|ando)\b/i,
  /\b(descend(emos|[eé]is|iendo)|desciend(e|es|en))\b/i,
  /\bacced(e|es|emos|[eé]is|en|iendo)\b/i,
  /\b(te|nos|se)?\s*adentr(a|as|amos|[aá]is|an|ando)\b/i,
  /\bcruz(a|as|amos|[aá]is|an|ando)\b/i,
  /\blleg(a|as|amos|[aá]is|an|ando)\b/i,
  /\bbaj(a|as|amos|[aá]is|an|ando)\b/i,
  /\bsub(e|es|imos|[ií]s|en|iendo)\b/i,
];

/**
 * El arranque fijo de partida (dm-system-prompt.ts, "Cuando arranca la
 * partida") tiene un punto muy concreto donde el chequeo genérico de arriba
 * NO basta: el turno en el que el jugador elige taberna o tablón de anuncios
 * no siempre trae un verbo de salida (el grupo ya estaba de pie en la calle,
 * no "sale" de ningún sitio con nombre) ni uno de entrada reconocible --
 * "os acercáis al tablón..." no matchea ningún LOCATION_ENTRY_CUES. Se
 * comprobó en partida real que el DM describió el tablón de anuncios sin
 * llamar a ninguna tool de mapa, y el chequeo de arriba no lo detectó porque
 * exige AMBAS señales. Aquí no hace falta un verbo: basta con que aparezca
 * el nombre de uno de los dos destinos del arranque. Se limita a los
 * primeros mensajes de la partida (VILLAGE_START_MAX_MESSAGES) para no
 * disparar falsos positivos más adelante, si "la taberna" se menciona de
 * pasada como recuerdo en una escena ya resuelta.
 *
 * Dos ajustes tras un segundo reporte real con el mismo bug:
 * 1) El regex del tablón exigía la frase completa "tablón de anuncios",
 *    pero una vez establecida la escena el DM ya solo dice "el tablón" a
 *    secas ("San se acerca al tablón y pasa la mirada por los pergaminos")
 *    -- no matcheaba nada. Ahora basta con la palabra "tablón" sola.
 * 2) VILLAGE_START_MAX_MESSAGES era demasiado bajo (4): la negociación real
 *    del arranque (elegir taberna/tablón, leer contratos, decidir cuál)
 *    dura fácilmente 3-4 turnos de ida y vuelta, y a partir del segundo
 *    turno el umbral ya se había superado y el chequeo dejaba de aplicar
 *    justo cuando aún hacía falta.
 *
 * Un tercer ajuste, encontrado al escribir el test de gameStartNudge (más
 * abajo): el PROPIO turno 1 (el mensaje sintético de arranque, messageCount
 * === 1) menciona LEGÍTIMAMENTE tanto "taberna" como "tablón" en su
 * narración -- el paso 1 del arranque exige ofrecer la elección entre AMBOS
 * destinos sin llamar a ninguna tool de mapa todavía (eso llega en el turno
 * siguiente, cuando el jugador responda). Sin excluir messageCount === 1,
 * este chequeo forzaría al DM a aplicar un mapa al azar (sin saber aún qué
 * eligió el jugador) justo en el turno donde debe limitarse a preguntar.
 */
const VILLAGE_START_MAX_MESSAGES = 10;
const VILLAGE_DESTINATION_CUES = [/\btabl[oó]n\b/i, /\btaberna\b/i, /\banuncios?\b/i];

/**
 * Se detectó en partida real un bug distinto de todos los anteriores, y más
 * sutil: el jugador respondía con una elección de arranque perfectamente
 * clara ("tablón", "vamos al tablón de anuncios", "taberna", "ir a la
 * taberna"...) y el DM SÍ llamaba a set_battle_map -- pero con el mapId
 * EQUIVOCADO (aplicaba "tabernaMercenarios" cuando el jugador había pedido el
 * tablón, o viceversa). protocolNudge/playerRequestedMapNudge no lo detectan
 * porque ambos solo comprueban "¿se tocó ALGUNA tool de mapa?", nunca "¿es la
 * tool CORRECTA para lo que pidió el jugador?". Esta comprobación es
 * determinista en ambos sentidos: qué destino pidió el jugador (por palabras
 * clave en su último mensaje) y qué mapId se aplicó de verdad este turno (leído
 * del propio argumento de la llamada a set_battle_map, ver appliedMapId más
 * abajo) -- si no coinciden, se fuerza la corrección antes de aceptar el turno.
 * Igual que el resto de comprobaciones de arranque, se limita a los primeros
 * mensajes de la partida (VILLAGE_START_MAX_MESSAGES) para no disparar falsos
 * positivos si "la taberna" se menciona de pasada mucho más adelante en la
 * campaña, cuando ya no hay ninguna elección de arranque en juego.
 */
const TABLON_DESTINATION_CUES = [/\btabl[oó]n(es)?\b/i, /\banuncios?\b/i];
const TABERNA_DESTINATION_CUES = [/\btaberna\b/i];

/** Detecta, por el texto del jugador, cuál de los dos destinos de arranque eligió (o null si ninguno). */
function detectVillageStartChoice(lastPlayerMessage: string): 'tablonAnuncios' | 'tabernaMercenarios' | null {
  if (TABLON_DESTINATION_CUES.some((cue) => cue.test(lastPlayerMessage))) {
    return 'tablonAnuncios';
  }
  if (TABERNA_DESTINATION_CUES.some((cue) => cue.test(lastPlayerMessage))) {
    return 'tabernaMercenarios';
  }
  return null;
}

function villageDestinationMismatchNudge(
    lastPlayerMessage: string,
    appliedMapId: string | null,
    messageCount: number,
): string | null {
  if (messageCount <= 1 || messageCount > VILLAGE_START_MAX_MESSAGES || appliedMapId === null) {
    return null;
  }
  const expectedMapId = detectVillageStartChoice(lastPlayerMessage);
  if (!expectedMapId || appliedMapId === expectedMapId) {
    return null;
  }
  const destinationLabel = expectedMapId === 'tablonAnuncios' ? 'el tablón de anuncios' : 'la taberna';
  return `El jugador ha elegido con claridad ${destinationLabel} en su último mensaje, pero has aplicado con ` +
      `set_battle_map el mapId "${appliedMapId}", que no corresponde a esa elección. Vuelve a llamar a ` +
      `set_battle_map con el mapId correcto ("${expectedMapId}") y ajusta tu narración para describir el ` +
      'destino que el jugador realmente pidió, no otro distinto.';
}

/**
 * Seguro determinista de última instancia (a petición del usuario, tras dos
 * bugs reales seguidos con el mismo patrón): a veces el modelo ignora los
 * avisos correctivos de arranque incluso agotando el presupuesto entero de
 * MAX_TOTAL_CORRECTIONS -- se comprobó en partida real que, pese a DOS avisos
 * idénticos pidiendo aplicar el mapa, el modelo simplemente inventó una
 * aventura completa (arrancar un contrato, viajar a una mina) sin llamar a
 * NINGUNA tool de mapa en todo el turno. Confiar en que el LLM "por fin
 * obedezca" no es una garantía real -- el usuario pidió explícitamente un
 * "seguro" para que esto no pueda pasar de largo.
 *
 * Esta función se llama SIEMPRE al final de runDmTurn (haya habido avisos o
 * no) y comprueba, por código, si el jugador eligió con claridad un destino
 * de arranque y el mapa aplicado de verdad (appliedMapId) no coincide. Si es
 * así, en vez de confiar en un enésimo aviso al modelo, aplica el mapa
 * correcto DIRECTAMENTE vía tool-calling determinista (sin pasar por el LLM),
 * coloca a los jugadores reales de la partida en la primera zona del mapa
 * (solo si tiene zonas -- tablonAnuncios no lleva, a propósito), y sustituye
 * la narrativa de ese turno por una descripción fija y coherente con el mapa
 * que de verdad se aplicó -- así el tablero y la narración nunca pueden
 * quedar desincronizados, pase lo que pase con el modelo.
 */
async function resolveVillageStartFallback(
    toolCaller: ToolCaller,
    gameId: string,
    lastPlayerMessage: string,
    appliedMapId: string | null,
    messageCount: number,
    events: GameEvent[],
): Promise<string | null> {
  if (messageCount <= 1 || messageCount > VILLAGE_START_MAX_MESSAGES) {
    return null;
  }
  const expectedMapId = detectVillageStartChoice(lastPlayerMessage);
  if (!expectedMapId || appliedMapId === expectedMapId) {
    return null;
  }

  let describeResult: unknown = null;
  try {
    describeResult = await toolCaller.callTool('describe_map', { gameId, mapId: expectedMapId });
  } catch {
    // No crítico -- solo se usa para saber si hay zonas donde colocar jugadores.
  }

  try {
    const setResult = await toolCaller.callTool('set_battle_map', { gameId, mapId: expectedMapId });
    const event = toGameEvent('set_battle_map', setResult);
    if (event) {
      events.push(event);
    }
  } catch (error) {
    // Si ni siquiera el propio código puede aplicar el mapa, no hay nada más
    // que forzar -- se deja la narrativa original del modelo tal cual, pero
    // SIEMPRE dejando rastro en el log (antes este catch era silencioso y en
    // producción ocultó que el seguro lo había intentado y había fallado por
    // el deadlock del candado de la API -- ver game-lock/mcp.server.ts).
    console.error(
        `[dm-engine] Seguro de arranque: set_battle_map("${expectedMapId}") falló también desde el propio ` +
        `código -- ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }

  type ZoneCell = { rowStart?: unknown; rowEnd?: unknown; colStart?: unknown; colEnd?: unknown };
  type Zone = { name?: unknown; cells?: ZoneCell[] };
  const zones = (describeResult as { zones?: Zone[] } | null)?.zones ?? [];
  const firstZone = zones[0];
  const firstCell = firstZone?.cells?.[0];
  if (firstZone && typeof firstZone.name === 'string' && firstCell) {
    const row = Math.floor(((Number(firstCell.rowStart) || 0) + (Number(firstCell.rowEnd) || 0)) / 2);
    const col = Math.floor(((Number(firstCell.colStart) || 0) + (Number(firstCell.colEnd) || 0)) / 2);
    try {
      const state = await toolCaller.callTool('get_game_state', { gameId });
      const players = (state as { players?: Array<{ characterId?: unknown }> } | null)?.players ?? [];
      for (const player of players) {
        if (typeof player.characterId !== 'string') {
          continue;
        }
        try {
          const placeResult = await toolCaller.callTool('place_participant', {
            gameId, participantId: player.characterId, row, col, zoneName: firstZone.name,
          });
          const event = toGameEvent('place_participant', placeResult);
          if (event) {
            events.push(event);
          }
        } catch {
          // Best-effort por jugador -- si uno falla, seguimos con el resto.
        }
      }
    } catch {
      // Si get_game_state falla, al menos el mapa ya quedó aplicado bien.
    }
  }

  // El texto del tablón LISTA contratos concretos a propósito (ligados a
  // mapas reales del catálogo: pantano-rey, molino-piso1/2/3, sotanoTaberna)
  // -- la primera versión solo decía "varios pergaminos... ¿cuál os
  // interesa?" sin enumerar ninguno, y en partida real el siguiente turno
  // del modelo, sin ninguna lista establecida en el historial, respondió
  // suplantando al jugador ("San: Me interesa lo del pantano...") en vez de
  // describir los trabajos. Con la lista ya establecida aquí, el modelo
  // tiene material concreto sobre el que continuar como DM.
  return expectedMapId === 'tablonAnuncios'
      ? 'Os acercáis al tablón de anuncios. Entre los pergaminos clavados destacan tres contratos del gremio: ' +
          '**"La bestia del pantano"** (un monstruo acecha en las ciénagas del este y el gremio paga bien por su ' +
          'cabeza), **"El molino silencioso"** (el viejo molino de las afueras lleva días parado y nadie sabe ' +
          'nada de sus molineros), y **"Ruidos en el sótano"** (el tabernero jura que algo se mueve de noche ' +
          'bajo su taberna). ¿Cuál de los tres contratos os interesa?'
      : 'Entráis en la taberna. El calor del fuego y el bullicio de las conversaciones os envuelven nada más ' +
          'cruzar la puerta. ¿Qué hacéis?';
}

function narrativeSuggestsLocationChange(text: string): boolean {
  const hasExit = LOCATION_EXIT_CUES.some((p) => p.test(text));
  const hasEntry = LOCATION_ENTRY_CUES.some((p) => p.test(text));
  return hasExit && hasEntry;
}

/**
 * Se detectó en partida real un fallo mucho más grave que los de mapa: el
 * jugador escribió "Atacar" y, en los turnos siguientes ("Ataco yo primero",
 * "Lanza misil magico"), el DM narró un combate ENTERO -- tres goblins
 * atacados, uno muerto por misiles mágicos, otro rematado por el guerrero,
 * el tercero también abatido -- sin haber llamado NUNCA a start_combat,
 * resolve_attack ni cast_spell. Como no existía ningún activeEncounter, el
 * móvil nunca pudo mostrar "Mi turno"/"Tirar Dados" ni el tablero pintar a
 * los enemigos: el DM resolvió todo el combate como texto libre, ignorando
 * por completo el proceso de dos turnos con dados reales de la sección
 * "Reglas de combate y movimiento EN CURSO". checkCombatStateNudge no lo
 * detecta porque exige que se haya llamado a grant_xp -- aquí no se llamó a
 * NINGUNA tool en absoluto. Este chequeo cubre justo ese hueco: si la
 * narración da por muerto/derrotado a alguien pero no hubo ninguna tool de
 * combate real este turno, se fuerza la corrección.
 */
const ENEMY_DEFEAT_CUES = [
  /\bcae\b[^.]{0,40}\b(muert[oa]|inerte|sin vida)\b/i,
  /\bqueda\s+inerte\b/i,
  /\bse derrumba\b[^.]{0,40}\b(sin vida|inerte|muert[oa])\b/i,
  /\bfallece\b/i,
  /\bmuere\b/i,
  /\b(lo|la|le)\s+(remata|abate)\b/i,
];

function narrativeSuggestsEnemyDefeated(text: string): boolean {
  return ENEMY_DEFEAT_CUES.some((p) => p.test(text));
}

/**
 * Se detectó en partida real un fallo nuevo y distinto de todos los
 * anteriores: el jugador (San) preguntó "Dime qué trabajos hay" delante del
 * tablón de anuncios, y el DM respondió literalmente "San: Me interesa lo
 * del pantano, cazar al monstruo" -- es decir, respondió HACIÉNDOSE PASAR
 * por el personaje del jugador y tomando la decisión por él, en vez de
 * responder como DM describiendo los trabajos. Causa probable: los mensajes
 * de los jugadores llegan al modelo con el prefijo "**Nombre:** texto" (ver
 * SendPlayerActionUseCase), y el modelo a veces imita ese patrón y continúa
 * el diálogo con la voz del jugador en vez de con la suya de narrador.
 * gameStartNudge solo cubre la primera persona en el turno 1; este chequeo
 * cubre CUALQUIER turno, y es determinista: extrae los nombres reales de los
 * jugadores de los prefijos "**Nombre:**" del historial y comprueba si la
 * respuesta del DM empieza suplantando a alguno de ellos.
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function playerNamesFromHistory(messages: ChatMessage[]): string[] {
  const names = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'user' || typeof message.content !== 'string') {
      continue;
    }
    const match = message.content.match(/^\*\*([^*:]{1,40}):\*\*/);
    if (match) {
      names.add(match[1].trim());
    }
  }
  return [...names];
}

function playerImpersonationNudge(messages: ChatMessage[], narrativeText: string): string | null {
  for (const name of playerNamesFromHistory(messages)) {
    const impersonation = new RegExp(`^\\s*(\\*\\*)?${escapeRegExp(name)}(\\*\\*)?\\s*:`, 'i');
    if (impersonation.test(narrativeText)) {
      return `Tu respuesta empieza hablando en nombre del personaje jugador "${name}" (como si tú fueras él y ` +
          'estuvieras decidiendo o hablando por él). Eso NUNCA está permitido: los personajes jugadores solo ' +
          'hablan a través de los mensajes reales de sus jugadores, y las decisiones son siempre suyas. ' +
          'Reescribe tu respuesta como DM: responde a lo que el jugador te ha preguntado (por ejemplo, si pide ' +
          'ver los trabajos del tablón, descríbele los contratos disponibles uno a uno), narra en segunda/tercera ' +
          'persona dirigiéndote al grupo, y termina preguntándoles qué deciden hacer -- sin decidir tú por ellos.';
    }
  }
  return null;
}

/**
 * Se detectó en partida real un bug grave y distinto de todos los anteriores:
 * el DM narró un Cocodrilo Gigante (singular) en el Túmulo del Héroe Caído,
 * pero al decir "nos preparamos para luchar" el tablero cambió de golpe al
 * mapa "Cripta de los Ecos" con DOS cocodrilos normales. Causa raíz: un turno
 * anterior (probablemente duplicado por un reintento de red que no cancela el
 * trabajo del servidor -- ver el candado por partida en server.ts) había
 * dejado un activeEncounter huérfano, nunca mostrado al jugador. Cuando el DM
 * intentó start_combat para el enemigo real, Game.startEncounter() lo
 * rechazó con 'Ya hay un combate activo' -- y en vez de tratar eso como una
 * anomalía, el modelo improvisó una narración para encajar los enemigos
 * viejos con la escena nueva, mintiendo al jugador sobre cuántos enemigos
 * hay. Esta señal es 100% determinista (el propio mensaje de error de la
 * tool, no un heurístico de texto): si start_combat falla por este motivo
 * exacto, se fuerza a cerrar el combate huérfano con end_combat y arrancar
 * uno nuevo de verdad con los enemigos que el DM mismo acaba de narrar.
 */
function staleEncounterConflictNudge(failedStartCombatMessage: string | null): string | null {
  if (!failedStartCombatMessage || !/ya hay un combate activo/i.test(failedStartCombatMessage)) {
    return null;
  }
  return 'Has intentado iniciar un combate nuevo con start_combat, pero el sistema responde que YA HAY UN ' +
      'COMBATE ACTIVO con otros enemigos -- casi seguro un encuentro huérfano de un turno anterior que nunca se ' +
      'cerró, no algo que tú hayas narrado. NUNCA improvises una narración para encajar esos enemigos viejos (ni ' +
      'su número, ni su tipo, ni el mapa) con lo que acabas de describir: eso le muestra al jugador enemigos ' +
      'distintos a los que le narraste, y es un engaño grave que rompe su confianza en la partida. Llama primero ' +
      'a end_combat para cerrar ese combate huérfano, y LUEGO a start_combat otra vez con los enemigos reales que ' +
      'tu propia narración acaba de presentar -- nunca falsees el número de enemigos.';
}

/**
 * Se detectó en partida real un bug grave y muy distinto de todos los
 * anteriores: el jugador escribió "Vamos al tablon" (una elección de
 * arranque perfectamente clara) y el DM respondió "Veo que el sistema de
 * mapas está teniendo problemas momentáneos, pero no importa -- sigamos con
 * la narración mientras tanto" -- y a continuación narró una escena TOTALMENTE
 * distinta e inconexa (un molino abandonado con un tal "Héctor" dentro, que no
 * tenía nada que ver con la taberna ni el tablón de anuncios de la partida en
 * curso). La causa más probable: el modelo llamó a una tool de mapas
 * (set_battle_map, describe_map, get_battle_maps o clear_battle_map), esa
 * llamada falló de verdad (mapId inválido, error de la tool, etc.), y en vez
 * de corregir el error o simplemente seguir la escena sin tocar el mapa, el
 * modelo inventó una excusa técnica Y ADEMÁS se inventó contenido narrativo
 * completamente ajeno a la partida -- probablemente relleno improvisado del
 * propio modelo al quedarse "perdido" tras el error. Ninguno de los nudges
 * anteriores cubre este hueco concreto: protocolNudge solo revisa si se
 * TOCÓ alguna tool de mapa (aquí sí se tocó, solo que falló) y
 * villageDestinationMismatchNudge solo compara mapIds cuando la llamada tuvo
 * ÉXITO (appliedMapId solo se fija tras un set_battle_map que no falló). Esta
 * señal es 100% determinista (el propio mensaje de error de la tool, no un
 * heurístico de texto): si CUALQUIER tool de mapas falló este turno, se
 * fuerza a corregir el error de verdad (nunca inventar una excusa ni cambiar
 * de escena) antes de aceptar la respuesta.
 */
const MAP_TOOLS = ['get_battle_maps', 'describe_map', 'set_battle_map', 'clear_battle_map'];

function mapToolFailedNudge(failedMapToolCall: { name: string; message: string } | null): string | null {
  if (!failedMapToolCall) {
    return null;
  }
  return `Has llamado a la tool de mapas "${failedMapToolCall.name}" y ha fallado de verdad, con este error: ` +
      `"${failedMapToolCall.message}". NUNCA inventes una excusa técnica genérica (como "el sistema de mapas ` +
      'tiene problemas momentáneos") ni, mucho menos, cambies de escena para narrar contenido inconexo con lo que ' +
      'estaba pasando (eso confunde gravemente al jugador con una historia que no tiene nada que ver con la ' +
      'partida real). Corrige el error de verdad en este mismo turno: revisa el mapId y los argumentos que ' +
      'usaste (llama a get_battle_maps si necesitas encontrar uno válido) y vuelve a intentar la tool correcta -- ' +
      'manteniéndote en la escena y la decisión que el jugador acaba de tomar, sin inventar ningún desvío.';
}

/** Tools que, si se llamó a alguna, indican que este turno SÍ tocó el sistema de combate real. */
const COMBAT_MECHANIC_TOOLS = ['start_combat', 'resolve_attack', 'cast_spell', 'grant_xp', 'end_combat'];

function combatWithoutToolsNudge(calledTools: Set<string>, narrativeText: string): string | null {
  const usedCombatTools = COMBAT_MECHANIC_TOOLS.some((t) => calledTools.has(t));
  if (usedCombatTools || !narrativeSuggestsEnemyDefeated(narrativeText)) {
    return null;
  }
  return 'Tu narración de este turno da por muerto o derrotado a alguien, pero no has llamado a start_combat, ' +
      'resolve_attack ni cast_spell en NINGÚN momento de este turno -- eso significa que ningún ataque se ha ' +
      'resuelto de verdad, ninguna tirada real ha ocurrido, y ningún combate se ha registrado en el sistema (el ' +
      'móvil no puede mostrar "Mi turno"/"Tirar Dados" ni el tablero pintar a los enemigos si nunca llamaste a ' +
      'start_combat). Corrige tu narración: si esto es el inicio de una pelea, llama primero a start_combat con ' +
      'los enemigos reales de get_enemy_catalog; si un jugador ataca, sigue el proceso de DOS TURNOS (invita a ' +
      '"Tirar Dados" primero, no resuelvas nada hasta leer su tirada real en el chat) y llama a resolve_attack o ' +
      'cast_spell para aplicar el resultado real antes de narrar impactos, heridas o muertes. Nunca resuelvas un ' +
      'combate completo solo con texto libre, por muy claro que parezca el desenlace.';
}

/**
 * Se detectó en partida real un fallo en el PRIMERÍSIMO turno de una partida
 * nueva: el mensaje que dispara el arranque ("La partida ha comenzado.
 * Describe la escena inicial.", enviado por la UI con role:'user' -- ver
 * GameScreen.tsx, es un aviso sintético, NUNCA algo que un jugador haya
 * escrito de verdad) fue tratado como si fuera una decisión real de un
 * jugador, y el DM respondió: "¡Bien! Me acerco al tablón de anuncios. Vamos
 * a ver que hay." Eso viola el paso 1 del arranque en dos frentes a la vez:
 * (a) decidió el destino POR los jugadores en vez de ofrecerles la elección
 * explícita entre taberna y tablón, y (b) habló en PRIMERA PERSONA ("me
 * acerco") como si el propio DM (o un PNJ suelto) fuera quien actúa, en vez
 * de narrar en segunda/tercera persona dirigiéndose al grupo de jugadores.
 * El turno 1 de CUALQUIER partida nueva es siempre exactamente este mismo
 * mensaje sintético (se puede reconocer con total fiabilidad: es el único
 * mensaje del historial, messageCount === 1, no hay ninguna respuesta previa
 * de ningún jugador todavía) -- por eso esta señal es determinista, a
 * diferencia de narrativeSuggestsLocationChange.
 */
function gameStartNudge(messageCount: number, narrativeText: string): string | null {
  if (messageCount !== 1) {
    return null;
  }
  const firstPersonCues = /\b(me acerco|me dirijo|voy a|vamos a ver|entro en|me adentro)\b/i.test(narrativeText);
  const mentionsTaberna = /\btaberna\b/i.test(narrativeText);
  const mentionsTablon = /\btabl[oó]n\b/i.test(narrativeText);
  if (!firstPersonCues && mentionsTaberna && mentionsTablon) {
    return null;
  }
  return 'Este es el primerísimo turno de la partida: el mensaje que lo disparó es un aviso interno del ' +
      'sistema para que arranques la escena, NO una decisión real de ningún jugador todavía -- ningún jugador ha ' +
      'escrito nada aún. Sigue el paso 1 del arranque tal cual: describe brevemente el pueblo (2-3 frases), narra ' +
      'SIEMPRE en segunda/tercera persona dirigiéndote al grupo (nunca en primera persona como si tú mismo o un ' +
      'PNJ fuerais quien actúa -- nada de "me acerco", "voy a", "entro en"), y ofrece EXPLÍCITAMENTE la elección ' +
      'entre entrar en la taberna o acercarse al tablón de anuncios, terminando con una pregunta directa. NO ' +
      'decidas tú el destino ni actúes como si el grupo ya hubiera elegido -- espera su respuesta real antes de ' +
      'aplicar ningún mapa.';
}

/**
 * Se detectó en partida real un bug distinto de todos los anteriores: el
 * jugador escribió explícitamente "Muéstranos el mapa" y el DM respondió
 * "Veo que el mapa ya está mostrándose en el tablero", inventando posiciones
 * de zonas sin haber llamado NUNCA a describe_map/set_battle_map en ese
 * turno ni en ninguno anterior ya aplicado a la escena actual (el tablero
 * seguía mostrando el mapa de una escena previa -- la taberna -- mientras la
 * narración ya estaba en un molino varios turnos más adelante). A diferencia
 * de narrativeSuggestsLocationChange (que analiza la NARRACIÓN del propio DM
 * en busca de verbos de movimiento), este chequeo mira el ÚLTIMO MENSAJE DEL
 * JUGADOR -- si pide explícitamente ver el mapa y este turno no tocó ninguna
 * tool de mapa, es una señal mucho más fiable que cualquier heurístico sobre
 * el texto del DM, y por eso NO se limita a los primeros mensajes de partida
 * (VILLAGE_START_MAX_MESSAGES): un jugador puede pedir ver el mapa en
 * cualquier punto de la campaña.
 */
const PLAYER_MAP_REQUEST_CUES = [
  /mu[eé]stra(nos)?\s+el\s+mapa/i,
  /ense[ñn]a(nos)?\s+el\s+mapa/i,
  /(no\s+(vemos|se\s+ve|est[aá]\s+saliendo)|d[oó]nde\s+est[aá])\s+el\s+mapa/i,
  /queremos\s+ver\s+el\s+mapa/i,
  /actualiza(nos)?\s+el\s+mapa/i,
  /el\s+mapa\s+(no\s+(ha\s+)?cambia(do)?|sigue\s+igual|est[aá]\s+mal)/i,
  // Ampliado tras un bug real: el jugador no siempre dice "el mapa" a secas
  // -- a veces nombra el sitio concreto que no ve ("no vemos el tablón de
  // anuncios", "no vemos la taberna"). Mismo patrón "no vemos / dónde está"
  // que las líneas de arriba, pero con el nombre del lugar en vez de "mapa".
  /(no\s+(vemos|se\s+ve)|d[oó]nde\s+est[aá])\s+(el\s+tabl[oó]n|la\s+taberna|el\s+escenario|la\s+imagen)/i,
];

function lastPlayerMessageText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const content = messages[i].content;
      return typeof content === 'string' ? content : '';
    }
  }
  return '';
}

function playerRequestedMapNudge(calledTools: Set<string>, lastPlayerMessage: string): string | null {
  const touchedMapSystem =
      calledTools.has('get_battle_maps') || calledTools.has('describe_map') ||
      calledTools.has('set_battle_map') || calledTools.has('clear_battle_map');
  if (touchedMapSystem || !PLAYER_MAP_REQUEST_CUES.some((cue) => cue.test(lastPlayerMessage))) {
    return null;
  }
  return 'El jugador te ha pedido explícitamente ver el mapa (o te dice que no lo ve, o que no ha cambiado), ' +
      'pero no has llamado a NINGUNA tool de mapa en este turno. NUNCA respondas que "el mapa ya se está ' +
      'mostrando" o similar si no acabas de comprobarlo con una tool real: llama a get_battle_maps/describe_map ' +
      'para encontrar el mapa que corresponde a la escena actual y luego a set_battle_map (y place_participant ' +
      'para recolocar a los jugadores) antes de responderle -- si de verdad ningún mapa del catálogo encaja, ' +
      'llama a clear_battle_map y dilo con sinceridad, pero nunca afirmes que ya está resuelto sin haberlo hecho.';
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
async function protocolNudge(
    toolCaller: ToolCaller,
    gameId: string,
    calledTools: Set<string>,
    events: GameEvent[],
    combatEnemyIds: Set<string>,
    placedParticipantIds: Set<string>,
    narrativeText: string,
    messageCount: number,
    appliedMapId: string | null,
    lastPlayerMessage: string,
): Promise<string | null> {
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
  // Se comprobó en partida real un bug distinto: el jugador escribió "Vamos
  // al tablón de anuncios" y el DM respondió "El de la cueva suena bien...
  // vamos a investigar eso" -- una narración que NO menciona ni "tablón" ni
  // "taberna" en absoluto (decidió un contrato inventado sin describir el
  // tablón ni aplicar su mapa), así que VILLAGE_DESTINATION_CUES sobre la
  // narración del DM no detectaba nada. Por eso también se comprueba el
  // ÚLTIMO MENSAJE DEL JUGADOR: si el jugador acaba de elegir taberna/tablón
  // explícitamente, da igual que la narración del DM lo omita por completo --
  // sigue siendo el turno de aplicar el mapa.
  const mentionsDestination = VILLAGE_DESTINATION_CUES.some(
      (cue) => cue.test(narrativeText) || cue.test(lastPlayerMessage),
  );
  if (!touchedMapSystem && messageCount > 1 && messageCount <= VILLAGE_START_MAX_MESSAGES && mentionsDestination) {
    // Si YA se aplicó algún mapa en un turno anterior de esta partida
    // (mapHistory no vacío en el estado real), la elección de arranque ya
    // quedó resuelta: mencionar "el tablón"/"la taberna" en la conversación
    // posterior (ej. el DM describiendo los contratos del tablón donde el
    // grupo YA está) es normal y no debe forzar ninguna corrección. Se
    // detectó como falso positivo real: tras aplicarse el mapa del tablón,
    // cada turno de conversación que mencionaba "el tablón" quemaba intentos
    // de corrección pidiendo aplicar un mapa que ya estaba aplicado.
    try {
      const state = await toolCaller.callTool('get_game_state', { gameId });
      const mapHistory = (state as { mapHistory?: unknown[] } | null)?.mapHistory ?? [];
      if (Array.isArray(mapHistory) && mapHistory.length > 0) {
        return null;
      }
    } catch {
      // Si no se puede comprobar el estado real, se mantiene el aviso como
      // hasta ahora (mejor un aviso de más que un mapa sin aplicar).
    }
    return 'Tu narración (o el mensaje del jugador) menciona la taberna o el tablón de anuncios (la elección de ' +
        'arranque de la partida), pero no has llamado a ninguna tool de mapa en este turno. Sigue el paso 2 del ' +
        'arranque: llama a describe_map con el mapId correspondiente ("tabernaMercenarios" o "tablonAnuncios"), ' +
        'luego a set_battle_map -- y si es la taberna, coloca a los jugadores con place_participant en la zona ' +
        'real que vayas a narrar; si es el tablón de anuncios, NO llames a place_participant en absoluto (esa ' +
        'imagen no muestra marcadores de personajes) y pasa directamente a describir los contratos disponibles.';
  }
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
  // tablonAnuncios es una excepción a propósito: es solo una ilustración de
  // calle sin marcadores de personajes (ver dm-system-prompt.ts), así que
  // nunca lleva place_participant -- sin esta excepción, este aviso obligaría
  // al DM a colocar jugadores donde la UI ni siquiera los va a pintar.
  if (mapApplied && !placedParticipant && appliedMapId !== 'tablonAnuncios') {
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

/**
 * Se comprobó en partida real un bug grave: el DM resolvía un ataque contra un
 * Brown Bear (34 HP reales en el catálogo) que solo le dejaba, tras dos turnos,
 * 9 puntos de daño acumulados (25 HP reales restantes) -- y aun así narraba su
 * muerte ("el cadáver del oso yace a tus pies") y llamaba a grant_xp como si el
 * combate hubiera terminado. La causa: nada obligaba al modelo a comprobar el
 * HP REAL antes de declarar una victoria, solo su propia impresión narrativa de
 * "llevamos varios golpes, ya debe estar muerto".
 *
 * Este chequeo es un hecho verificable, no una opinión textual (a diferencia de
 * narrativeSuggestsLocationChange): si este turno se llamó a grant_xp Y a
 * resolve_attack contra algún enemigo, se relee el estado real de la partida
 * (get_game_state) y se comprueba el currentHp real de justo esos enemigos
 * atacados. Si alguno de ellos SIGUE con currentHp > 0, la victoria era
 * prematura -- se avisa con su HP real para que el modelo corrija la
 * narración antes de aceptarla. Solo mira a los enemigos atacados EN ESTE
 * turno (no a cualquier otro enemigo vivo del encuentro) para no generar
 * falsos positivos en combates con varios enemigos donde uno cae y otros
 * siguen en pie legítimamente sin que eso sea un error.
 */
type EncounterEnemyState = { instanceId?: unknown; name?: unknown; currentHp?: unknown };

/**
 * Se comprobó en partida real un bug grave: el DM resolvía un ataque contra un
 * Brown Bear (34 HP reales en el catálogo) que solo le dejaba, tras dos turnos,
 * 9 puntos de daño acumulados (25 HP reales restantes) -- y aun así narraba su
 * muerte ("el cadáver del oso yace a tus pies") y llamaba a grant_xp como si el
 * combate hubiera terminado. La causa: nada obligaba al modelo a comprobar el
 * HP REAL antes de declarar una victoria, solo su propia impresión narrativa de
 * "llevamos varios golpes, ya debe estar muerto".
 *
 * Un segundo bug relacionado, detectado en la MISMA partida: incluso cuando el
 * combate SÍ había terminado de verdad (enemigo a 0 HP real), no existía
 * ninguna tool para cerrarlo -- el panel "Combate" y el marcador del enemigo
 * derrotado se quedaban en el tablero para siempre, varias escenas después.
 * Ahora que existe end_combat (ver EndCombatUseCase), este chequeo también
 * empuja a llamarla en cuanto el combate esté realmente resuelto.
 *
 * Ambos chequeos comparten UNA sola llamada a get_game_state (un hecho
 * verificable, no una opinión textual como narrativeSuggestsLocationChange):
 * solo se dispara si este turno se llamó a grant_xp Y se atacó a algún
 * enemigo (resolve_attack) -- grant_xp es la señal de que el DM cree que el
 * combate (o parte de él) ha terminado.
 */
async function checkCombatStateNudge(
    toolCaller: ToolCaller,
    gameId: string,
    calledTools: Set<string>,
    attackedEnemyIds: Set<string>,
): Promise<string | null> {
  if (!calledTools.has('grant_xp') || attackedEnemyIds.size === 0) {
    return null;
  }

  let state: unknown;
  try {
    state = await toolCaller.callTool('get_game_state', { gameId });
  } catch {
    // Si ni siquiera se puede comprobar el estado real, no bloqueamos el
    // turno por un chequeo que no se pudo hacer -- se deja pasar.
    return null;
  }

  const activeEncounter =
      (state as { activeEncounter?: { enemies?: EncounterEnemyState[] } } | null)?.activeEncounter ?? null;
  const enemies = activeEncounter?.enemies ?? [];

  // 1) Victoria prematura: solo mira a los enemigos atacados EN ESTE turno (no
  // a cualquier otro enemigo vivo del encuentro) para no generar falsos
  // positivos en combates con varios enemigos donde uno cae y otros siguen en
  // pie legítimamente sin que eso sea un error.
  const stillAlive = enemies.filter(
      (e) => typeof e.instanceId === 'string' && attackedEnemyIds.has(e.instanceId) &&
          typeof e.currentHp === 'number' && e.currentHp > 0,
  );
  if (stillAlive.length > 0) {
    const list = stillAlive.map((e) => `${String(e.name)} (${String(e.currentHp)} HP reales)`).join(', ');
    return `Has llamado a grant_xp como si el combate hubiera terminado, pero get_game_state dice que ` +
        `sigue vivo: ${list}. NO narres su muerte ni que el combate ha acabado -- corrige tu narración para que ` +
        `el combate continúe con ese enemigo todavía en pie, con su HP real, y sigue resolviendo turnos de combate ` +
        'normalmente (nunca declares una victoria por impresión narrativa: solo cuando su currentHp real llegue a 0).';
  }

  // 2) Combate realmente terminado (todos los enemigos del encuentro a 0 HP
  // real) pero end_combat no se ha llamado todavía -- sin esto, el combate se
  // queda "fantasma" en el tablero para siempre.
  const allDefeated = enemies.length > 0 && enemies.every((e) => typeof e.currentHp === 'number' && e.currentHp <= 0);
  if (activeEncounter && allDefeated && !calledTools.has('end_combat')) {
    return 'Todos los enemigos de este combate ya están a 0 HP real (según get_game_state), pero no has ' +
        'llamado a end_combat. Llámala ahora para cerrar el combate de verdad -- si no, el panel de "Combate" y ' +
        'los marcadores de los enemigos derrotados se quedan mostrándose en el tablero del jugador para siempre, ' +
        'aunque sigas narrando otras escenas.';
  }

  return null;
}

/**
 * Envuelve chatClient.createCompletion para distinguir, si falla, si ya se
 * había llamado a alguna tool en este turno (mutación posiblemente ya
 * aplicada -- no reintentar a ciegas) o si todavía no se había llamado a
 * ninguna (nada que duplicar -- seguro marcarlo como reintentable).
 */
async function completeOrThrow(
    chatClient: ChatClient,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    calledTools: Set<string>,
): Promise<ChatCompletionResult> {
  try {
    return await chatClient.createCompletion({ messages, tools });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (calledTools.size === 0) {
      throw new NoMutationYetError(err);
    }
    throw err;
  }
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
  const attackedEnemyIds = new Set<string>();
  let failedStartCombatMessage: string | null = null;
  // Igual que failedStartCombatMessage, pero para cualquier tool de mapas
  // (MAP_TOOLS) que falle este turno -- ver mapToolFailedNudge más arriba.
  // Solo se guarda el PRIMER fallo del turno (si varios fallan, el primero ya
  // basta para forzar la corrección).
  let failedMapToolCall: { name: string; message: string } | null = null;
  // mapId del último set_battle_map aplicado con éxito en este turno -- se usa
  // solo para saber si es "tablonAnuncios" (nunca lleva place_participant, ver
  // dm-system-prompt.ts) y así no disparar el aviso de "aplicaste el mapa
  // pero no colocaste a nadie" en ese caso concreto. El resultado de la tool
  // (mapa_aplicado) no trae el mapId de vuelta -- SetBattleMapUseCase no
  // devuelve nada -- así que se lee directamente del argumento con el que el
  // propio DM llamó a la tool.
  let appliedMapId: string | null = null;
  const systemPrompt = buildDmSystemPrompt(gameId);
  const withSystem = (): ChatMessage[] => [{ role: 'system', content: systemPrompt }, ...messages];
  // Longitud del historial de la partida ANTES de este turno -- se usa como
  // "messageCount" en los nudges que distinguen "turno 1" / "primeros
  // mensajes de la partida" de turnos más avanzados. Se comprobó que usar
  // messages.length en vivo (recalculado en cada vuelta del bucle) era un
  // bug: cada corrección de protocolo AÑADE 2 entradas al array (la
  // respuesta rechazada del modelo + la nota interna de corrección), así que
  // tras un segundo intento de corrección (MAX_CORRECTION_ATTEMPTS) el
  // propio turno 1 ya "parecía" tener messageCount > 1 y disparaba avisos
  // pensados para turnos posteriores. Fijar el valor una sola vez, al
  // principio del turno, antes de que ninguna corrección lo infle.
  const initialMessageCount = messages.length;

  let iterations = 0;
  // correctionAttempts cuenta intentos CONSECUTIVOS del MISMO aviso (mismo
  // texto exacto) -- si el modelo no logra corregir el mismo problema tras
  // MAX_CORRECTION_ATTEMPTS vueltas, se rinde con ESE problema. lastNudgeText
  // guarda el texto del último aviso disparado para poder distinguir "sigue
  // fallando en lo mismo" de "ahora falla en otra cosa distinta".
  //
  // Se detectó en partida real un fallo grave que el diseño anterior (un
  // único contador global, sin memoria de CUÁL aviso se disparó) no cubría:
  // el jugador eligió "tablón" y los dos intentos de corrección permitidos
  // se gastaron en el MISMO aviso ("no has tocado ninguna tool de mapa" --
  // protocolNudge). Al tercer turno del modelo, YA CON EL PRESUPUESTO
  // AGOTADO, el modelo por fin llamó a una tool de mapas -- pero con las
  // etiquetas equivocadas ("molino"), acabó aplicando un mapa de mazmorra
  // real del catálogo que no tenía nada que ver con el tablón elegido, y
  // como el contador global ya estaba en el límite, NINGÚN nuevo aviso (ni
  // siquiera villageDestinationMismatchNudge, que sí lo habría detectado)
  // llegó a evaluarse -- el turno se aceptó tal cual, con una escena
  // completamente inconexa (un molino con un personaje inventado) mostrada
  // al jugador. La causa raíz: gastar el presupuesto entero en UN tipo de
  // problema no debería impedir corregir un problema DISTINTO y más grave
  // que aparece después. Con lastNudgeText, un aviso con texto distinto al
  // anterior reinicia su propio contador (le da su propio margen de
  // MAX_CORRECTION_ATTEMPTS intentos), mientras que totalCorrections pone un
  // techo absoluto para que el turno nunca pueda alargarse sin límite si el
  // modelo encadena problemas distintos uno tras otro sin parar.
  let correctionAttempts = 0;
  let totalCorrections = 0;
  let lastNudgeText: string | null = null;
  const MAX_TOTAL_CORRECTIONS = 4;
  let response = await completeOrThrow(chatClient, withSystem(), tools, calledTools);

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

        if (failed && call.function.name === 'start_combat') {
          const message = (result as { message?: unknown } | null)?.message;
          if (typeof message === 'string') {
            failedStartCombatMessage = message;
          }
        }
        if (failed && !failedMapToolCall && MAP_TOOLS.includes(call.function.name)) {
          const message = (result as { message?: unknown } | null)?.message;
          failedMapToolCall = { name: call.function.name, message: typeof message === 'string' ? message : 'error desconocido' };
        }

        if (!failed) {
          if (call.function.name === 'set_battle_map' && typeof args['mapId'] === 'string') {
            appliedMapId = args['mapId'] as string;
          }
          if (call.function.name === 'place_participant' && typeof args['participantId'] === 'string') {
            placedParticipantIds.add(args['participantId'] as string);
          }
          if (call.function.name === 'resolve_attack' && typeof args['targetId'] === 'string') {
            attackedEnemyIds.add(args['targetId'] as string);
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

      response = await completeOrThrow(chatClient, withSystem(), tools, calledTools);
      continue;
    }

    if (totalCorrections < MAX_TOTAL_CORRECTIONS) {
      // Orden de prioridad: 1) gameStartNudge (señal 100% determinista: el
      // turno 1 se reconoce por messageCount === 1, y es el fallo más
      // temprano posible en cualquier partida -- si el arranque ya sale mal,
      // nada de lo que compruebe el resto de nudges importa todavía);
      // 2) staleEncounterConflictNudge (señal 100% determinista: start_combat
      // rechazado por un combate huérfano ya activo -- el fallo más grave de
      // partida en curso, porque implica engañar al jugador con enemigos que
      // no coinciden con lo narrado); 3) mapToolFailedNudge (también
      // determinista: una tool de mapas se llamó de verdad y falló -- si no
      // se corrige, el modelo tiende a inventar excusas y desviarse a
      // contenido inconexo, como se vio en partida real); 4) playerRequestedMapNudge
      // (también determinista: el jugador pidió el mapa explícitamente y no
      // se tocó ninguna tool -- muy grave porque el DM puede llegar a mentir
      // diciendo que "ya se está mostrando"); 5) villageDestinationMismatchNudge
      // (también determinista: se aplicó un mapa de arranque, pero es el
      // mapId equivocado para lo que el jugador pidió -- distinto de
      // protocolNudge, que solo comprueba que SE TOCÓ algún mapa, nunca cuál);
      // 6) combate resuelto sin NINGUNA tool; 7) checkCombatStateNudge (un
      // hecho verificable contra el HP real vía get_game_state);
      // 8) protocolNudge (heurísticos de texto sobre mapas/colocación a
      // partir de la NARRACIÓN del DM, el más leve de todos porque depende de
      // cómo el propio DM elija contarlo).
      const gameStart = gameStartNudge(initialMessageCount, response.message.content ?? '');
      // Suplantación de jugador: determinista (el nombre real del jugador,
      // extraído de los prefijos "**Nombre:**" del historial, encabezando la
      // respuesta del DM) y aplicable en CUALQUIER turno -- va justo después
      // de gameStartNudge porque ambos son fallos de voz del narrador.
      const impersonationNudge = gameStart
          ? null
          : playerImpersonationNudge(messages, response.message.content ?? '');
      const staleEncounterNudge = (gameStart || impersonationNudge)
          ? null
          : staleEncounterConflictNudge(failedStartCombatMessage);
      const mapFailedNudge = (gameStart || impersonationNudge || staleEncounterNudge)
          ? null
          : mapToolFailedNudge(failedMapToolCall);
      const mapRequestNudge = (gameStart || impersonationNudge || staleEncounterNudge || mapFailedNudge)
          ? null
          : playerRequestedMapNudge(calledTools, lastPlayerMessageText(messages));
      const destinationMismatchNudge = (gameStart || impersonationNudge || staleEncounterNudge || mapFailedNudge || mapRequestNudge)
          ? null
          : villageDestinationMismatchNudge(lastPlayerMessageText(messages), appliedMapId, initialMessageCount);
      const noToolsNudge = (gameStart || impersonationNudge || staleEncounterNudge || mapFailedNudge || mapRequestNudge || destinationMismatchNudge)
          ? null
          : combatWithoutToolsNudge(calledTools, response.message.content ?? '');
      const combatStateNudge = (gameStart || impersonationNudge || staleEncounterNudge || mapFailedNudge || mapRequestNudge || destinationMismatchNudge || noToolsNudge)
          ? null
          : await checkCombatStateNudge(toolCaller, gameId, calledTools, attackedEnemyIds);
      const nudge =
          gameStart ??
          impersonationNudge ??
          staleEncounterNudge ??
          mapFailedNudge ??
          mapRequestNudge ??
          destinationMismatchNudge ??
          noToolsNudge ??
          combatStateNudge ??
          (await protocolNudge(
              toolCaller, gameId, calledTools, events, combatEnemyIds, placedParticipantIds,
              response.message.content ?? '', initialMessageCount, appliedMapId, lastPlayerMessageText(messages),
          ));
      // Si el aviso es idéntico al último ya disparado, es el MISMO problema
      // sin resolver -- cuenta contra su propio límite (MAX_CORRECTION_ATTEMPTS).
      // Si es distinto (incluido el caso de que antes no hubiera ninguno),
      // es un problema nuevo: reinicia el contador para darle su propio margen.
      if (nudge && nudge !== lastNudgeText) {
        correctionAttempts = 0;
      }
      if (nudge && correctionAttempts < MAX_CORRECTION_ATTEMPTS) {
        correctionAttempts += 1;
        totalCorrections += 1;
        lastNudgeText = nudge;
        console.log(
            `[dm-engine] Aviso correctivo de protocolo (intento ${correctionAttempts}/${MAX_CORRECTION_ATTEMPTS} ` +
            `de este problema, ${totalCorrections}/${MAX_TOTAL_CORRECTIONS} en total del turno): ${nudge}`,
        );
        messages.push(response.message);
        // OJO: este aviso iba antes con role:'user' -- eso hace que el
        // modelo lo lea como si el JUGADOR hubiera escrito ese texto tan
        // técnico, y responda conversacionalmente a "él" (se detectó en
        // partida real: el DM respondió "Tienes razón, disculpa. Pero
        // necesito que elijáis primero..." -- una disculpa meta dirigida al
        // aviso interno, rompiendo la inmersión, en vez de simplemente
        // corregir su narración). role:'system' + la instrucción explícita
        // de reescribir sin mencionar la corrección evita que el jugador
        // vea nunca este intercambio.
        messages.push({
          role: 'system',
          content: `Nota interna de corrección -- el jugador NO ha escrito esto, es el sistema: ${nudge} ` +
              'Reescribe tu respuesta de este turno aplicando esta corrección y narrando de forma natural, como ' +
              'si fuera tu primera respuesta. NUNCA menciones esta nota, te disculpes por ella, ni le hables al ' +
              'jugador sobre haber cometido un error de protocolo -- el jugador no debe notar que hubo ninguna ' +
              'corrección.',
        });
        response = await completeOrThrow(chatClient, withSystem(), tools, calledTools);
        continue;
      }
    }

    break;
  }

  // Seguro determinista de última instancia: si pese a todos los avisos
  // anteriores el modelo nunca aplicó el mapa que corresponde a la elección
  // de arranque del jugador, esto lo fuerza por código (ver
  // resolveVillageStartFallback más arriba). Se ejecuta SIEMPRE al final,
  // haya habido avisos o no -- es la última red de seguridad, no depende de
  // que el modelo "por fin" obedezca.
  const fallbackNarrative = await resolveVillageStartFallback(
      toolCaller, gameId, lastPlayerMessageText(messages), appliedMapId, initialMessageCount, events,
  );
  if (fallbackNarrative) {
    console.log(
        '[dm-engine] Seguro de arranque activado: el modelo no aplicó el mapa correspondiente a la elección ' +
        `del jugador tras agotar los avisos -- forzado por código. Narrativa del modelo descartada: ` +
        `"${response.message.content ?? ''}"`,
    );
  }

  console.log(
      `[dm-engine] Turno terminado. Tools llamadas: [${[...calledTools].join(', ') || 'ninguna'}] — ` +
      `Eventos: [${events.map((e) => e.type).join(', ') || 'ninguno'}]`,
  );

  return { narrative: fallbackNarrative ?? response.message.content ?? '', events };
}
