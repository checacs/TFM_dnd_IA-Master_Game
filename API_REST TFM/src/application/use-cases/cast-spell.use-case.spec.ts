import { DiceRoller } from '../../domain/ports/dice-roller.port';
import { GameRepository } from '../../domain/ports/game.repository.port';
import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { SpellRepository, SpellSearchCriteria } from '../../domain/ports/spell.repository.port';
import { EnemyRepository, EnemySearchCriteria } from '../../domain/ports/enemy.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { Character } from '../../domain/entities/character.entity';
import { Spell } from '../../domain/entities/spell.entity';
import { Enemy } from '../../domain/entities/enemy.entity';
import { CastSpellUseCase } from './cast-spell.use-case';

class FakeDiceRoller implements DiceRoller {
  private i = 0;
  constructor(private readonly fixedValues: number[]) {}
  rollD20(): number {
    return this.fixedValues[this.i++];
  }
  roll(): number {
    return this.fixedValues[this.i++];
  }
}

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

class FakeCharacterRepository implements CharacterRepository {
  private readonly characters = new Map<string, Character>();
  seed(character: Character): void {
    this.characters.set(character.id, character);
  }
  async findById(id: string): Promise<Character | null> {
    return this.characters.get(id) ?? null;
  }
  async save(character: Character): Promise<void> {
    this.characters.set(character.id, character);
  }
}

class FakeSpellRepository implements SpellRepository {
  constructor(private readonly spells: Spell[] = []) {}
  async findById(id: string): Promise<Spell | null> {
    return this.spells.find((s) => s.id === id) ?? null;
  }
  async search(_c: SpellSearchCriteria): Promise<Spell[]> {
    return this.spells;
  }
}

class FakeEnemyRepository implements EnemyRepository {
  constructor(private readonly enemies: Enemy[] = []) {}
  async findById(id: string): Promise<Enemy | null> {
    return this.enemies.find((e) => e.id === id) ?? null;
  }
  async search(_c: EnemySearchCriteria): Promise<Enemy[]> {
    return this.enemies;
  }
}

function buildGoblin() {
  return Enemy.create(
    {
      name: 'Goblin explorador', description: '', tags: [], challengeRating: 0.25,
      attributes: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, // dex +2
      hp: 7, ac: 15, attacks: [], resistances: [],
    },
    'enemy-1',
  );
}

function buildGameWithGoblin(): { game: Game; games: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 14 });
  game.launch('host-1');
  game.startEncounter({
    enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
  });
  const games = new FakeGameRepository();
  games.seed(game);
  return { game, games };
}

function buildMago(overrides: Partial<Parameters<typeof Character.create>[0]> = {}) {
  return Character.create({
    ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago',
    attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 }, // int +3
    hp: { current: 9, max: 9 }, ac: 12, unassignedSkillPoints: 0,
    spellcaster: true,
    spells: { known: ['ray-of-frost', 'burning-hands', 'mage-armor'], slots: { level1: { max: 2, used: 0 }, level2: { max: 0, used: 0 } } },
    ...overrides,
  }, 'char-1');
}

function buildRayOfFrost() {
  // Sin salvación — impacto directo (simplificación: no modelamos tirada de ataque de conjuro).
  return Spell.create({
    name: 'Ray of Frost', level: 1, school: 'Evocation', castingTime: '1 action', range: '60 feet',
    duration: 'Instantaneous', concentration: false, ritual: false, components: ['V', 'S'], material: null,
    description: '...', classes: ['wizard'], damageType: 'cold', damageAtSlotLevel: { '1': '1d8' },
    savingThrowAbility: null, savingThrowSuccess: null, areaOfEffectType: null, areaOfEffectSize: null,
  }, 'ray-of-frost');
}

function buildBurningHands() {
  return Spell.create({
    name: 'Burning Hands', level: 1, school: 'Evocation', castingTime: '1 action', range: 'Self',
    duration: 'Instantaneous', concentration: false, ritual: false, components: ['V', 'S'], material: null,
    description: '...', classes: ['wizard'], damageType: 'fire', damageAtSlotLevel: { '1': '3d6' },
    savingThrowAbility: 'dex', savingThrowSuccess: 'half', areaOfEffectType: 'cone', areaOfEffectSize: 15,
  }, 'burning-hands');
}

