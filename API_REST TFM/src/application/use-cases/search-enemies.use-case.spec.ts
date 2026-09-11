import { EnemyRepository, EnemySearchCriteria } from '../../domain/ports/enemy.repository.port';
import { Shuffler } from '../../domain/ports/shuffler.port';
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

/** No desordena — para tests que verifican otra cosa (filtrado) sin ruido de aleatoriedad. */
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
    const useCase = new SearchEnemiesUseCase(repo, new IdentityShuffler());

    const results = await useCase.execute({ tags: ['goblinoide'] });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Goblin explorador');
  });

  it('filtra por dificultad máxima', async () => {
    const repo = new FakeEnemyRepository([buildGoblin(), buildDragon()]);
    const useCase = new SearchEnemiesUseCase(repo, new IdentityShuffler());

    const results = await useCase.execute({ maxChallengeRating: 1 });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Goblin explorador');
  });

  it('devuelve solo los campos relevantes para que la IA elija un encuentro, no las estadísticas completas', async () => {
    const repo = new FakeEnemyRepository([buildGoblin()]);
    const useCase = new SearchEnemiesUseCase(repo, new IdentityShuffler());

    const [result] = await useCase.execute({});

    expect(result).toEqual({
      id: expect.any(String),
      name: 'Goblin explorador',
      description: 'Pequeño y huraño.',
      challengeRating: 0.25,
    });
  });

  describe('variedad y catálogo nunca vacío (mismo principio que SearchMapsUseCase: "mapa primero, historia después")', () => {
    it('si NINGÚN enemigo coincide con las etiquetas ni la dificultad, devuelve el catálogo completo (barajado) en vez de una lista vacía', async () => {
      // Bug real de producción: la IA narró tres "hongos ambulantes"
      // inventados (Honguito Azul, Hongazo, Micelio Errante) ANTES de mirar
      // el catálogo. Al intentar iniciar el combate de verdad, buscó por
      // etiquetas ("hongos"+"cueva", "planta"+"hongo"+"subterraneo", "bestia"
      // con varias CR máximas) -- las CUATRO búsquedas devolvieron [], porque
      // el catálogo no tiene monstruos-planta con esas etiquetas exactas.
      // Tras cuatro intentos fallidos tuvo que llamar sin ningún filtro y
      // elegir al azar de cientos de monstruos (un Giant Rat y un Giant Bat
      // que no tienen nada que ver con "hongos"). Devolver el catálogo
      // completo en la PRIMERA búsqueda evita esa cadena de reintentos y les
      // da a elegir entre enemigos reales desde el principio.
      const repo = new FakeEnemyRepository([buildGoblin(), buildDragon()]);
      const useCase = new SearchEnemiesUseCase(repo, new ReverseShuffler());

      const results = await useCase.execute({ tags: ['hongo', 'planta'] });

      expect(results).toHaveLength(2);
      // El fallback también pasa por el Shuffler (ReverseShuffler invierte).
      expect(results.map((r) => r.name)).toEqual(['Dragón joven', 'Goblin explorador']);
    });

    it('el mismo fallback aplica cuando se filtra solo por dificultad máxima y no hay ningún enemigo por debajo', async () => {
      const repo = new FakeEnemyRepository([buildGoblin(), buildDragon()]);
      const useCase = new SearchEnemiesUseCase(repo, new IdentityShuffler());

      const results = await useCase.execute({ maxChallengeRating: 0 });

      expect(results).toHaveLength(2);
    });

    it('usa el Shuffler inyectado para variar el orden entre búsquedas sin filtros', async () => {
      const repo = new FakeEnemyRepository([buildGoblin(), buildDragon()]);
      const useCase = new SearchEnemiesUseCase(repo, new ReverseShuffler());

      const results = await useCase.execute({});

      expect(results.map((r) => r.name)).toEqual(['Dragón joven', 'Goblin explorador']);
    });
  });
});
