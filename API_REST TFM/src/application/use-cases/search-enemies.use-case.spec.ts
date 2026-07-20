import { EnemyRepository, EnemySearchCriteria } from '../../domain/ports/enemy.repository.port';
import { Enemy } from '../../domain/entities/enemy.entity';
import { SearchEnemiesUseCase } from './search-enemies.use-case';

class FakeEnemyRepository implements EnemyRepository {
  constructor(private readonly enemies: Enemy[] = []) {}

  async findById(id: string): Promise<Enemy | null> {
    return this.enemies.find((e) => e.id === id) ?? null;
  }

  async search(criteria: EnemySearchCriteria): Promise<Enemy[]> {
    // Fake simplificado: replica en memoria el filtro que hará la query real de Mongo.
    return this.enemies.filter((enemy) => {
      const snapshot = enemy.toSnapshot();
      const matchesTags = !criteria.tags?.length || criteria.tags.some((tag) => snapshot.tags.includes(tag));
      const matchesCr = criteria.maxChallengeRating === undefined || snapshot.challengeRating <= criteria.maxChallengeRating;
      return matchesTags && matchesCr;
    });
  }
}

function buildGoblin() {
  return Enemy.create({
    name: 'Goblin explorador', description: 'Pequeño y huraño.', tags: ['goblinoide', 'bosque'],
    challengeRating: 0.25, attributes: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    hp: 7, ac: 15, attacks: [], resistances: [],
  });
}

function buildDragon() {
  return Enemy.create({
    name: 'Dragón joven', description: 'Muy peligroso.', tags: ['dragon', 'montana'],
    challengeRating: 10, attributes: { str: 22, dex: 10, con: 19, int: 14, wis: 11, cha: 19 },
    hp: 178, ac: 18, attacks: [], resistances: [],
  });
}

describe('SearchEnemiesUseCase', () => {
  it('filtra por etiquetas', async () => {
    const repo = new FakeEnemyRepository([buildGoblin(), buildDragon()]);
    const useCase = new SearchEnemiesUseCase(repo);

    const results = await useCase.execute({ tags: ['goblinoide'] });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Goblin explorador');
  });

  it('filtra por dificultad máxima', async () => {
    const repo = new FakeEnemyRepository([buildGoblin(), buildDragon()]);
    const useCase = new SearchEnemiesUseCase(repo);

    const results = await useCase.execute({ maxChallengeRating: 1 });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Goblin explorador');
  });

  it('devuelve solo los campos relevantes para que la IA elija un encuentro, no las estadísticas completas', async () => {
    const repo = new FakeEnemyRepository([buildGoblin()]);
    const useCase = new SearchEnemiesUseCase(repo);

    const [result] = await useCase.execute({});

    expect(result).toEqual({
      id: expect.any(String),
      name: 'Goblin explorador',
      description: 'Pequeño y huraño.',
      challengeRating: 0.25,
    });
  });
});
