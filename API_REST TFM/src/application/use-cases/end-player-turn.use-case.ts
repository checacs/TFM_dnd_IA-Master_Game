import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface EndPlayerTurnInput {
  gameId: string;
  characterId: string;
}

/**
 * Llamado por el DM-IA (tool MCP end_player_turn) cuando ha resuelto POR
 * COMPLETO la acción de un jugador dentro de un combate activo — nunca por
 * SendPlayerActionUseCase de forma automática. Antes, el propio envío de un
 * mensaje del jugador liberaba el turno (Game.releaseTurnAfterAction)
 * incondicionalmente, sin importar si el DM solo había hecho una pregunta
 * aclaratoria ("¿la empuñas a una o dos manos?"); en partidas de 1 jugador
 * eso lo bloqueaba para siempre (actedThisRound ya lo incluía, roundPhase
 * pasaba a 'enemigos', y no había forma de reclamar turno de nuevo). Ahora
 * el cierre del turno depende de que el DM decida explícitamente que ya
 * resolvió la acción, igual que reopenPlayerRound depende de que llame a
 * advance_to_player_round.
 */
@Injectable()
export class EndPlayerTurnUseCase {
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}

  async execute(input: EndPlayerTurnInput): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    game.releaseTurnAfterAction(input.characterId);
    await this.games.save(game);
  }
}
