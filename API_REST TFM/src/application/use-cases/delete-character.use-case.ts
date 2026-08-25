import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface DeleteCharacterInput {
  characterId: string;
}

/**
 * Borrado individual de un personaje desde el panel de administración de
 * usuarios (docs/10, sección 6bis). Solo lo invoca un admin (AdminGuard en
 * CharactersController) — no comprueba aquí quién la pide, mismo patrón que
 * DeleteGameUseCase.
 */
@Injectable()
export class DeleteCharacterUseCase {
  constructor(@Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository) {}

  async execute(input: DeleteCharacterInput): Promise<void> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }

    await this.characters.deleteById(character.id);
  }
}
