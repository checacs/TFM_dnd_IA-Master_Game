import { GameRepository } from '../../domain/ports/game.repository.port';
import { EnemyRepository } from '../../domain/ports/enemy.repository.port';
import { MapRepository, MapSearchCriteria } from '../../domain/ports/map.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { Enemy } from '../../domain/entities/enemy.entity';
import { BattleMap } from '../../domain/entities/battle-map.entity';
import { StartCombatUseCase } from './start-combat.use-case';

class FakeGameRepository implements GameRepository {
  private readonly games = new Map<string, Game>();
  seed(game: Game): void {
    this.games.set(game.id, game);
  }
  async findById(id: string): Promise<Game | null> {
    return this.games.get(id) ?? null;
  }
  async findByUserId(_userId: string): Promise<Game[]> { return []; }

  async save(game: Game): Promise<void> {
    this.games.set(game.id, game);
  }
}

class FakeEnemyRepository implements EnemyRepository {
  private readonly enemies = new Map<string, Enemy>();
  seed(enemy: Enemy): void {
    this.enemies.set(enemy.id, enemy);
  }
  async findById(id: string): Promise<Enemy | null> {
    return this.enemies.get(id) ?? null;
  }
  async search(): Promise<Enemy[]> {
    return Array.from(this.enemies.values());
  }
}

class FakeMapRepository implements MapRepository {
  private readonly maps = new Map<string, BattleMap>();
  seed(map: BattleMap): void {
    this.maps.set(map.id, map);
  }
  async findById(id: string): Promise<BattleMap | null> {
    return this.maps.get(id) ?? null;
  }
  async search(criteria: MapSearchCriteria): Promise<BattleMap[]> {
    return Array.from(this.maps.values()).filter((m) => {
      const snapshot = m.toSnapshot();
      return !criteria.tags?.length || criteria.tags.some((tag) => snapshot.tags.includes(tag));
    });
  }
}

