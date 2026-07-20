import { toGameEvent } from './game-events';

describe('toGameEvent', () => {
  it('mapea start_combat a combate_iniciado', () => {
    const event = toGameEvent('start_combat', { started: true });
    expect(event).toEqual({ type: 'combate_iniciado', payload: { started: true } });
  });

  it('mapea resolve_attack a ataque_resuelto', () => {
    const event = toGameEvent('resolve_attack', { hit: true, damage: 5 });
    expect(event).toEqual({ type: 'ataque_resuelto', payload: { hit: true, damage: 5 } });
  });

  it('mapea roll_dice a tirada_realizada', () => {
    const event = toGameEvent('roll_dice', { result: 14 });
    expect(event).toEqual({ type: 'tirada_realizada', payload: { result: 14 } });
  });

  it('mapea grant_xp a xp_otorgada', () => {
    const event = toGameEvent('grant_xp', { leveledUp: true, newLevel: 2 });
    expect(event).toEqual({ type: 'xp_otorgada', payload: { leveledUp: true, newLevel: 2 } });
  });

  it('mapea set_battle_map a mapa_aplicado', () => {
    const event = toGameEvent('set_battle_map', { applied: true });
    expect(event).toEqual({ type: 'mapa_aplicado', payload: { applied: true } });
  });

  it('mapea place_participant a participante_colocado', () => {
    const event = toGameEvent('place_participant', { placed: true });
    expect(event).toEqual({ type: 'participante_colocado', payload: { placed: true } });
  });

  it('mapea advance_to_player_round a ronda_reabierta', () => {
    const event = toGameEvent('advance_to_player_round', { advanced: true });
    expect(event).toEqual({ type: 'ronda_reabierta', payload: { advanced: true } });
  });

  it('las tools de solo consulta no generan evento (get_enemy_catalog, get_game_state, get_battle_maps)', () => {
    expect(toGameEvent('get_enemy_catalog', [])).toBeNull();
    expect(toGameEvent('get_game_state', {})).toBeNull();
    expect(toGameEvent('get_battle_maps', [])).toBeNull();
  });
});
