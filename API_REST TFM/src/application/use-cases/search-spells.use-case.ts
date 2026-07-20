import { Injectable, Inject } from '@nestjs/common';
import { SpellRepository, SPELL_REPOSITORY, SpellSearchCriteria } from '../../domain/ports/spell.repository.port';

export interface SpellSearchResult {
  id: string;
  name: string;
  level: number;
  school: string;
}

/**
 * Búsqueda de solo lectura en el catálogo de hechizos, para que el DM-IA
 * elija uno coherente con la clase/nivel del personaje — mismo patrón que
 * SearchEnemiesUseCase/SearchMapsUseCase.
 */
@Injectable()
export class SearchSpellsUseCase {
  constructor(@Inject(SPELL_REPOSITORY) private readonly spells: SpellRepository) {}

  async execute(criteria: SpellSearchCriteria): Promise<SpellSearchResult[]> {
    const found = await this.spells.search(criteria);
    return found.map((spell) => {
      const snapshot = spell.toSnapshot();
      return { id: spell.id, name: snapshot.name, level: snapshot.level, school: snapshot.school };
    });
  }
}
