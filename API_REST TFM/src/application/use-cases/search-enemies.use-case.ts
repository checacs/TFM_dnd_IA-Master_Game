import { Injectable, Inject } from '@nestjs/common';
import { EnemyRepository, ENEMY_REPOSITORY, EnemySearchCriteria } from '../../domain/ports/enemy.repository.port';

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
 */
@Injectable()
export class SearchEnemiesUseCase {
  constructor(@Inject(ENEMY_REPOSITORY) private readonly enemies: EnemyRepository) {}

  async execute(criteria: EnemySearchCriteria): Promise<EnemySearchResult[]> {
    const found = await this.enemies.search(criteria);
    return found.map((enemy) => {
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
