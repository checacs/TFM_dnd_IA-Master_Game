import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { EnemyRepository, ENEMY_REPOSITORY } from '../../domain/ports/enemy.repository.port';
import { MapRepository, MAP_REPOSITORY } from '../../domain/ports/map.repository.port';
import { EncounterEnemy } from '../../domain/entities/game.entity';
import { DomainError } from '../../domain/errors/domain-error';

export interface StartCombatInput {
  gameId: string;
  /** IDs del catálogo maestro de enemigos (nunca se inventan sus estadísticas). */
  enemyIds: string[];
  /** Opcional: id del catálogo de mapas (BattleMap) a aplicar al tablero. */
  mapId?: string;
}

/**
 * Arranca el combate con los enemigos seleccionados y, opcionalmente, aplica
 * un mapa de fondo al tablero (docs sobre BattleMap).
 *
 * Ya no calcula iniciativa (antes 1d20 + mod. destreza para jugadores y
 * enemigos): el orden entre jugadores dejó de importar en la práctica de
 * mesa — Game.startEncounter arranca directamente en fase 'jugadores', y el
 * candado de turno (claimTurn/releaseTurnAfterAction) es lo que evita que dos
 * jugadores actúen a la vez. Los enemigos los resuelve el DM-IA libremente.
 */
@Injectable()
export class StartCombatUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(ENEMY_REPOSITORY) private readonly enemyRepository: EnemyRepository,
    @Inject(MAP_REPOSITORY) private readonly mapRepository: MapRepository,
  ) {}

  async execute(input: StartCombatInput): Promise<{ enemies: EncounterEnemy[] }> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const encounterEnemies: EncounterEnemy[] = [];
    for (const enemyId of input.enemyIds) {
      const enemy = await this.enemyRepository.findById(enemyId);
      if (!enemy) {
        throw new DomainError(`Enemigo ${enemyId} no encontrado en el catálogo`);
      }
      const snapshot = enemy.toSnapshot();
      const instanceId = `${input.gameId}-${enemyId}-${crypto.randomUUID()}`;

      encounterEnemies.push({
        instanceId,
        enemyRefId: enemyId,
        name: snapshot.name,
        currentHp: snapshot.hp,
        ac: snapshot.ac,
        conditions: [],
        position: null,
        imageUrl: snapshot.imageUrl ?? null,
      });
    }

    game.startEncounter({ enemies: encounterEnemies });

    // Aviso llamativo y GARANTIZADO de que el combate ha arrancado de verdad
    // -- igual que resolve_attack/cast_spell ya dejan constancia de sus
    // tiradas en el chat sin depender de que el DM-IA se acuerde de narrarlo
    // con dramatismo, este mensaje se añade aquí mismo, no en la narración
    // libre del modelo. Se pidió explícitamente tras detectarse en partida
    // real que un combate podía empezar sin ningún aviso claro para el
    // jugador más allá de la propia narración (que a veces era sutil).
    const enemyNames = encounterEnemies.map((e) => `**${e.name}**`).join(', ') || 'enemigos desconocidos';
    game.appendNarrativeEntry({
      role: 'assistant',
      content: `⚔️ **¡ENTRÁIS EN COMBATE!!!** — Enemigos: ${enemyNames}`,
    });

    if (input.mapId) {
      const map = await this.mapRepository.findById(input.mapId);
      if (!map) {
        throw new DomainError(`Mapa ${input.mapId} no encontrado en el catálogo`);
      }
      const mapSnapshot = map.toSnapshot();
      game.setBattleMap({
        rows: mapSnapshot.rows,
        cols: mapSnapshot.cols,
        imageUrl: mapSnapshot.imageUrl,
        zones: mapSnapshot.zones,
        mapId: input.mapId,
      });
    }

    await this.games.save(game);

    // El DM-IA necesita los instanceId reales de cada enemigo para poder
    // colocarlos en el tablero con place_participant (ver dm-turn.ts /
    // protocolNudge) — sin devolverlos aquí, el modelo solo sabe que el combate
    // empezó pero no con qué IDs concretos referirse a cada enemigo.
    return { enemies: encounterEnemies };
  }
}
