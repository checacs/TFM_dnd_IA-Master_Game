import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface ClaimTurnInput {
  gameId: string;
  requestingUserId: string;
  characterId: string;
}

/**
 * "Mi turno" desde el móvil: el jugador reclama el candado de turno de la
 * ronda de jugadores en curso (ver Game.claimTurn). Solo tiene sentido en
 * combate — fuera de combate no hay candado que reclamar.
 */
@Injectable()
export class ClaimTurnUseCase {
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}

  async execute(input: ClaimTurnInput): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const owns = game
      .toSnapshot()
      .players.some((p) => p.userId === input.requestingUserId && p.characterId === input.characterId);
    if (!owns) {
      throw new DomainError('Ese personaje no te pertenece en esta partida');
    }

    game.claimTurn(input.characterId);
    await this.games.save(game);
  }
}
