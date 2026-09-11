import { Game } from '../../domain/entities/game.entity';
import { MapRepository } from '../../domain/ports/map.repository.port';

/**
 * Comprueba que desde el mapa en el que está ahora la partida (el último de
 * mapHistory) se puede pasar a `targetMapId` -- ver BattleMap.canLeadTo. Lo
 * usan set_battle_map y start_combat (con mapId) ANTES de modificar la
 * partida, para que un rechazo no deje nada a medias.
 *
 * Se usa el último de mapHistory aunque después se haya llamado a
 * clear_battle_map: si no, limpiar el tablero sería un atajo para saltarse
 * las salidas reales del sótano.
 */
export async function assertMapReachable(game: Game, targetMapId: string, maps: MapRepository): Promise<void> {
  const history = game.toSnapshot().mapHistory;
  const currentMapId = history[history.length - 1];
  if (!currentMapId || currentMapId === targetMapId) {
    return;
  }
  const currentMap = await maps.findById(currentMapId);
  currentMap?.assertCanLeadTo(targetMapId);
}
