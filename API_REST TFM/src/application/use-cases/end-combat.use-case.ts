import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface EndCombatInput {
  gameId: string;
}

/**
 * Llamado por el DM-IA (tool MCP end_combat) cuando el combate activo ha
 * terminado de verdad -- todos los enemigos derrotados (currentHp real en 0,
 * ver checkPrematureVictoryNudge en dm-engine), el grupo ha huido, o se ha
 * negociado una tregua. Sin este caso de uso no existía NINGUNA forma de
 * cerrar activeEncounter: se detectó en partida real que, tras ganar un
 * combate, el panel "Combate" y el marcador del enemigo derrotado seguían
 * mostrándose en el tablero indefinidamente, incluso varias escenas después
 * de que la partida hubiera seguido su curso -- porque nada, ni siquiera un
 * start_combat nuevo (que lanzaba error si ya había uno activo), lo limpiaba.
 * No comprueba HP aquí (eso ya lo hace el nudge de dm-engine antes de que el
 * DM llegue a llamar a esta tool): este caso de uso solo ejecuta el cierre,
 * igual que EndPlayerTurnUseCase no repite las comprobaciones de quién puede
 * actuar.
 */
@Injectable()
export class EndCombatUseCase {
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}

  async execute(input: EndCombatInput): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    game.endEncounter();
    await this.games.save(game);
  }
}