describe('StartCombatUseCase', () => {
  it('arranca el combate con los enemigos indicados, en fase de jugadores y sin candado', async () => {
    const games = new FakeGameRepository();
    const enemyRepo = new FakeEnemyRepository();
    const mapRepo = new FakeMapRepository();

    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
    game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
    game.launch('host-1');
    games.seed(game);

    const goblin = Enemy.create({
      name: 'Goblin explorador', description: '', tags: [], challengeRating: 0.25,
      attributes: { str: 8, dex: 12, con: 10, int: 10, wis: 8, cha: 8 },
      hp: 7, ac: 15, attacks: [], resistances: [],
      imageUrl: 'https://www.dnd5eapi.co/api/images/monsters/goblin.png',
    }, 'enemy-1');
    enemyRepo.seed(goblin);

    const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo);

    const result = await useCase.execute({ gameId: game.id, enemyIds: ['enemy-1'] });

    expect(result.enemies).toHaveLength(1);
    expect(result.enemies[0].enemyRefId).toBe('enemy-1');
    expect(result.enemies[0].imageUrl).toBe('https://www.dnd5eapi.co/api/images/monsters/goblin.png');

    const saved = await games.findById(game.id);
    const encounter = saved?.toSnapshot().activeEncounter;
    expect(encounter).not.toBeNull();
    expect(encounter?.roundPhase).toBe('jugadores');
    expect(encounter?.turnClaims).toEqual([]);
    expect(encounter?.actedThisRound).toEqual([]);

    expect(encounter?.enemies).toHaveLength(1);
    expect(encounter?.enemies[0].enemyRefId).toBe('enemy-1');
    expect(encounter?.enemies[0].currentHp).toBe(7);
    expect(encounter?.enemies[0].instanceId).toBe(result.enemies[0].instanceId);
    expect(encounter?.enemies[0].imageUrl).toBe('https://www.dnd5eapi.co/api/images/monsters/goblin.png');
  });

  it(
      'añade un mensaje de sistema garantizado "¡ENTRÁIS EN COMBATE!!!" al narrativeLog, listando los enemigos ' +
      'reales -- no depende de que el DM-IA se acuerde de narrarlo con dramatismo',
      async () => {
        const games = new FakeGameRepository();
        const enemyRepo = new FakeEnemyRepository();
        const mapRepo = new FakeMapRepository();

        const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
        game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
        game.assignCaptain('host-1', 'user-1');
        game.launch('host-1');
        games.seed(game);

        const goblin = Enemy.create({
          name: 'Goblin explorador', description: '', tags: [], challengeRating: 0.25,
          attributes: { str: 8, dex: 12, con: 10, int: 10, wis: 8, cha: 8 },
          hp: 7, ac: 15, attacks: [], resistances: [],
        }, 'enemy-1');
        enemyRepo.seed(goblin);

        const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo);
        await useCase.execute({ gameId: game.id, enemyIds: ['enemy-1'] });

        const saved = await games.findById(game.id);
        const log = saved!.toSnapshot().narrativeLog;
        const combatEntry = log.find((e) => e.content.includes('ENTRÁIS EN COMBATE'));

        expect(combatEntry).toBeDefined();
        expect(combatEntry?.role).toBe('assistant');
        expect(combatEntry?.content).toContain('Goblin explorador');
      },
  );

  it('deja imageUrl en null si el enemigo del catálogo no tiene imagen', async () => {
    const games = new FakeGameRepository();
    const enemyRepo = new FakeEnemyRepository();
    const mapRepo = new FakeMapRepository();

    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
    game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
    game.launch('host-1');
    games.seed(game);

    const enemySinImagen = Enemy.create({
      name: 'Rata gigante', description: '', tags: [], challengeRating: 0.125,
      attributes: { str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4 },
      hp: 7, ac: 12, attacks: [], resistances: [],
    }, 'enemy-2');
    enemyRepo.seed(enemySinImagen);

    const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo);
    const result = await useCase.execute({ gameId: game.id, enemyIds: ['enemy-2'] });

    expect(result.enemies[0].imageUrl).toBeNull();
  });

  it('aplica el mapa indicado al tablero de la partida, si se pasa mapId', async () => {
    const games = new FakeGameRepository();
    const enemyRepo = new FakeEnemyRepository();
    const mapRepo = new FakeMapRepository();

    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
    game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
    game.launch('host-1');
    games.seed(game);

    const taberna = BattleMap.create({
      name: 'Taberna del jabalí', description: '', tags: ['interior'],
      rows: 10, cols: 14, imageUrl: '/maps/taberna-jabali.png',
    }, 'map-1');
    mapRepo.seed(taberna);

    const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo);

    await useCase.execute({ gameId: game.id, enemyIds: [], mapId: 'map-1' });

    const saved = await games.findById(game.id);
    expect(saved?.toSnapshot().board).toEqual({
      rows: 10,
      cols: 14,
      imageUrl: '/maps/taberna-jabali.png',
      combatPoint: null,
      zones: [],
    });
    expect(saved?.toSnapshot().mapHistory).toEqual(['map-1']);
  });

  it('lanza DomainError si la partida no existe', async () => {
    const games = new FakeGameRepository();
    const enemyRepo = new FakeEnemyRepository();
    const mapRepo = new FakeMapRepository();
    const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo);

    await expect(useCase.execute({ gameId: 'no-existe', enemyIds: [] })).rejects.toThrow();
  });

  it('lanza DomainError si un enemyId no existe en el catálogo', async () => {
    const games = new FakeGameRepository();
    const enemyRepo = new FakeEnemyRepository();
    const mapRepo = new FakeMapRepository();

    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
    game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
    game.launch('host-1');
    games.seed(game);

    const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo);

    await expect(useCase.execute({ gameId: game.id, enemyIds: ['no-existe'] })).rejects.toThrow();
  });
});
