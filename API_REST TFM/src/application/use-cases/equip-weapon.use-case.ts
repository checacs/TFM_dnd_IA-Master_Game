import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface EquipWeaponInput {
  characterId: string;
  requestingUserId: string;
  equipmentId: string;
}

@Injectable()
export class EquipWeaponUseCase {
  constructor(@Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository) {}

  async execute(input: EquipWeaponInput): Promise<void> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }
    if (character.toSnapshot().ownerId !== input.requestingUserId) {
      throw new DomainError('No puedes modificar un personaje que no es tuyo');
    }

    character.equipWeapon(input.equipmentId);
    await this.characters.save(character);
  }
}
