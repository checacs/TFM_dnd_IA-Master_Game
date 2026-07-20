import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface AdvanceRoundInput {
  gameId: string;
}

/**
 * Llamado por el DM-IA (tool MCP advance_to_player_round) tras resolver la
 * fase de enemigos de la ronda: reabre la ronda de jugadores (ver
 * Game.reopenPlayerRound). No la dispara ningún jugador directamente.
 */
@Injectable()
export class AdvanceRoundUseCase {
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}

  async execute(input: AdvanceRoundInput): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    game.reopenPlayerRound();
    await this.games.save(game);
  }
}
