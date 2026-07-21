import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { MagicItemRepository, MAGIC_ITEM_REPOSITORY } from '../../domain/ports/magic-item.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface GrantMagicItemInput {
  characterId: string;
  magicItemId: string;
}

/**
 * El DM-IA concede un objeto MÁGICO del catálogo (get_magic_items) a un
 * personaje (tool MCP grant_magic_item) -- mismo hueco que ya resolvió
 * GrantItemUseCase para el equipo normal (arma/armadura/objeto de
 * aventurero), pero nunca se extendió a objetos mágicos: get_magic_items
 * solo servía para CONSULTAR el catálogo (evitar inventar su efecto), sin
 * ninguna tool que lo concediera de verdad al inventario. Como con
 * grant_item, no hay comprobación de propiedad: es el DM quien concede el
 * objeto, no el jugador quien lo reclama.
 *
 * Reutiliza el mismo InventoryItem que el equipo normal (campo equipmentId
 * con el id del objeto mágico, no de la colección `equipment`) en vez de
 * introducir un tipo de inventario paralelo: ningún caso de uso revalida
 * ese id contra el catálogo de equipo después de concederlo (get-character
 * solo lo devuelve tal cual), así que no hay riesgo de colisión funcional --
 * es una simplificación deliberada para no bifurcar el modelo de inventario
 * en dos colecciones distintas por un campo que hoy es solo id+nombre para
 * mostrar en la ficha. Los objetos mágicos no se pueden equipar como arma
 * (equipWeapon exige que el id venga del catálogo de equipo real).
 */
@Injectable()
export class GrantMagicItemUseCase {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(MAGIC_ITEM_REPOSITORY) private readonly magicItems: MagicItemRepository,
  ) {}

  async execute(input: GrantMagicItemInput): Promise<void> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }

    const item = await this.magicItems.findById(input.magicItemId);
    if (!item) {
      throw new DomainError('Ese objeto mágico no existe en el catálogo');
    }

    character.addToInventory({ equipmentId: item.id, name: item.toSnapshot().name });
    await this.characters.save(character);
  }
}
