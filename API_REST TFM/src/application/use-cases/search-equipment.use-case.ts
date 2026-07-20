import { Injectable, Inject } from '@nestjs/common';
import { EquipmentRepository, EQUIPMENT_REPOSITORY, EquipmentSearchCriteria } from '../../domain/ports/equipment.repository.port';

export interface EquipmentSearchResult {
  id: string;
  name: string;
  category: string;
}

/**
 * Búsqueda de solo lectura en el catálogo de equipo — el DM-IA la usa para
 * describir con precisión armas/objetos que el personaje lleva o encuentra.
 */
@Injectable()
export class SearchEquipmentUseCase {
  constructor(@Inject(EQUIPMENT_REPOSITORY) private readonly equipment: EquipmentRepository) {}

  async execute(criteria: EquipmentSearchCriteria): Promise<EquipmentSearchResult[]> {
    const found = await this.equipment.search(criteria);
    return found.map((item) => {
      const snapshot = item.toSnapshot();
      return { id: item.id, name: snapshot.name, category: snapshot.category };
    });
  }
}
