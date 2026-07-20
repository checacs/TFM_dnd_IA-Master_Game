import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { AttributeKey } from '../../domain/entities/character.entity';
import { DomainError } from '../../domain/errors/domain-error';

export interface LevelUpInput {
  characterId: string;
  requestingUserId: string;
  attribute: AttributeKey;
}

/**
 * Asigna un punto de habilidad al subir de nivel (HU9, app móvil).
 *
 * Incluye la comprobación de propiedad que en el diseño original del paso 3
 * no existía — se detectó como hueco de seguridad retroactivo al diseñar la
 * autenticación (docs/10-autenticacion-y-lobby.md, sección 7): sin esto,
 * cualquier usuario autenticado podía subir de nivel la ficha de otro.
 */
@Injectable()
export class LevelUpUseCase {
  constructor(@Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository) {}

  async execute(input: LevelUpInput): Promise<void> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }

    if (character.toSnapshot().ownerId !== input.requestingUserId) {
      throw new DomainError('No puedes modificar un personaje que no es tuyo');
    }

    character.assignSkillPoint(input.attribute);
    await this.characters.save(character);
  }
}
