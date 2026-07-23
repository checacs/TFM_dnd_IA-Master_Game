import { Injectable, Inject } from '@nestjs/common';
import { EnemyRepository, ENEMY_REPOSITORY, EnemySearchCriteria } from '../../domain/ports/enemy.repository.port';
import { Shuffler, SHUFFLER } from '../../domain/ports/shuffler.port';

export interface EnemySearchResult {
  id: string;
  name: string;
  description: string;
  challengeRating: number;
}

/**
 * Búsqueda de solo lectura en el catálogo maestro de enemigos, para que el
 * DM-IA elija un encuentro coherente sin inventar estadísticas
 * (docs/04-servidor-mcp.md, tool get_enemy_catalog). Devuelve solo los
 * campos que ayudan a decidir, no el bloque de estadísticas completo.
 *
 * CASO REAL detectado en partida: el DM narró una sala con tres "hongos
 * ambulantes" inventados (Honguito Azul, Hongazo, Micelio Errante) ANTES de
 * consultar el catálogo. Al intentar iniciar el combate de verdad, buscó por
 * etiquetas ("hongos"+"cueva", "planta"+"hongo"+"subterraneo", "bestia" con
 * varias CR máximas) y las CUATRO búsquedas devolvieron [] -- el catálogo no
 * tiene monstruos-planta con esas etiquetas exactas. Tras cuatro intentos
 * fallidos, el DM acabó llamando a get_enemy_catalog sin filtro alguno y
 * escogiendo al azar de la lista completa (cientos de monstruos): un Violet
 * Fungus (que sí es un hongo, coincidencia parcial), pero también un Giant
 * Rat y un Giant Bat -- ninguno de los dos es un hongo. El jugador vio tres
 * "hongos ambulantes" en la narración pero luchó contra una rata y un
 * murciélago de verdad, y cuando pidió atacar al "Micelio Errante" (un
 * nombre que no existe en el combate real), el sistema tuvo que adivinar a
 * qué enemigo real se refería.
 *
 * Mismo principio que SearchMapsUseCase ("mapa primero, historia después"):
 * NUNCA devolver una lista vacía si el catálogo tiene enemigos. Así, aunque
 * la búsqueda por etiquetas no encuentre nada, el DM siempre tiene una lista
 * de la que elegir en su PRIMERA consulta (no en la quinta), y puede
 * construir su narración a partir de los enemigos reales devueltos en vez de
 * inventar nombres y flavor antes de mirar el catálogo.
 */
@Injectable()
export class SearchEnemiesUseCase {
  constructor(
    @Inject(ENEMY_REPOSITORY) private readonly enemies: EnemyRepository,
    @Inject(SHUFFLER) private readonly shuffler: Shuffler,
  ) {}

  async execute(criteria: EnemySearchCriteria): Promise<EnemySearchResult[]> {
    let found = await this.enemies.search(criteria);
    const hasFilters = (criteria.tags?.length ?? 0) > 0 || criteria.maxChallengeRating !== undefined;

    if (found.length === 0 && hasFilters) {
      found = await this.enemies.search({});
    }

    const shuffled = this.shuffler.shuffle(found);
    return shuffled.map((enemy) => {
      const snapshot = enemy.toSnapshot();
      return {
        id: enemy.id,
        name: snapshot.name,
        description: snapshot.description,
        challengeRating: snapshot.challengeRating,
      };
    });
  }
}
