import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface RemoveConditionInput {
  gameId: string;
  participantId: string;
  conditionIndex: string;
}

/** El DM-IA quita una condición que ya expiró o fue curada. Idempotente: no falla si no la tenía. */
@Injectable()
export class RemoveConditionUseCase {
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}

  async execute(input: RemoveConditionInput): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    game.removeCondition(input.participantId, input.conditionIndex);
    await this.games.save(game);
  }
}
