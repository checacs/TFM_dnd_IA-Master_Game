import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { EquipmentRepository, EQUIPMENT_REPOSITORY } from '../../domain/ports/equipment.repository.port';
import { MagicItemRepository, MAGIC_ITEM_REPOSITORY } from '../../domain/ports/magic-item.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface EquipItemInput {
  characterId: string;
  requestingUserId: string;
  equipmentId: string;
}

/**
 * Punto de entrada único para "equipar" cualquier objeto del inventario,
 * usado por el endpoint REST POST /characters/:id/equip (móvil) — decide POR
 * CATEGORÍA REAL del catálogo qué significa "equipar" ese objeto en concreto,
 * en vez de obligar al cliente a saber de antemano si es un arma, una
 * armadura o un objeto mágico:
 *  - "Weapon" -> Character.equipWeapon (ya usado de verdad por
 *    ResolvePlayerAttackUseCase para calcular el daño real).
 *  - "Armor" -> Character.equipArmor, que recalcula la CA real a partir de
 *    armor_class del catálogo (a petición explícita del usuario: equipar
 *    armadura tiene que afectar de verdad al combate, no quedar solo anotado).
 *  - Cualquier otra cosa que no esté en el catálogo de equipo normal se busca
 *    en el catálogo de objetos MÁGICOS (anillos, amuletos, varitas...): se
 *    marca como equipada (equippedAccessoryId) pero sin efecto mecánico
 *    todavía, porque ese catálogo no modela bonificadores reales -- ver
 *    comentario de equippedAccessoryId en character.entity.ts.
 */
@Injectable()
export class EquipItemUseCase {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(EQUIPMENT_REPOSITORY) private readonly equipment: EquipmentRepository,
    @Inject(MAGIC_ITEM_REPOSITORY) private readonly magicItems: MagicItemRepository,
  ) {}

  async execute(input: EquipItemInput): Promise<void> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }
    if (character.toSnapshot().ownerId !== input.requestingUserId) {
      throw new DomainError('No puedes modificar un personaje que no es tuyo');
    }

    const item = await this.equipment.findById(input.equipmentId);
    if (item) {
      const snapshot = item.toSnapshot();
      if (snapshot.category === 'Weapon') {
        character.equipWeapon(input.equipmentId);
      } else if (snapshot.category === 'Armor') {
        if (!snapshot.armorClass) {
          throw new DomainError('Esta armadura no tiene datos de clase de armadura en el catálogo');
        }
        character.equipArmor(input.equipmentId, snapshot.armorClass);
      } else {
        throw new DomainError('Solo se pueden equipar armas o armaduras del catálogo de equipo');
      }
      await this.characters.save(character);
      return;
    }

    const magicItem = await this.magicItems.findById(input.equipmentId);
    if (magicItem) {
      character.equipAccessory(input.equipmentId);
      await this.characters.save(character);
      return;
    }

    throw new DomainError('Ese objeto no existe en ningún catálogo');
  }
}
