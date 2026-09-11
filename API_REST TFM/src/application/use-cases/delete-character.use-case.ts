import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DomainError } from '../../domain/errors/domain-error';
import { removeCharacterFromItsGame } from './remove-character-from-game';

export interface DeleteCharacterInput {
  characterId: string;
}

/**
 * Borrado individual de un personaje desde el panel de administración de
 * usuarios (docs/10, sección 6bis). Solo lo invoca un admin (AdminGuard en
 * CharactersController) — no comprueba aquí quién la pide, mismo patrón que
 * DeleteGameUseCase.
 *
 * Además de borrar el documento, lo saca de su partida (Game.removePlayer):
 * antes quedaba como jugador "fantasma" en Game.players y bloqueaba la ronda
 * de combate (nadie podía reclamar su turno) y la capitanía.
 */
@Injectable()
export class DeleteCharacterUseCase {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
  ) {}

  async execute(input: DeleteCharacterInput): Promise<void> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }

    await removeCharacterFromItsGame(this.games, character.toSnapshot().gameId, character.id);
    await this.characters.deleteById(character.id);
  }
}