function buildMageArmor() {
  return Spell.create({
    name: 'Mage Armor', level: 1, school: 'Abjuration', castingTime: '1 action', range: 'Touch',
    duration: '8 hours', concentration: false, ritual: false, components: ['V', 'S', 'M'], material: '...',
    description: '...', classes: ['wizard'], damageType: null, damageAtSlotLevel: null,
    savingThrowAbility: null, savingThrowSuccess: null, areaOfEffectType: null, areaOfEffectSize: null,
  }, 'mage-armor');
}

describe('CastSpellUseCase', () => {
  it('lanza un hechizo sin salvación: aplica el daño completo al objetivo', async () => {
    const { game, games } = buildGameWithGoblin();
    const characters = new FakeCharacterRepository();
    characters.seed(buildMago());
    const spells = new FakeSpellRepository([buildRayOfFrost()]);
    const enemies = new FakeEnemyRepository([buildGoblin()]);
    const diceRoller = new FakeDiceRoller([6]); // daño 1d8 = 6

    const useCase = new CastSpellUseCase(diceRoller, games, characters, spells, enemies);
    const result = await useCase.execute({
      gameId: game.id, requestingUserId: 'user-1', casterCharacterId: 'char-1',
      spellId: 'ray-of-frost', targetId: 'enc-1-goblin-a',
    });

    expect(result.damageDealt).toBe(6);
    expect(result.targetSavedThrow).toBeNull();

    const saved = await games.findById(game.id);
    const enemy = saved?.toSnapshot().activeEncounter?.enemies.find((e) => e.instanceId === 'enc-1-goblin-a');
    expect(enemy?.currentHp).toBe(1); // 7 - 6

    const savedCaster = await characters.findById('char-1');
    expect(savedCaster?.toSnapshot().spells?.slots.level1.used).toBe(1);
  });

  it('lanza un hechizo con salvación: si el objetivo falla, aplica el daño completo', async () => {
    const { game, games } = buildGameWithGoblin();
    const characters = new FakeCharacterRepository();
    characters.seed(buildMago());
    const spells = new FakeSpellRepository([buildBurningHands()]);
    const enemies = new FakeEnemyRepository([buildGoblin()]);
    // DC = 8 + 3 (int del mago) = 11. Tirada de salvación del goblin: 5 + 2 (dex) = 7 < 11 -> falla.
    const diceRoller = new FakeDiceRoller([5, 14]); // salvación 5, daño 3d6=14

    const useCase = new CastSpellUseCase(diceRoller, games, characters, spells, enemies);
    const result = await useCase.execute({
      gameId: game.id, requestingUserId: 'user-1', casterCharacterId: 'char-1',
      spellId: 'burning-hands', targetId: 'enc-1-goblin-a',
    });

    expect(result.targetSavedThrow).toBe(false);
    expect(result.damageDealt).toBe(14);
  });

  it('lanza un hechizo con salvación: si el objetivo la supera, aplica la mitad (redondeada hacia abajo)', async () => {
    const { game, games } = buildGameWithGoblin();
    const characters = new FakeCharacterRepository();
    characters.seed(buildMago());
    const spells = new FakeSpellRepository([buildBurningHands()]);
    const enemies = new FakeEnemyRepository([buildGoblin()]);
    // DC = 11. Tirada de salvación del goblin: 10 + 2 = 12 >= 11 -> supera.
    const diceRoller = new FakeDiceRoller([10, 15]); // salvación 10, daño bruto 3d6=15 -> mitad = 7

    const useCase = new CastSpellUseCase(diceRoller, games, characters, spells, enemies);
    const result = await useCase.execute({
      gameId: game.id, requestingUserId: 'user-1', casterCharacterId: 'char-1',
      spellId: 'burning-hands', targetId: 'enc-1-goblin-a',
    });

    expect(result.targetSavedThrow).toBe(true);
    expect(result.damageDealt).toBe(7); // floor(15/2)
  });

  it('lanza un hechizo utilitario sin objetivo (Mage Armor), sin aplicar ningún daño', async () => {
    const { game, games } = buildGameWithGoblin();
    const characters = new FakeCharacterRepository();
    characters.seed(buildMago());
    const spells = new FakeSpellRepository([buildMageArmor()]);
    const enemies = new FakeEnemyRepository([]);

    const useCase = new CastSpellUseCase(new FakeDiceRoller([]), games, characters, spells, enemies);
    const result = await useCase.execute({
      gameId: game.id, requestingUserId: 'user-1', casterCharacterId: 'char-1', spellId: 'mage-armor',
    });

    expect(result.damageDealt).toBe(0);
    expect(result.targetSavedThrow).toBeNull();
  });

  describe('rastro en el chat (narrativeLog)', () => {
    // Se detectó que CastSpellUseCase no dejaba ningún mensaje en el chat --
    // a diferencia de ResolveAttackUseCase, el jugador no veía confirmación
    // de que su hechizo se había lanzado de verdad, con qué daño o si el
    // objetivo había salvado.
    it('un hechizo sin salvación deja un mensaje con el nombre del lanzador, el hechizo y el daño', async () => {
      const { game, games } = buildGameWithGoblin();
      const characters = new FakeCharacterRepository();
      characters.seed(buildMago());
      const spells = new FakeSpellRepository([buildRayOfFrost()]);
      const enemies = new FakeEnemyRepository([buildGoblin()]);
      const useCase = new CastSpellUseCase(new FakeDiceRoller([6]), games, characters, spells, enemies);

      await useCase.execute({
        gameId: game.id, requestingUserId: 'user-1', casterCharacterId: 'char-1',
        spellId: 'ray-of-frost', targetId: 'enc-1-goblin-a',
      });

      const saved = await games.findById(game.id);
      const log = saved!.toSnapshot().narrativeLog;
      expect(log).toHaveLength(1);
      expect(log[0].role).toBe('assistant');
      expect(log[0].content).toContain('**Elyndra**');
      expect(log[0].content).toContain('**Ray of Frost**');
      expect(log[0].content).toContain('**Goblin explorador**');
      expect(log[0].content).toContain('6');
    });

    it('un hechizo con salvación deja constancia de si el objetivo salvó o falló, y la CD usada', async () => {
      const { game, games } = buildGameWithGoblin();
      const characters = new FakeCharacterRepository();
      characters.seed(buildMago());
      const spells = new FakeSpellRepository([buildBurningHands()]);
      const enemies = new FakeEnemyRepository([buildGoblin()]);
      const diceRoller = new FakeDiceRoller([5, 14]); // salvación 5 (falla, DC 11), daño 14
      const useCase = new CastSpellUseCase(diceRoller, games, characters, spells, enemies);

      await useCase.execute({
        gameId: game.id, requestingUserId: 'user-1', casterCharacterId: 'char-1',
        spellId: 'burning-hands', targetId: 'enc-1-goblin-a',
      });

      const saved = await games.findById(game.id);
      const log = saved!.toSnapshot().narrativeLog;
      expect(log[0].content.toLowerCase()).toContain('falla la salvación');
      expect(log[0].content).toContain('CD 11');
      expect(log[0].content).toContain('14');
    });

    it('un hechizo utilitario sin objetivo también deja un mensaje en el chat (sin daño)', async () => {
      const { game, games } = buildGameWithGoblin();
      const characters = new FakeCharacterRepository();
      characters.seed(buildMago());
      const spells = new FakeSpellRepository([buildMageArmor()]);
      const enemies = new FakeEnemyRepository([]);
      const useCase = new CastSpellUseCase(new FakeDiceRoller([]), games, characters, spells, enemies);

      await useCase.execute({
        gameId: game.id, requestingUserId: 'user-1', casterCharacterId: 'char-1', spellId: 'mage-armor',
      });

      const saved = await games.findById(game.id);
      const log = saved!.toSnapshot().narrativeLog;
      expect(log).toHaveLength(1);
      expect(log[0].content).toContain('**Elyndra**');
      expect(log[0].content).toContain('**Mage Armor**');
    });
  });

  it('lanza DomainError si el personaje no conoce el hechizo', async () => {
    const { game, games } = buildGameWithGoblin();
    const characters = new FakeCharacterRepository();
    characters.seed(buildMago({ spells: { known: [], slots: { level1: { max: 2, used: 0 }, level2: { max: 0, used: 0 } } } }));
    const spells = new FakeSpellRepository([buildRayOfFrost()]);
    const enemies = new FakeEnemyRepository([buildGoblin()]);
    const useCase = new CastSpellUseCase(new FakeDiceRoller([6]), games, characters, spells, enemies);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-1', casterCharacterId: 'char-1', spellId: 'ray-of-frost', targetId: 'enc-1-goblin-a' }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si no quedan ranuras del nivel del hechizo', async () => {
    const { game, games } = buildGameWithGoblin();
    const characters = new FakeCharacterRepository();
    characters.seed(buildMago({ spells: { known: ['ray-of-frost'], slots: { level1: { max: 1, used: 1 }, level2: { max: 0, used: 0 } } } }));
    const spells = new FakeSpellRepository([buildRayOfFrost()]);
    const enemies = new FakeEnemyRepository([buildGoblin()]);
    const useCase = new CastSpellUseCase(new FakeDiceRoller([6]), games, characters, spells, enemies);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-1', casterCharacterId: 'char-1', spellId: 'ray-of-frost', targetId: 'enc-1-goblin-a' }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si el hechizo es de nivel 3 o superior (fuera del alcance del MVP)', async () => {
    const { game, games } = buildGameWithGoblin();
    const characters = new FakeCharacterRepository();
    characters.seed(buildMago({ spells: { known: ['fireball'], slots: { level1: { max: 2, used: 0 }, level2: { max: 0, used: 0 } } } }));
    const fireball = Spell.create({
      name: 'Fireball', level: 3, school: 'Evocation', castingTime: '1 action', range: '150 feet',
      duration: 'Instantaneous', concentration: false, ritual: false, components: ['V', 'S', 'M'], material: '...',
      description: '...', classes: ['wizard'], damageType: 'fire', damageAtSlotLevel: { '3': '8d6' },
      savingThrowAbility: 'dex', savingThrowSuccess: 'half', areaOfEffectType: 'sphere', areaOfEffectSize: 20,
    }, 'fireball');
    const spells = new FakeSpellRepository([fireball]);
    const enemies = new FakeEnemyRepository([buildGoblin()]);
    const useCase = new CastSpellUseCase(new FakeDiceRoller([]), games, characters, spells, enemies);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-1', casterCharacterId: 'char-1', spellId: 'fireball', targetId: 'enc-1-goblin-a' }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si el usuario no es el dueño del personaje conjurador', async () => {
    const { game, games } = buildGameWithGoblin();
    const characters = new FakeCharacterRepository();
    characters.seed(buildMago());
    const spells = new FakeSpellRepository([buildRayOfFrost()]);
    const enemies = new FakeEnemyRepository([buildGoblin()]);
    const useCase = new CastSpellUseCase(new FakeDiceRoller([]), games, characters, spells, enemies);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'otro-user', casterCharacterId: 'char-1', spellId: 'ray-of-frost', targetId: 'enc-1-goblin-a' }),
    ).rejects.toThrow();
  });

  describe('invocación del DM-IA vía MCP (sin requestingUserId)', () => {
    // La tool MCP cast_spell la invoca el propio DM-IA, no el jugador desde
    // REST -- igual que end_player_turn o grant_item, no hay "usuario que
    // hace la petición" que comprobar contra el dueño del personaje. A
    // diferencia de esos dos casos de uso (que nunca tuvieron ese campo),
    // CastSpellUseCase ya existía para el endpoint REST del jugador
    // (POST /games/:id/cast-spell) con su comprobación de propiedad, así que
    // aquí requestingUserId se vuelve opcional: si no se manda (ruta MCP), se
    // omite la comprobación; si se manda (ruta REST), se sigue exigiendo.
    it('sin requestingUserId, lanza el hechizo sin comprobar el dueño del personaje', async () => {
      const { game, games } = buildGameWithGoblin();
      const characters = new FakeCharacterRepository();
      characters.seed(buildMago()); // ownerId real: 'user-1'
      const spells = new FakeSpellRepository([buildRayOfFrost()]);
      const enemies = new FakeEnemyRepository([buildGoblin()]);
      const useCase = new CastSpellUseCase(new FakeDiceRoller([6]), games, characters, spells, enemies);

      const result = await useCase.execute({
        gameId: game.id, casterCharacterId: 'char-1', spellId: 'ray-of-frost', targetId: 'enc-1-goblin-a',
      });

      expect(result.damageDealt).toBe(6);
    });
  });
});
