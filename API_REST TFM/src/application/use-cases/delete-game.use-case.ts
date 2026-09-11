import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface DeleteGameInput {
  gameId: string;
}

/**
 * Borra una partida y, en cascada, los personajes que le pertenecen (gameId)
 * para no dejarlos huérfanos. Solo la invoca un admin (AdminGuard en
 * GamesController) — no comprueba aquí quién la pide, igual que
 * createAccount/changePassword en AuthController.
 */
@Injectable()
export class DeleteGameUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
  ) {}

  async execute(input: DeleteGameInput): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    await this.characters.deleteByGameId(input.gameId);
    await this.games.deleteById(input.gameId);
  }
}
