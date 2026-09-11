import { GameRepository } from '../../domain/ports/game.repository.port';
import { EnemyRepository } from '../../domain/ports/enemy.repository.port';
import { MapRepository, MapSearchCriteria } from '../../domain/ports/map.repository.port';
import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { Character } from '../../domain/entities/character.entity';
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

  async deleteById(id: string): Promise<void> {
    this.games.delete(id);
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

class FakeCharacterRepository implements CharacterRepository {
  private readonly characters = new Map<string, Character>();
  seed(character: Character): void {
    this.characters.set(character.id, character);
  }
  async findById(id: string): Promise<Character | null> {
    return this.characters.get(id) ?? null;
  }
  async findByOwnerId(): Promise<Character[]> { return []; }
  async save(character: Character): Promise<void> {
    this.characters.set(character.id, character);
  }
  async deleteById(id: string): Promise<void> {
    this.characters.delete(id);
  }
  async deleteByGameId(): Promise<void> {}
}

function buildCharacter(id: string, level: number): Character {
  return Character.create({
    ownerId: `owner-${id}`, gameId: 'game-1', name: id, class: 'guerrero', level,
    attributes: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
    hp: { current: 20, max: 20 }, ac: 16, unassignedSkillPoints: 0,
  }, id);
}

function buildMonster(id: string, name: string, challengeRating: number): Enemy {
  return Enemy.create({
    name, description: '', tags: [], challengeRating,
    attributes: { str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6 },
    hp: 22, ac: 12, attacks: [], resistances: [],
  }, id);
}

describe('StartCombatUseCase', () => {
  it('arranca el combate con los enemigos indicados, en fase de jugadores y sin candado', async () => {
    const games = new FakeGameRepository();
    const enemyRepo = new FakeEnemyRepository();
    const mapRepo = new FakeMapRepository();

    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
    game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
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

    const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo, new FakeCharacterRepository());

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
        game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
        game.assignCaptain('host-1', 'user-1');
        game.launch('host-1');
        games.seed(game);

        const goblin = Enemy.create({
          name: 'Goblin explorador', description: '', tags: [], challengeRating: 0.25,
          attributes: { str: 8, dex: 12, con: 10, int: 10, wis: 8, cha: 8 },
          hp: 7, ac: 15, attacks: [], resistances: [],
        }, 'enemy-1');
        enemyRepo.seed(goblin);

        const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo, new FakeCharacterRepository());
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
    game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
    game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
    game.launch('host-1');
    games.seed(game);

    const enemySinImagen = Enemy.create({
      name: 'Rata gigante', description: '', tags: [], challengeRating: 0.125,
      attributes: { str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4 },
      hp: 7, ac: 12, attacks: [], resistances: [],
    }, 'enemy-2');
    enemyRepo.seed(enemySinImagen);

    const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo, new FakeCharacterRepository());
    const result = await useCase.execute({ gameId: game.id, enemyIds: ['enemy-2'] });

    expect(result.enemies[0].imageUrl).toBeNull();
  });

  it('aplica el mapa indicado al tablero de la partida, si se pasa mapId', async () => {
    const games = new FakeGameRepository();
    const enemyRepo = new FakeEnemyRepository();
    const mapRepo = new FakeMapRepository();

    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
    game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
    game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
    game.launch('host-1');
    games.seed(game);

    const taberna = BattleMap.create({
      name: 'Taberna del jabalí', description: '', tags: ['interior'],
      rows: 10, cols: 14, imageUrl: '/maps/taberna-jabali.png',
    }, 'map-1');
    mapRepo.seed(taberna);

    const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo, new FakeCharacterRepository());

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
    const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo, new FakeCharacterRepository());

    await expect(useCase.execute({ gameId: 'no-existe', enemyIds: [] })).rejects.toThrow();
  });

  it('lanza DomainError si un enemyId no existe en el catálogo', async () => {
    const games = new FakeGameRepository();
    const enemyRepo = new FakeEnemyRepository();
    const mapRepo = new FakeMapRepository();

    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
    game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
    game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
    game.launch('host-1');
    games.seed(game);

    const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo, new FakeCharacterRepository());

    await expect(useCase.execute({ gameId: game.id, enemyIds: ['no-existe'] })).rejects.toThrow();
  });

  describe('equilibrio del encuentro (presupuesto de XP de la DMG)', () => {
    function launchedGameWithTwoLevel1Heroes(): Game {
      const game = Game.create({ name: 'prueba3', hostUserId: 'host-1', maxPlayers: 4 });
      game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Movil', class: 'mago', currentHp: 14 });
      game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Tablet', class: 'guerrero', currentHp: 20 });
      game.assignCaptain('host-1', 'user-1');
      game.launch('host-1');
      return game;
    }

    it('CASO REAL: rechaza 2 Ghouls + 1 Zombie contra dos personajes de nivel 1, sin arrancar el combate', async () => {
      const games = new FakeGameRepository();
      const enemyRepo = new FakeEnemyRepository();
      const characters = new FakeCharacterRepository();
      characters.seed(buildCharacter('char-1', 1));
      characters.seed(buildCharacter('char-2', 1));
      const game = launchedGameWithTwoLevel1Heroes();
      games.seed(game);
      enemyRepo.seed(buildMonster('ghoul', 'Ghoul', 1));
      enemyRepo.seed(buildMonster('zombie', 'Zombie', 0.25));

      const useCase = new StartCombatUseCase(games, enemyRepo, new FakeMapRepository(), characters);

      await expect(useCase.execute({ gameId: game.id, enemyIds: ['ghoul', 'ghoul', 'zombie'] }))
          .rejects.toThrow(/450 XP.*200/);
      await expect(useCase.execute({ gameId: game.id, enemyIds: ['ghoul', 'ghoul', 'zombie'] }))
          .rejects.toThrow(/1 enemigo de CR ≤ 1,.*2 enemigos de CR ≤ 1\/2.*3 enemigos de CR ≤ 1\/4/);

      const saved = await games.findById(game.id);
      expect(saved!.toSnapshot().activeEncounter).toBeNull();
    });

    it('permite un encuentro dentro del presupuesto (un Zombie contra los mismos dos personajes)', async () => {
      const games = new FakeGameRepository();
      const enemyRepo = new FakeEnemyRepository();
      const characters = new FakeCharacterRepository();
      characters.seed(buildCharacter('char-1', 1));
      characters.seed(buildCharacter('char-2', 1));
      const game = launchedGameWithTwoLevel1Heroes();
      games.seed(game);
      enemyRepo.seed(buildMonster('zombie', 'Zombie', 0.25));

      const useCase = new StartCombatUseCase(games, enemyRepo, new FakeMapRepository(), characters);
      const result = await useCase.execute({ gameId: game.id, enemyIds: ['zombie'] });

      expect(result.enemies).toHaveLength(1);
    });

    it('CASO REAL: tres goblins contra dos personajes de nivel 1 sí se aceptan (150 XP de 200)', async () => {
      const games = new FakeGameRepository();
      const enemyRepo = new FakeEnemyRepository();
      const characters = new FakeCharacterRepository();
      characters.seed(buildCharacter('char-1', 1));
      characters.seed(buildCharacter('char-2', 1));
      const game = launchedGameWithTwoLevel1Heroes();
      games.seed(game);
      enemyRepo.seed(buildMonster('goblin', 'Goblin', 0.25));

      const useCase = new StartCombatUseCase(games, enemyRepo, new FakeMapRepository(), characters);
      const result = await useCase.execute({ gameId: game.id, enemyIds: ['goblin', 'goblin', 'goblin'] });

      expect(result.enemies).toHaveLength(3);
    });

    it('usa el nivel REAL de cada personaje: a nivel 3 los dos Ghouls sí caben', async () => {
      const games = new FakeGameRepository();
      const enemyRepo = new FakeEnemyRepository();
      const characters = new FakeCharacterRepository();
      characters.seed(buildCharacter('char-1', 3));
      characters.seed(buildCharacter('char-2', 3));
      const game = launchedGameWithTwoLevel1Heroes();
      games.seed(game);
      enemyRepo.seed(buildMonster('ghoul', 'Ghoul', 1));

      // Presupuesto alto: 2 x 400 = 800. 2 Ghouls: 400 XP -> dentro.
      const useCase = new StartCombatUseCase(games, enemyRepo, new FakeMapRepository(), characters);
      const result = await useCase.execute({ gameId: game.id, enemyIds: ['ghoul', 'ghoul'] });

      expect(result.enemies).toHaveLength(2);
    });
  });

  it('con mapId, rechaza un mapa no conectado al actual ANTES de arrancar el combate', async () => {
    const games = new FakeGameRepository();
    const enemyRepo = new FakeEnemyRepository();
    const mapRepo = new FakeMapRepository();
    mapRepo.seed(BattleMap.create({
      name: 'Sótano', description: '', tags: ['sotano'], rows: 30, cols: 20, imageUrl: '/maps/sotano.png',
      connections: [{ mapId: 'cueva-rio', via: 'la trampilla' }], closedExits: true,
    }, 'sotanoTaberna'));
    mapRepo.seed(BattleMap.create({
      name: 'Fortaleza con mazmorras', description: '', tags: ['cripta'], rows: 30, cols: 20, imageUrl: '/maps/cripta.png',
    }, 'cripta-multisala'));
    const game = Game.create({ name: 'prueba3', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Movil', class: 'mago', currentHp: 14 });
    game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Tablet', class: 'guerrero', currentHp: 20 });
    game.assignCaptain('host-1', 'user-1');
    game.launch('host-1');
    game.setBattleMap({ rows: 30, cols: 20, imageUrl: '/maps/sotano.png', mapId: 'sotanoTaberna' });
    games.seed(game);
    enemyRepo.seed(buildMonster('zombie', 'Zombie', 0.25));

    const useCase = new StartCombatUseCase(games, enemyRepo, mapRepo, new FakeCharacterRepository());

    await expect(useCase.execute({ gameId: game.id, enemyIds: ['zombie'], mapId: 'cripta-multisala' }))
        .rejects.toThrow(/no está conectado/);
    const saved = (await games.findById(game.id))!.toSnapshot();
    expect(saved.activeEncounter).toBeNull();
    expect(saved.narrativeLog.some((e) => e.content.includes('ENTRÁIS EN COMBATE'))).toBe(false);
  });
});

