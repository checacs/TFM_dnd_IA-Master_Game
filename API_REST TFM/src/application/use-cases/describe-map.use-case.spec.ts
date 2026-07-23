import { MapRepository, MapSearchCriteria } from '../../domain/ports/map.repository.port';
import { BattleMap } from '../../domain/entities/battle-map.entity';
import { DescribeMapUseCase } from './describe-map.use-case';

class FakeMapRepository implements MapRepository {
  constructor(private readonly maps: BattleMap[] = []) {}
  async findById(id: string): Promise<BattleMap | null> {
    return this.maps.find((m) => m.id === id) ?? null;
  }
  async search(_criteria: MapSearchCriteria): Promise<BattleMap[]> {
    return this.maps;
  }
}

function buildPantano() {
  return BattleMap.create({
    name: 'Guarida del Rey del Pantano',
    description: 'Complejo de cuevas y ruinas anegadas en un pantano.',
    tags: ['exterior', 'pantano'],
    rows: 30,
    cols: 20,
    imageUrl: '/maps/battleMap19-Pantano.png',
    zones: [
      { name: 'Bosque de Árboles Muertos', cells: [{ rowStart: 14, rowEnd: 17, colStart: 0, colEnd: 7 }] },
      { name: 'Vestíbulo de Entrada Sur', cells: [{ rowStart: 24, rowEnd: 29, colStart: 3, colEnd: 17 }] },
    ],
  });
}

describe('DescribeMapUseCase', () => {
  it('incluye las ZONAS del mapa con sus celdas, para que el DM-IA pueda usar zoneName y coordenadas reales en place_participant', async () => {
    // Bug real de producción: describe_map devolvía solo nombre/descripción/
    // dimensiones, SIN las zonas -- el DM-IA no tenía forma de saber ni los
    // nombres exactos de las salas ni sus rangos de celdas, así que se
    // inventaba zoneNames aproximados ("bosque de árboles muertos", extraído
    // del texto de la descripción) con coordenadas al azar (row 0, col 15),
    // y place_participant los rechazaba una y otra vez, quemando iteraciones
    // del turno hasta reventar el límite.
    const repo = new FakeMapRepository([buildPantano()]);
    const useCase = new DescribeMapUseCase(repo);
    const map = (await repo.search({}))[0];

    const result = await useCase.execute({ mapId: map.id });

    expect(result.zones).toEqual([
      { name: 'Bosque de Árboles Muertos', cells: [{ rowStart: 14, rowEnd: 17, colStart: 0, colEnd: 7 }] },
      { name: 'Vestíbulo de Entrada Sur', cells: [{ rowStart: 24, rowEnd: 29, colStart: 3, colEnd: 17 }] },
    ]);
  });

  it('devuelve los datos básicos del mapa (nombre, descripción, tags, dimensiones)', async () => {
    const repo = new FakeMapRepository([buildPantano()]);
    const useCase = new DescribeMapUseCase(repo);
    const map = (await repo.search({}))[0];

    const result = await useCase.execute({ mapId: map.id });

    expect(result).toEqual(
      expect.objectContaining({
        mapId: map.id,
        name: 'Guarida del Rey del Pantano',
        tags: ['exterior', 'pantano'],
        rows: 30,
        cols: 20,
      }),
    );
  });

  it('lanza DomainError si el mapa no existe en el catálogo', async () => {
    const repo = new FakeMapRepository([]);
    const useCase = new DescribeMapUseCase(repo);

    await expect(useCase.execute({ mapId: 'no-existe' })).rejects.toThrow();
  });
});
