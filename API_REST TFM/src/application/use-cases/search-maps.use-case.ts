import { Injectable, Inject } from '@nestjs/common';
import { MapRepository, MAP_REPOSITORY, MapSearchCriteria } from '../../domain/ports/map.repository.port';

export interface MapSearchResult {
  id: string;
  name: string;
  description: string;
}

/**
 * Búsqueda de solo lectura en el catálogo de mapas de combate, para que el
 * DM-IA elija uno coherente con la escena — mismo patrón que
 * SearchEnemiesUseCase. Devuelve solo lo necesario para decidir, no las
 * dimensiones ni la imagen (eso se resuelve al aplicar el mapa, no al elegirlo).
 */
@Injectable()
export class SearchMapsUseCase {
  constructor(@Inject(MAP_REPOSITORY) private readonly maps: MapRepository) {}

  async execute(criteria: MapSearchCriteria): Promise<MapSearchResult[]> {
    const found = await this.maps.search(criteria);
    return found.map((map) => {
      const snapshot = map.toSnapshot();
      return { id: map.id, name: snapshot.name, description: snapshot.description };
    });
  }
}
