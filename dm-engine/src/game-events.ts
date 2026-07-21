export type GameEventType =
  | 'combate_iniciado'
  | 'ataque_resuelto'
  | 'tirada_realizada'
  | 'xp_otorgada'
  | 'mapa_aplicado'
  | 'mapa_limpiado'
  | 'participante_colocado'
  | 'ronda_reabierta'
  | 'turno_jugador_cerrado'
  | 'objeto_concedido'
  | 'combate_terminado'
  | 'hechizo_lanzado'
  | 'objeto_magico_concedido';

export interface GameEvent {
  type: GameEventType;
  payload: unknown;
}

/**
 * Qué tool genera qué evento para la UI (docs/05-motor-ia-dm-deepseek.md,
 * sección 4). Las tools de solo lectura (get_enemy_catalog, get_game_state,
 * get_battle_maps) no aparecen aquí a propósito: son contexto interno para
 * el LLM, la UI no reacciona a ellas.
 */
const TOOL_TO_EVENT_TYPE: Partial<Record<string, GameEventType>> = {
  start_combat: 'combate_iniciado',
  resolve_attack: 'ataque_resuelto',
  roll_dice: 'tirada_realizada',
  grant_xp: 'xp_otorgada',
  set_battle_map: 'mapa_aplicado',
  clear_battle_map: 'mapa_limpiado',
  place_participant: 'participante_colocado',
  advance_to_player_round: 'ronda_reabierta',
  end_player_turn: 'turno_jugador_cerrado',
  grant_item: 'objeto_concedido',
  end_combat: 'combate_terminado',
  cast_spell: 'hechizo_lanzado',
  grant_magic_item: 'objeto_magico_concedido',
};

export function toGameEvent(toolName: string, toolResult: unknown): GameEvent | null {
  const type = TOOL_TO_EVENT_TYPE[toolName];
  if (!type) {
    return null;
  }
  return { type, payload: toolResult };
}
