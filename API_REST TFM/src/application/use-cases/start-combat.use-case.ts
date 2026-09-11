import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { EnemyRepository, ENEMY_REPOSITORY } from '../../domain/ports/enemy.repository.port';
import { MapRepository, MAP_REPOSITORY } from '../../domain/ports/map.repository.port';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { evaluateEncounter, formatChallengeRating } from '../../domain/services/encounter-difficulty';
import { EncounterEnemy } from '../../domain/entities/game.entity';
import { DomainError } from '../../domain/errors/domain-error';
import { BattleMap } from '../../domain/entities/battle-map.entity';
import { assertMapReachable } from './assert-map-reachable';

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
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
  ) {}

  async execute(input: StartCombatInput): Promise<{ enemies: EncounterEnemy[] }> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const encounterEnemies: EncounterEnemy[] = [];
    const challengeRatings: number[] = [];
    for (const enemyId of input.enemyIds) {
      const enemy = await this.enemyRepository.findById(enemyId);
      if (!enemy) {
        throw new DomainError(`Enemigo ${enemyId} no encontrado en el catálogo`);
      }
      const snapshot = enemy.toSnapshot();
      challengeRatings.push(snapshot.challengeRating);
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

    await this.assertEncounterIsBalanced(game.toSnapshot().players.map((p) => p.characterId), challengeRatings);

    // El mapa se valida (existe y está conectado con el actual) ANTES de
    // tocar la partida, igual que el equilibrio: un rechazo no deja nada a
    // medias (antes se comprobaba después de startEncounter).
    let map: BattleMap | null = null;
    if (input.mapId) {
      map = await this.mapRepository.findById(input.mapId);
      if (!map) {
        throw new DomainError(`Mapa ${input.mapId} no encontrado en el catálogo`);
      }
      await assertMapReachable(game, input.mapId, this.mapRepository);
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

    if (map) {
      const mapSnapshot = map.toSnapshot();
      game.setBattleMap({
        rows: mapSnapshot.rows,
        cols: mapSnapshot.cols,
        imageUrl: mapSnapshot.imageUrl,
        zones: mapSnapshot.zones,
        mapId: map.id,
      });
    }

    await this.games.save(game);

    // El DM-IA necesita los instanceId reales de cada enemigo para poder
    // colocarlos en el tablero con place_participant (ver dm-turn.ts /
    // protocolNudge) — sin devolverlos aquí, el modelo solo sabe que el combate
    // empezó pero no con qué IDs concretos referirse a cada enemigo.
    return { enemies: encounterEnemies };
  }

  /**
   * Tope de dificultad por código (ver domain/services/encounter-difficulty.ts
   * para el caso real que lo motivó). Se comprueba ANTES de tocar la partida:
   * si se rechaza, no queda ningún combate a medio arrancar y el DM-IA recibe
   * el error con cifras concretas para elegir otros enemigos.
   */
  private async assertEncounterIsBalanced(characterIds: string[], challengeRatings: number[]): Promise<void> {
    if (challengeRatings.length === 0) {
      return;
    }
    const partyLevels: number[] = [];
    for (const characterId of characterIds) {
      const character = await this.characters.findById(characterId);
      partyLevels.push(character?.toSnapshot().level ?? 1);
    }

    const evaluation = evaluateEncounter({ partyLevels, monsterChallengeRatings: challengeRatings });
    if (evaluation.withinBudget) {
      return;
    }

    const hints: string[] = [];
    if (evaluation.maxChallengeRatingForOne !== null) {
      hints.push(`1 enemigo de CR ≤ ${formatChallengeRating(evaluation.maxChallengeRatingForOne)}`);
    }
    if (evaluation.maxChallengeRatingForTwo !== null) {
      hints.push(`2 enemigos de CR ≤ ${formatChallengeRating(evaluation.maxChallengeRatingForTwo)} cada uno`);
    }
    if (evaluation.maxChallengeRatingForThree !== null) {
      hints.push(`3 enemigos de CR ≤ ${formatChallengeRating(evaluation.maxChallengeRatingForThree)} cada uno`);
    }
    throw new DomainError(
        `Encuentro demasiado duro para este grupo (${partyLevels.length} personaje(s) de nivel ` +
        `${partyLevels.join(', ')}): sus enemigos suman ${evaluation.totalXp} XP y el máximo permitido es ` +
        `${evaluation.maxXp} (presupuesto de dificultad "alta" de la Guía del DM 2024). El combate NO ha ` +
        `empezado. Vuelve a llamar a start_combat con menos enemigos o más débiles` +
        `${hints.length > 0 ? ` -- por ejemplo ${hints.join(', o ')}` : ''} (búscalos con get_enemy_catalog y ` +
        'maxChallengeRating) y describe SOLO a los enemigos que start_combat acepte: nunca narres más criaturas ' +
        'de las que hay de verdad en el combate.',
    );
  }
}
