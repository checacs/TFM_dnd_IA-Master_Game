import { Injectable, Inject } from '@nestjs/common';
import { MapRepository, MAP_REPOSITORY, MapSearchCriteria } from '../../domain/ports/map.repository.port';
import { Shuffler, SHUFFLER } from '../../domain/ports/shuffler.port';
import { BattleMap } from '../../domain/entities/battle-map.entity';

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
 *
 * El repositorio (Mongo) devuelve los resultados en orden natural (esencialmente
 * orden de inserción), así que sin reordenar aquí el DM-IA acababa eligiendo
 * siempre el mismo mapa para las mismas etiquetas (ej. "bosque" -> siempre el
 * mismo, en partidas distintas). Por eso: 1) se prioriza por nº de etiquetas
 * coincidentes (más relevante primero), y 2) se desordena con el Shuffler
 * inyectado para variar el orden entre mapas igual de relevantes.
 */
@Injectable()
export class SearchMapsUseCase {
  constructor(
    @Inject(MAP_REPOSITORY) private readonly maps: MapRepository,
    @Inject(SHUFFLER) private readonly shuffler: Shuffler,
  ) {}

  async execute(criteria: MapSearchCriteria): Promise<MapSearchResult[]> {
    let found = await this.maps.search(criteria);
    const tags = criteria.tags ?? [];

    // NUNCA devolver una lista vacía si el catálogo tiene mapas: se comprobó
    // en partida real que la IA inventaba una localización ("Juncos
    // susurrantes") ANTES de mirar el catálogo, buscaba etiquetas que no
    // existen en ningún mapa ('juncos'), recibía [] y la escena se quedaba
    // sin mapa en el tablero. Devolver el catálogo completo (barajado)
    // fuerza el flujo "mapa primero, historia después": la IA siempre tiene
    // mapas REALES entre los que elegir y adapta su narración al que escoja,
    // en vez de quedarse sin opciones por haber imaginado un sitio que no
    // está mapeado.
    let usedFallback = false;
    if (found.length === 0 && tags.length > 0) {
      found = await this.maps.search({});
      usedFallback = true;
    }

    const shuffled = this.shuffler.shuffle(found);
    const ordered =
      tags.length === 0 || usedFallback
        ? shuffled
        : [...shuffled].sort((a, b) => this.matchCount(b, tags) - this.matchCount(a, tags));

    return ordered.map((map) => {
      const snapshot = map.toSnapshot();
      return { id: map.id, name: snapshot.name, description: snapshot.description };
    });
  }

  private matchCount(map: BattleMap, tags: string[]): number {
    const mapTags = map.toSnapshot().tags;
    return tags.filter((tag) => mapTags.includes(tag)).length;
  }
}
