import { InMemoryEnemyRepository } from './in-memory-enemy.repository';
import { Enemy } from '../../../domain/entities/enemy.entity';

function buildGoblin() {
  return Enemy.create({
    name: 'Goblin explorador', description: '', tags: ['goblinoide', 'bosque'], challengeRating: 0.25,
    attributes: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, hp: 7, ac: 15, attacks: [], resistances: [],
  });
}

describe('InMemoryEnemyRepository', () => {
  it('devuelve exactamente el estado guardado al recuperarlo (ida y vuelta)', async () => {
    const repo = new InMemoryEnemyRepository();
    const goblin = buildGoblin();

    await repo.save(goblin);
    const recovered = await repo.findById(goblin.id);

    expect(recovered?.toSnapshot()).toEqual(goblin.toSnapshot());
  });

  it('search filtra por etiquetas y dificultad', async () => {
    const repo = new InMemoryEnemyRepository();
    await repo.save(buildGoblin());

    const byTag = await repo.search({ tags: ['goblinoide'] });
    expect(byTag).toHaveLength(1);

    const byUnrelatedTag = await repo.search({ tags: ['dragon'] });
    expect(byUnrelatedTag).toHaveLength(0);
  });
});
