import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { EquipmentRepository, EQUIPMENT_REPOSITORY } from '../../domain/ports/equipment.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface GrantItemInput {
  characterId: string;
  equipmentId: string;
}

/**
 * El DM-IA concede un objeto del catálogo de equipo a un personaje (tool MCP
 * grant_item) — típicamente cuando la narración implica que el jugador
 * encuentra, recibe o saquea algo (ej. "recoges la daga élfica del cofre").
 * Se comprobó en producción que el DM narraba este tipo de hallazgos sin que
 * existiera ninguna tool para concederlos de verdad: el objeto quedaba solo
 * en el texto, nunca llegaba al inventario real de la ficha (exactamente el
 * mismo tipo de desincronización ya resuelto antes para HP/posición/mapa).
 *
 * A diferencia de AddToInventoryUseCase (que sí exige requestingUserId
 * porque ahí es el propio jugador quien añade algo a su ficha, ej. una
 * compra), aquí no hay comprobación de propiedad: es el DM quien concede el
 * objeto, no el jugador quien lo reclama.
 */
@Injectable()
export class GrantItemUseCase {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(EQUIPMENT_REPOSITORY) private readonly equipment: EquipmentRepository,
  ) {}

  async execute(input: GrantItemInput): Promise<void> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }

    const item = await this.equipment.findById(input.equipmentId);
    if (!item) {
      throw new DomainError('Ese equipo no existe en el catálogo');
    }

    character.addToInventory({ equipmentId: item.id, name: item.toSnapshot().name });
    await this.characters.save(character);
  }
}
