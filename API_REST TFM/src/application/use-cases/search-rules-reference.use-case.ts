import { Injectable, Inject } from '@nestjs/common';
import {
  RulesReferenceRepository,
  RULES_REFERENCE_REPOSITORY,
  RulesReferenceSearchCriteria,
} from '../../domain/ports/rules-reference.repository.port';

export interface RulesReferenceSearchResult {
  id: string;
  kind: string;
  name: string;
  description: string;
}

/**
 * Búsqueda de solo lectura en el catálogo unificado de condiciones,
 * habilidades y tipos de daño — el DM-IA lo consulta para narrar con
 * precisión el efecto exacto de una condición, en vez de inventarlo.
 */
@Injectable()
export class SearchRulesReferenceUseCase {
  constructor(@Inject(RULES_REFERENCE_REPOSITORY) private readonly refs: RulesReferenceRepository) {}

  async execute(criteria: RulesReferenceSearchCriteria): Promise<RulesReferenceSearchResult[]> {
    const found = await this.refs.search(criteria);
    return found.map((ref) => {
      const snapshot = ref.toSnapshot();
      return { id: ref.id, kind: snapshot.kind, name: snapshot.name, description: snapshot.description };
    });
  }
}
