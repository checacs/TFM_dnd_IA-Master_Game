import { RulesReferenceRepository, RulesReferenceSearchCriteria } from '../../domain/ports/rules-reference.repository.port';
import { RulesReference } from '../../domain/entities/rules-reference.entity';
import { SearchRulesReferenceUseCase } from './search-rules-reference.use-case';

class FakeRulesReferenceRepository implements RulesReferenceRepository {
  constructor(private readonly refs: RulesReference[] = []) {}
  async findById(id: string): Promise<RulesReference | null> {
    return this.refs.find((r) => r.id === id) ?? null;
  }
  async search(criteria: RulesReferenceSearchCriteria): Promise<RulesReference[]> {
    return this.refs.filter((r) => !criteria.kind || r.toSnapshot().kind === criteria.kind);
  }
}

describe('SearchRulesReferenceUseCase', () => {
  it('filtra por kind', async () => {
    const blinded = RulesReference.create({ kind: 'condition', name: 'Blinded', description: '...', abilityScore: null, relatedSkills: null });
    const acrobatics = RulesReference.create({ kind: 'skill', name: 'Acrobatics', description: '...', abilityScore: 'dex', relatedSkills: null });
    const repo = new FakeRulesReferenceRepository([blinded, acrobatics]);
    const useCase = new SearchRulesReferenceUseCase(repo);

    const results = await useCase.execute({ kind: 'condition' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Blinded');
  });
});
