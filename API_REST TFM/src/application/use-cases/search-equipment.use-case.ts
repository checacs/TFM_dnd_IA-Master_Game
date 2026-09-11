import { Injectable, Inject } from '@nestjs/common';
import { EquipmentRepository, EQUIPMENT_REPOSITORY, EquipmentSearchCriteria } from '../../domain/ports/equipment.repository.port';

export interface EquipmentSearchResult {
  id: string;
  name: string;
  category: string;
  cost: { quantity: number; unit: string } | null;
  damageDice: string | null;
  armorClass: { base: number; dexBonus: boolean; maxBonus: number | null } | null;
}

/**
 * Búsqueda de solo lectura en el catálogo de equipo — el DM-IA la usa para
 * describir con precisión armas/objetos que el personaje lleva o encuentra.
 *
 * Antes solo devolvía id/name/category: el DM no tenía forma de conocer el
 * precio real de un objeto para narrar una compra (buy_item) sin
 * inventárselo, ni su daño/clase de armadura reales. Se añaden cost,
 * damageDice y armorClass -- mismos campos que ya expone get_character_sheet
 * para el equipo que un personaje ya lleva puesto, ahora también disponibles
 * al buscar en el catálogo general (tienda, botín aún no concedido, etc.).
 */
@Injectable()
export class SearchEquipmentUseCase {
  constructor(@Inject(EQUIPMENT_REPOSITORY) private readonly equipment: EquipmentRepository) {}

  async execute(criteria: EquipmentSearchCriteria): Promise<EquipmentSearchResult[]> {
    const found = await this.equipment.search(criteria);
    return found.map((item) => {
      const snapshot = item.toSnapshot();
      return {
        id: item.id,
        name: snapshot.name,
        category: snapshot.category,
        cost: snapshot.cost,
        damageDice: snapshot.damageDice,
        armorClass: snapshot.armorClass,
      };
    });
  }
}
