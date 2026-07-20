import { InMemoryMapRepository } from './in-memory-map.repository';
import { BattleMap } from '../../../domain/entities/battle-map.entity';

function buildTaberna() {
  return BattleMap.create({
    name: 'Taberna del jabalí', description: '', tags: ['interior', 'taberna'],
    rows: 10, cols: 14, imageUrl: '/maps/taberna-jabali.png',
  });
}

describe('InMemoryMapRepository', () => {
  it('devuelve exactamente el estado guardado al recuperarlo (ida y vuelta)', async () => {
    const repo = new InMemoryMapRepository();
    const map = buildTaberna();

    await repo.save(map);
    const recovered = await repo.findById(map.id);

    expect(recovered?.toSnapshot()).toEqual(map.toSnapshot());
  });

  it('search filtra por etiquetas', async () => {
    const repo = new InMemoryMapRepository();
    await repo.save(buildTaberna());

    expect(await repo.search({ tags: ['taberna'] })).toHaveLength(1);
    expect(await repo.search({ tags: ['bosque'] })).toHaveLength(0);
  });
});
