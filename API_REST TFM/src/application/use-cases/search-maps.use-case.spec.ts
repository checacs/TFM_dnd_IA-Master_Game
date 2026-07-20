import { MapRepository, MapSearchCriteria } from '../../domain/ports/map.repository.port';
import { BattleMap } from '../../domain/entities/battle-map.entity';
import { SearchMapsUseCase } from './search-maps.use-case';

class FakeMapRepository implements MapRepository {
  constructor(private readonly maps: BattleMap[] = []) {}
  async findById(id: string): Promise<BattleMap | null> {
    return this.maps.find((m) => m.id === id) ?? null;
  }
  async search(criteria: MapSearchCriteria): Promise<BattleMap[]> {
    return this.maps.filter((m) => {
      const snapshot = m.toSnapshot();
      return !criteria.tags?.length || criteria.tags.some((tag) => snapshot.tags.includes(tag));
    });
  }
}

function buildTaberna() {
  return BattleMap.create({
    name: 'Taberna del jabalí', description: 'Sala principal con mesas y chimenea.',
    tags: ['interior', 'taberna'], rows: 10, cols: 14, imageUrl: '/maps/taberna-jabali.png',
  });
}

function buildBosque() {
  return BattleMap.create({
    name: 'Claro del bosque', description: 'Un claro rodeado de árboles.',
    tags: ['exterior', 'bosque'], rows: 12, cols: 12, imageUrl: '/maps/claro-bosque.png',
  });
}

describe('SearchMapsUseCase', () => {
  it('filtra por etiquetas', async () => {
    const repo = new FakeMapRepository([buildTaberna(), buildBosque()]);
    const useCase = new SearchMapsUseCase(repo);

    const results = await useCase.execute({ tags: ['bosque'] });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Claro del bosque');
  });

  it('devuelve solo los campos relevantes para elegir, no las dimensiones ni la imagen', async () => {
    const repo = new FakeMapRepository([buildTaberna()]);
    const useCase = new SearchMapsUseCase(repo);

    const [result] = await useCase.execute({});

    expect(result).toEqual({
      id: expect.any(String),
      name: 'Taberna del jabalí',
      description: 'Sala principal con mesas y chimenea.',
    });
  });
});
