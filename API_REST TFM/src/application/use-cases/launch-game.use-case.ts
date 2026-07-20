import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface LaunchGameInput {
  gameId: string;
  requestingUserId: string;
}

/**
 * Arranca la sesión de juego (docs/10). Deliberadamente NO se llama
 * StartGameUseCase — para no confundirlo con la tool MCP `start_combat`,
 * que resuelve un combate dentro de una partida ya lanzada.
 */
@Injectable()
export class LaunchGameUseCase {
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}

  async execute(input: LaunchGameInput): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    game.launch(input.requestingUserId);
    await this.games.save(game);
  }
}
