import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface AssignCaptainInput {
  gameId: string;
  requestingUserId: string;
  targetUserId: string;
}

/**
 * Reasigna quién es el capitán (el único que puede escribir al DM fuera de
 * combate, ver SendPlayerActionUseCase) — puede llamarlo el host o el propio
 * capitán actual, la regla exacta vive en Game.assignCaptain.
 */
@Injectable()
export class AssignCaptainUseCase {
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}

  async execute(input: AssignCaptainInput): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    game.assignCaptain(input.requestingUserId, input.targetUserId);
    await this.games.save(game);
  }
}
