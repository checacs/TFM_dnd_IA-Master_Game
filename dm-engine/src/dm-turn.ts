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
const VILLAGE_DESTINATION_CUES = [/\btabl[oó]n\b/i, /\btaberna\b/i];

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
function protocolNudge(
    calledTools: Set<string>,
    events: GameEvent[],
    combatEnemyIds: Set<string>,
    placedParticipantIds: Set<string>,
    narrativeText: string,
    messageCount: number,
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
  if (!touchedMapSystem && messageCount > 1 && messageCount <= VILLAGE_START_MAX_MESSAGES &&
      VILLAGE_DESTINATION_CUES.some((cue) => cue.test(narrativeText))) {
    return 'Tu narración menciona la taberna o el tablón de anuncios (la elección de arranque de la partida), ' +
        'pero no has llamado a ninguna tool de mapa en este turno. Sigue el paso 2 del arranque: llama a ' +
        'describe_map con el mapId correspondiente ("tabernaMercenarios" o "tablonAnuncios"), luego a ' +
        'set_battle_map, y coloca a los jugadores con place_participant (salvo en tablonAnuncios, que no tiene ' +
        'zonas que validar) antes de dar la escena por buena.';
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
  const systemPrompt = buildDmSystemPrompt(gameId);
  const withSystem = (): ChatMessage[] => [{ role: 'system', content: systemPrompt }, ...messages];

  let iterations = 0;
  let correctionUsed = false;
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

        if (!failed) {
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

    if (!correctionUsed) {
      // Orden de prioridad: 1) gameStartNudge (señal 100% determinista: el
      // turno 1 se reconoce por messageCount === 1, y es el fallo más
      // temprano posible en cualquier partida -- si el arranque ya sale mal,
      // nada de lo que compruebe el resto de nudges importa todavía);
      // 2) staleEncounterConflictNudge (señal 100% determinista: start_combat
      // rechazado por un combate huérfano ya activo -- el fallo más grave de
      // partida en curso, porque implica engañar al jugador con enemigos que
      // no coinciden con lo narrado); 3) playerRequestedMapNudge (también
      // determinista: el jugador pidió el mapa explícitamente y no se tocó
      // ninguna tool -- muy grave porque el DM puede llegar a mentir diciendo
      // que "ya se está mostrando"); 4) combate resuelto sin NINGUNA tool;
      // 5) checkCombatStateNudge (un hecho verificable contra el HP real vía
      // get_game_state); 6) protocolNudge (heurísticos de texto sobre
      // mapas/colocación a partir de la NARRACIÓN del DM, el más leve de
      // todos porque depende de cómo el propio DM elija contarlo).
      const gameStart = gameStartNudge(messages.length, response.message.content ?? '');
      const staleEncounterNudge = gameStart ? null : staleEncounterConflictNudge(failedStartCombatMessage);
      const mapRequestNudge = (gameStart || staleEncounterNudge)
          ? null
          : playerRequestedMapNudge(calledTools, lastPlayerMessageText(messages));
      const noToolsNudge = (gameStart || staleEncounterNudge || mapRequestNudge)
          ? null
          : combatWithoutToolsNudge(calledTools, response.message.content ?? '');
      const combatStateNudge = (gameStart || staleEncounterNudge || mapRequestNudge || noToolsNudge)
          ? null
          : await checkCombatStateNudge(toolCaller, gameId, calledTools, attackedEnemyIds);
      const nudge =
          gameStart ??
          staleEncounterNudge ??
          mapRequestNudge ??
          noToolsNudge ??
          combatStateNudge ??
          protocolNudge(
              calledTools, events, combatEnemyIds, placedParticipantIds, response.message.content ?? '',
              messages.length,
          );
      if (nudge) {
        correctionUsed = true;
        console.log(`[dm-engine] Aviso correctivo de protocolo: ${nudge}`);
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

  console.log(
      `[dm-engine] Turno terminado. Tools llamadas: [${[...calledTools].join(', ') || 'ninguna'}] — ` +
      `Eventos: [${events.map((e) => e.type).join(', ') || 'ninguno'}]`,
  );

  return { narrative: response.message.content ?? '', events };
}
