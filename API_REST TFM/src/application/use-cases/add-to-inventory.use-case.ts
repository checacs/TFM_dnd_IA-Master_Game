import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { EquipmentRepository, EQUIPMENT_REPOSITORY } from '../../domain/ports/equipment.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface AddToInventoryInput {
  characterId: string;
  requestingUserId: string;
  equipmentId: string;
}

/**
 * El jugador añade a su inventario un objeto del catálogo de equipo (docs,
 * paso de integración mecánica). Comprobación de propiedad igual que en
 * LevelUpUseCase — nadie puede tocar el inventario de un personaje que no es suyo.
 */
@Injectable()
export class AddToInventoryUseCase {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(EQUIPMENT_REPOSITORY) private readonly equipment: EquipmentRepository,
  ) {}

  async execute(input: AddToInventoryInput): Promise<void> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }
    if (character.toSnapshot().ownerId !== input.requestingUserId) {
      throw new DomainError('No puedes modificar un personaje que no es tuyo');
    }

    const item = await this.equipment.findById(input.equipmentId);
    if (!item) {
      throw new DomainError('Ese equipo no existe en el catálogo');
    }

    character.addToInventory({ equipmentId: item.id, name: item.toSnapshot().name });
    await this.characters.save(character);
  }
}
