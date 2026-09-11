import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { GameProps } from '../../domain/entities/game.entity';
import { DomainError } from '../../domain/errors/domain-error';

export interface GetGameStateInput {
  gameId: string;
}

/**
 * Consulta de solo lectura para fundamentar la narración del DM-IA
 * (docs/05-motor-ia-dm-deepseek.md, sección 6) — nunca se infiere el estado
 * de la partida a partir de la conversación, siempre se lee de aquí.
 */
@Injectable()
export class GetGameStateUseCase {
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}

  async execute(input: GetGameStateInput): Promise<GameProps> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }
    return game.toSnapshot();
  }
}
