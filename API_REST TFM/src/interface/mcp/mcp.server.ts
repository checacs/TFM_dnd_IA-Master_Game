import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GameMcpTools } from './game-mcp-tools';

export function registerGameTools(server: McpServer, tools: GameMcpTools): void {
  server.tool(
    'roll_dice',
    'Ejecuta una tirada de dados determinista (ej. tirada de salvación fuera de combate). ' +
      'El resultado siempre lo genera el backend, nunca se debe asumir un resultado.',
    { notation: z.string().describe('Notación de dado, ej. "1d20+3"') },
    async ({ notation }) => ({
      content: [{ type: 'text', text: JSON.stringify(tools.rollDiceTool(notation)) }],
    }),
  );

  server.tool(
    'resolve_attack',
    'Resuelve el ataque de un participante (normalmente un enemigo en su turno) contra un objetivo, ' +
      'dentro de un combate activo.',
    {
      gameId: z.string(),
      targetId: z.string(),
      attackerModifier: z.number().int(),
      targetArmorClass: z.number().int(),
      damageDice: z.string().describe('Notación de dado de daño, ej. "1d6+2"'),
    },
    async (input) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.resolveAttackTool(input)) }],
    }),
  );

  server.tool(
    'start_combat',
    'Inicia un combate con los enemigos indicados. Arranca directamente en fase "jugadores": ya no hay ' +
      'iniciativa entre jugadores, cualquiera puede actuar en el orden que quiera (ver claim_turn desde el ' +
      'móvil) — tú solo resuelves los enemigos cuando la fase pase a "enemigos" (get_game_state.activeEncounter.roundPhase), ' +
      'y luego llamas a advance_to_player_round para reabrir la ronda de jugadores. ' +
      'Opcionalmente aplica un mapa de fondo al tablero (mapId, ver get_battle_maps).',
    {
      gameId: z.string(),
      enemyIds: z.array(z.string()),
      mapId: z.string().optional(),
    },
    async (input) => {
      // El DM necesita ver los instanceId reales de cada enemigo para poder
      // colocarlos luego con place_participant — devolver solo {started:true}
      // (como antes) le ocultaba esos IDs y el protocolNudge de dm-turn.ts no
      // podía comprobar cuáles faltaban por colocar.
      const result = await tools.startCombatTool(input);
      return { content: [{ type: 'text', text: JSON.stringify({ started: true, ...result }) }] };
    },
  );

  server.tool(
    'get_enemy_catalog',
    'Busca enemigos del catálogo maestro por etiquetas o dificultad máxima. Úsalo siempre antes de ' +
      'introducir un enemigo en la narración: nunca inventes sus estadísticas.',
    { tags: z.array(z.string()).optional(), maxChallengeRating: z.number().optional() },
    async ({ tags, maxChallengeRating }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.searchEnemiesTool({ tags, maxChallengeRating })) }],
    }),
  );

  server.tool(
    'get_battle_maps',
    'Busca mapas de combate del catálogo por etiquetas derivadas del sitio real que estás narrando ' +
      '(interior/exterior, taberna, cueva, castillo, bosque, cabaña, almacén, cripta, mazmorra...), NUNCA ' +
      'una lista fija de ejemplo: piensa en la escena concreta de TU historia, no repitas siempre las ' +
      'mismas etiquetas de partida en partida. El resultado ya viene priorizado por relevancia y con el ' +
      'orden variado a propósito -- no asumas que el primero de la lista es siempre la mejor opción, y ' +
      'consulta get_game_state.mapHistory para evitar el mapId que ya hayas usado en esta partida si hay ' +
      'alternativas razonables. Úsalo para elegir un mapId coherente con la escena antes de llamar a ' +
      'start_combat/set_battle_map.',
    { tags: z.array(z.string()).optional() },
    async ({ tags }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.searchMapsTool({ tags })) }],
    }),
  );

  server.tool(
    'set_battle_map',
    'Aplica un mapa de combate del catalogo al tablero de la partida SIN iniciar combate. ' +
      'Usalo al empezar la partida para ambientar la escena antes de que aparezcan enemigos, y de nuevo ' +
      'CADA VEZ que la narracion cambie de localizacion (los personajes salen de una sala/escenario y ' +
      'entran en otro) si encuentras en get_battle_maps un mapId que encaje con el sitio nuevo.',
    { gameId: z.string(), mapId: z.string() },
    async ({ gameId, mapId }) => {
      await tools.setBattleMapTool(gameId, mapId);
      return { content: [{ type: 'text', text: JSON.stringify({ applied: true }) }] };
    },
  );

  server.tool(
    'clear_battle_map',
    'Quita el mapa de combate actual del tablero (vuelve a una cuadricula plana sin imagen). Usalo ' +
      'cuando la narracion cambie de localizacion y NINGUN mapa de get_battle_maps encaje con el sitio ' +
      'nuevo: nunca dejes en pantalla la imagen de una escena anterior que ya no corresponde a lo narrado.',
    { gameId: z.string() },
    async ({ gameId }) => {
      await tools.clearBattleMapTool(gameId);
      return { content: [{ type: 'text', text: JSON.stringify({ cleared: true }) }] };
    },
  );

  server.tool(
    'describe_map',
    'Analiza un mapa de batalla con vision artificial (DeepSeek Vision) y devuelve una descripcion ' +
      'detallada del layout: salas, pasillos, elementos visibles, cuadricula. ' +
      'Usalo despues de get_battle_maps para entender la disposicion del mapa antes de narrar la escena.',
    { mapId: z.string() },
    async ({ mapId }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.describeMapTool(mapId)) }],
    }),
  );

  server.tool(
    'get_spell_catalog',
    'Busca hechizos del catálogo maestro por clase (ej. "wizard", "cleric") o nivel máximo. ' +
      'Úsalo siempre antes de que un personaje lance un hechizo: nunca inventes su efecto, daño o tirada de salvación.',
    { classIndex: z.string().optional(), maxLevel: z.number().optional() },
    async ({ classIndex, maxLevel }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.searchSpellsTool({ classIndex, maxLevel })) }],
    }),
  );

  server.tool(
    'get_game_state',
    'Devuelve el estado actual de la partida: tablero, combate activo, jugadores y mapHistory (los ' +
      'mapId ya aplicados en esta partida, en orden). Úsalo para fundamentar la narración en hechos ' +
      'reales, no en la memoria de la conversación, y consulta mapHistory antes de elegir un mapa nuevo ' +
      'con get_battle_maps para no repetir siempre el mismo escenario en partidas largas.',
    { gameId: z.string() },
    async ({ gameId }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.gameStateTool(gameId)) }],
    }),
  );

  server.tool(
    'get_rules_reference',
    'Busca condiciones (ej. "blinded", "frightened"), habilidades, tipos de daño, puntuaciones de ' +
      'característica o secciones de reglas por su categoría (kind). Úsalo antes de aplicar o narrar ' +
      'cualquiera de estas: nunca inventes su efecto.',
    { kind: z.enum(['condition', 'skill', 'damage-type', 'ability-score', 'rule-section']).optional() },
    async ({ kind }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.searchRulesReferenceTool({ kind })) }],
    }),
  );

  server.tool(
    'get_equipment_catalog',
    'Busca armas, armaduras y objetos de aventurero por categoría (ej. "Weapon", "Armor", "Adventuring Gear"). ' +
      'Úsalo para describir con precisión el equipo de un personaje: nunca inventes daño, alcance o propiedades de un arma.',
    { category: z.string().optional() },
    async ({ category }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.searchEquipmentTool({ category })) }],
    }),
  );

  server.tool(
    'get_magic_items',
    'Busca objetos mágicos del catálogo por rareza (ej. "Common", "Uncommon", "Rare"). ' +
      'Úsalo antes de que un objeto mágico aparezca en la narración: nunca inventes su efecto.',
    { rarity: z.string().optional() },
    async ({ rarity }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.searchMagicItemsTool({ rarity })) }],
    }),
  );

  server.tool(
    'grant_xp',
    'Otorga experiencia a un personaje tras un evento narrativo (ej. derrotar un enemigo) y marca ' +
      'si cruza el umbral de nivel.',
    { characterId: z.string(), amount: z.number().int().positive() },
    async ({ characterId, amount }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.grantXpTool(characterId, amount)) }],
    }),
  );

  server.tool(
    'grant_item',
    'Añade al inventario REAL de un personaje un objeto del catálogo de equipo (get_equipment_catalog). ' +
      'Llama a esta tool SIEMPRE que tu narración implique que un jugador encuentra, recibe, saquea o compra ' +
      'un arma, armadura u objeto de aventurero concreto (ej. "recoges la daga del cofre", "el tabernero te ' +
      'entrega una cuerda") — nunca lo des por hecho solo con narrarlo: si no llamas a esta tool, el objeto ' +
      'nunca aparece en la ficha del jugador aunque tu texto diga que lo tiene. Primero busca el objeto real ' +
      'con get_equipment_catalog (nunca inventes un objeto que no exista ahí) y usa su id como equipmentId; ' +
      'puedes narrarlo con un nombre más evocador (ej. "una daga de factura élfica") aunque el objeto base del ' +
      'catálogo sea genérico (ej. "Dagger"), igual que ya haces con los enemigos reflavored sobre catálogo real.',
    { characterId: z.string(), equipmentId: z.string() },
    async ({ characterId, equipmentId }) => {
      await tools.grantItemTool(characterId, equipmentId);
      return { content: [{ type: 'text', text: JSON.stringify({ granted: true }) }] };
    },
  );

  server.tool(
    'apply_condition',
    'Aplica una condición (ej. "frightened", "blinded") a un jugador o enemigo del combate activo. ' +
      'Tiene efecto mecánico real: puede dar ventaja/desventaja en los ataques posteriores. ' +
      'Valida contra el catálogo real — nunca apliques una condición inventada.',
    { gameId: z.string(), participantId: z.string(), conditionIndex: z.string() },
    async ({ gameId, participantId, conditionIndex }) => {
      await tools.applyConditionTool(gameId, participantId, conditionIndex);
      return { content: [{ type: 'text', text: JSON.stringify({ applied: true }) }] };
    },
  );

  server.tool(
    'remove_condition',
    'Quita una condición ya aplicada a un jugador o enemigo (porque expiró, fue curada, etc.).',
    { gameId: z.string(), participantId: z.string(), conditionIndex: z.string() },
    async ({ gameId, participantId, conditionIndex }) => {
      await tools.removeConditionTool(gameId, participantId, conditionIndex);
      return { content: [{ type: 'text', text: JSON.stringify({ removed: true }) }] };
    },
  );

  server.tool(
    'place_participant',
    'Coloca a un jugador o enemigo en una celda (row, col) del tablero actual. Úsalo al describir dónde ' +
      'está cada uno en la escena (tras set_battle_map o start_combat) o cuando la narración implique que ' +
      'alguien se mueve. Si el mapa tiene zonas catalogadas, la celda debe caer dentro de alguna sala real ' +
      'del mapa (consulta describe_map): nunca coloques a nadie fuera de la estructura dibujada. PASA ' +
      'SIEMPRE zoneName con el nombre EXACTO de la zona de describe_map en la que estás narrando a este ' +
      'participante (ej. si narras "junto al Viejo Roble Resonante", zoneName debe ser "Viejo Roble ' +
      'Resonante"): el sistema rechazará la llamada con un error si la celda no cae dentro de esa zona ' +
      'exacta, para detectar si te has confundido de sala vecina (zonas distintas a veces comparten el ' +
      'mismo rango de filas o columnas). Si aún no hay una zona concreta que nombrar, omite zoneName.',
    {
      gameId: z.string(),
      participantId: z.string(),
      row: z.number().int(),
      col: z.number().int(),
      zoneName: z.string().optional(),
    },
    async ({ gameId, participantId, row, col, zoneName }) => {
      await tools.placeParticipantTool(gameId, participantId, row, col, zoneName);
      return { content: [{ type: 'text', text: JSON.stringify({ placed: true }) }] };
    },
  );

  server.tool(
    'get_character_sheet',
    'Devuelve la ficha completa de un personaje: CA, HP actual/máximo, atributos, nivel, equipo e ' +
      'inventario. Llama a esto SIEMPRE que necesites cualquiera de estos datos (por ejemplo para resolver ' +
      'un ataque, o para describir el aspecto/equipo de un personaje) — nunca le preguntes al jugador sus ' +
      'propias estadísticas, ya viven en la base de datos. El characterId de cada jugador está en ' +
      'get_game_state.players[].characterId.',
    { characterId: z.string() },
    async ({ characterId }) => ({
      content: [{ type: 'text', text: JSON.stringify(await tools.getCharacterSheetTool(characterId)) }],
    }),
  );

  server.tool(
    'advance_to_player_round',
    'Reabre la ronda de jugadores tras resolver la fase de enemigos de un combate activo (roundPhase pasa de ' +
      '"enemigos" a "jugadores", libera el candado de turno y limpia quién ha actuado). Llámala siempre que ' +
      'termines de narrar y resolver los ataques de todos los enemigos vivos de la ronda — sin ella, los ' +
      'jugadores del móvil se quedan sin poder reclamar turno.',
    { gameId: z.string() },
    async ({ gameId }) => {
      await tools.advanceToPlayerRoundTool(gameId);
      return { content: [{ type: 'text', text: JSON.stringify({ advanced: true }) }] };
    },
  );

  server.tool(
    'end_player_turn',
    'Cierra el turno de UN jugador concreto dentro de la ronda de jugadores de un combate activo: libera su ' +
      'candado de turno y lo marca como "ya ha actuado esta ronda" (si con esto ya actuaron todos los ' +
      'jugadores vivos, la fase pasa a "enemigos" automáticamente). Llámala SOLO cuando hayas resuelto POR ' +
      'COMPLETO la acción de ese jugador (ataque resuelto con resolve_attack, tirada aplicada, hechizo ' +
      'lanzado, movimiento/huida ya reflejado, etc.) y no necesites nada más de él para terminar su turno. ' +
      'NUNCA la llames si tu respuesta es solo una pregunta aclaratoria para el jugador (p. ej. "¿la empuñas ' +
      'a una o dos manos?", "¿a qué enemigo apuntas?") — en ese caso espera a que responda antes de cerrar su ' +
      'turno; si la cierras demasiado pronto, el jugador se queda bloqueado sin poder escribir más aunque tú ' +
      'todavía le estés preguntando algo. El characterId de cada jugador está en get_game_state.players[].characterId.',
    { gameId: z.string(), characterId: z.string() },
    async ({ gameId, characterId }) => {
      await tools.endPlayerTurnTool(gameId, characterId);
      return { content: [{ type: 'text', text: JSON.stringify({ turnEnded: true }) }] };
    },
  );
}
