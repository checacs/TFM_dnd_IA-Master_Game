import { MapRepository, MapSearchCriteria } from '../../domain/ports/map.repository.port';
import { Shuffler } from '../../domain/ports/shuffler.port';
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

/** No desordena — para tests que verifican otra cosa (filtrado, scoring) sin ruido de aleatoriedad. */
class IdentityShuffler implements Shuffler {
  shuffle<T>(items: T[]): T[] {
    return items;
  }
}

/** Desordena de forma predecible (invierte) — para comprobar que el Shuffler inyectado SÍ se usa. */
class ReverseShuffler implements Shuffler {
  shuffle<T>(items: T[]): T[] {
    return [...items].reverse();
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
    const useCase = new SearchMapsUseCase(repo, new IdentityShuffler());

    const results = await useCase.execute({ tags: ['bosque'] });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Claro del bosque');
  });

  it('devuelve solo los campos relevantes para elegir, no las dimensiones ni la imagen', async () => {
    const repo = new FakeMapRepository([buildTaberna()]);
    const useCase = new SearchMapsUseCase(repo, new IdentityShuffler());

    const [result] = await useCase.execute({});

    expect(result).toEqual({
      id: expect.any(String),
      name: 'Taberna del jabalí',
      description: 'Sala principal con mesas y chimenea.',
    });
  });

  describe('variedad de mapas (evitar repetir siempre el mismo)', () => {
    function buildMap(name: string, tags: string[]) {
      return BattleMap.create({
        name,
        description: `Descripción de ${name}.`,
        tags,
        rows: 10,
        cols: 10,
        imageUrl: `/maps/${name}.png`,
      });
    }

    it('prioriza los mapas con mas etiquetas coincidentes por encima de los que solo coinciden en una', async () => {
      // La cueva coincide en UNA etiqueta ('bosque'); el claro, en DOS
      // ('bosque' y 'ruinas'). Antes la cueva no compartía NINGUNA etiqueta
      // con la búsqueda, así que el propio repo (real y fake filtran por
      // "al menos una coincidencia") la excluía antes de llegar al scoring y
      // el test nunca ejercitaba de verdad la priorización que da título al caso.
      const pocoRelevante = buildMap('Cueva genérica', ['exterior', 'cueva', 'bosque']);
      const muyRelevante = buildMap('Claro sagrado del bosque', ['exterior', 'bosque', 'ruinas']);
      // Con IdentityShuffler el repo ya los devuelve en este orden (el "peor" primero) --
      // si el use case no reordenase por relevancia, el resultado se quedaría igual.
      const repo = new FakeMapRepository([pocoRelevante, muyRelevante]);
      const useCase = new SearchMapsUseCase(repo, new IdentityShuffler());

      const results = await useCase.execute({ tags: ['bosque', 'ruinas'] });

      expect(results.map((r) => r.name)).toEqual(['Claro sagrado del bosque', 'Cueva genérica']);
    });

    it('usa el Shuffler inyectado para variar el orden entre mapas con la misma relevancia', async () => {
      const bosqueA = buildMap('Bosque A', ['bosque']);
      const bosqueB = buildMap('Bosque B', ['bosque']);
      const repo = new FakeMapRepository([bosqueA, bosqueB]);
      const useCase = new SearchMapsUseCase(repo, new ReverseShuffler());

      const results = await useCase.execute({ tags: ['bosque'] });

      // ReverseShuffler invierte el orden que devuelve el repo -- si el use case
      // ignorase el Shuffler (como antes de este cambio), el orden sería A, B siempre.
      expect(results.map((r) => r.name)).toEqual(['Bosque B', 'Bosque A']);
    });

    it('tambien desordena cuando no se piden etiquetas', async () => {
      const a = buildMap('Mapa A', []);
      const b = buildMap('Mapa B', []);
      const repo = new FakeMapRepository([a, b]);
      const useCase = new SearchMapsUseCase(repo, new ReverseShuffler());

      const results = await useCase.execute({});

      expect(results.map((r) => r.name)).toEqual(['Mapa B', 'Mapa A']);
    });
  });
});
