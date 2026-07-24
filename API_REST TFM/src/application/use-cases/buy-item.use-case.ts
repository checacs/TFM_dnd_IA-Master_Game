import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { EquipmentRepository, EQUIPMENT_REPOSITORY } from '../../domain/ports/equipment.repository.port';
import { DomainError } from '../../domain/errors/domain-error';
import { equipmentCostToMoney } from '../../domain/value-objects/money';

export interface BuyItemInput {
  characterId: string;
  equipmentId: string;
}

/**
 * El DM-IA resuelve una compra que el jugador pide narrativamente (tool MCP
 * buy_item) -- ej. "quiero comprar la espada corta que hay en el mostrador".
 * A diferencia de GrantItemUseCase (botín gratuito, sin coste), aquí se
 * descuenta el precio REAL del catálogo (equipment.cost) del dinero del
 * personaje antes de añadir el objeto -- si no le llega el dinero,
 * Character.spendCurrency lanza DomainError y la compra no se completa (ni
 * se descuenta nada ni se añade el objeto), para que el DM pueda narrar que
 * no le alcanza sin dejar el estado a medias.
 */
@Injectable()
export class BuyItemUseCase {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(EQUIPMENT_REPOSITORY) private readonly equipment: EquipmentRepository,
  ) {}

  async execute(input: BuyItemInput): Promise<void> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }

    const item = await this.equipment.findById(input.equipmentId);
    if (!item) {
      throw new DomainError('Ese equipo no existe en el catálogo');
    }
    const snapshot = item.toSnapshot();
    if (!snapshot.cost) {
      throw new DomainError('Ese objeto no tiene precio definido en el catálogo, no se puede comprar');
    }

    const cost = equipmentCostToMoney(snapshot.cost);
    character.spendCurrency(cost);
    character.addToInventory({ equipmentId: item.id, name: snapshot.name });
    await this.characters.save(character);
  }
}
