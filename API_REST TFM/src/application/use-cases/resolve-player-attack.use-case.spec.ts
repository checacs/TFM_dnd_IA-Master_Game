import { DiceRoller } from '../../domain/ports/dice-roller.port';
import { GameRepository } from '../../domain/ports/game.repository.port';
import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { EquipmentRepository, EquipmentSearchCriteria } from '../../domain/ports/equipment.repository.port';
import { DomainError } from '../../domain/errors/domain-error';
import { Game } from '../../domain/entities/game.entity';
import { Character } from '../../domain/entities/character.entity';
import { Equipment } from '../../domain/entities/equipment.entity';
import { ResolvePlayerAttackUseCase } from './resolve-player-attack.use-case';

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

  async deleteById(id: string): Promise<void> {
    this.games.delete(id);
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
  async findByOwnerId(ownerId: string): Promise<Character[]> {
    return Array.from(this.characters.values()).filter((c) => c.toSnapshot().ownerId === ownerId);
  }
  async deleteById(id: string): Promise<void> {
    this.characters.delete(id);
  }
  async save(): Promise<void> {}

  async deleteByGameId(gameId: string): Promise<void> {
    for (const [id, character] of this.characters) {
      if (character.toSnapshot().gameId === gameId) {
        this.characters.delete(id);
      }
    }
  }
}

class FakeEquipmentRepository implements EquipmentRepository {
  constructor(private readonly items: Equipment[] = []) {}
  async findById(id: string): Promise<Equipment | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }
  async search(_c: EquipmentSearchCriteria): Promise<Equipment[]> {
    return this.items;
  }
}

function buildDagger() {
  return Equipment.create(
    {
      name: 'Dagger', category: 'Weapon', cost: null, weight: 1, description: '',
      weaponCategory: 'Simple', weaponRange: 'Melee', damageDice: '1d4', damageType: 'piercing',
      properties: ['finesse', 'light', 'thrown'], armorClass: null,
    },
    'dagger',
  );
}

function buildGreatclub() {
  return Equipment.create(
    {
      name: 'Greatclub', category: 'Weapon', cost: null, weight: 10, description: '',
      weaponCategory: 'Simple', weaponRange: 'Melee', damageDice: '1d8', damageType: 'bludgeoning',
      properties: [], armorClass: null,
    },
    'greatclub',
  );
}

function buildLongbow() {
  return Equipment.create(
    {
      name: 'Longbow', category: 'Weapon', cost: null, weight: 2, description: '',
      weaponCategory: 'Martial', weaponRange: 'Ranged', damageDice: '1d8', damageType: 'piercing',
      properties: [], armorClass: null,
    },
    'longbow',
  );
}

/**
 * La CA del objetivo sale SIEMPRE del enemigo del combate activo (antes la
 * mandaba el cliente en targetArmorClass: con targetArmorClass: -50 se
 * acertaba siempre). Ambos jugadores reclaman turno para poder atacar.
 */
function buildGameWithEnemy(enemyAc = 15): { game: Game; games: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 14 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
  game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
  game.launch('host-1');
  game.startEncounter({
    enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: enemyAc }],
  });
  game.claimTurn('char-1');
  game.claimTurn('char-2');
  const games = new FakeGameRepository();
  games.seed(game);
  return { game, games };
}

describe('ResolvePlayerAttackUseCase', () => {
  it('usa el modificador de STR si el arma no es finesse ni a distancia', async () => {
    const { game, games } = buildGameWithEnemy(13);
    const characters = new FakeCharacterRepository();
    const character = Character.create({
      ownerId: 'user-2', gameId: game.id, name: 'Thane', class: 'guerrero',
      attributes: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 8 }, // str +3, dex +0
      hp: { current: 16, max: 16 }, ac: 16, unassignedSkillPoints: 0,
    }, 'char-2');
    character.addToInventory({ equipmentId: 'greatclub', name: 'Greatclub' });
    character.equipWeapon('greatclub');
    characters.seed(character);
    const equipment = new FakeEquipmentRepository([buildGreatclub()]);
    const diceRoller = new FakeDiceRoller([10, 5]); // 10 + 3 (str) = 13

    const useCase = new ResolvePlayerAttackUseCase(diceRoller, games, characters, equipment);
    const result = await useCase.execute({
      gameId: game.id, requestingUserId: 'user-2', attackerCharacterId: 'char-2', targetId: 'enc-1-goblin-a',
    });

    expect(result.attackRoll).toBe(13);
    expect(result.hit).toBe(true);
  });

  it('usa el mayor entre STR y DEX si el arma tiene la propiedad finesse', async () => {
    const { game, games } = buildGameWithEnemy(12);
    const characters = new FakeCharacterRepository();
    const character = Character.create({
      ownerId: 'user-1', gameId: game.id, name: 'Elyndra', class: 'mago',
      attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 }, // str -1, dex +2
      hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
    }, 'char-1');
    character.addToInventory({ equipmentId: 'dagger', name: 'Dagger' });
    character.equipWeapon('dagger');
    characters.seed(character);
    const equipment = new FakeEquipmentRepository([buildDagger()]);
    const diceRoller = new FakeDiceRoller([10, 3]); // 10 + 2 (dex, el mayor) = 12

    const useCase = new ResolvePlayerAttackUseCase(diceRoller, games, characters, equipment);
    const result = await useCase.execute({
      gameId: game.id, requestingUserId: 'user-1', attackerCharacterId: 'char-1', targetId: 'enc-1-goblin-a',
    });

    expect(result.attackRoll).toBe(12);
    expect(result.hit).toBe(true);
  });

  it('usa el modificador de DEX si el arma es a distancia, aunque STR sea mayor', async () => {
    const { game, games } = buildGameWithEnemy(12);
    const characters = new FakeCharacterRepository();
    const character = Character.create({
      ownerId: 'user-2', gameId: game.id, name: 'Thane', class: 'guerrero',
      attributes: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 8 }, // str +3, dex +1
      hp: { current: 16, max: 16 }, ac: 16, unassignedSkillPoints: 0,
    }, 'char-2');
    character.addToInventory({ equipmentId: 'longbow', name: 'Longbow' });
    character.equipWeapon('longbow');
    characters.seed(character);
    const equipment = new FakeEquipmentRepository([buildLongbow()]);
    const diceRoller = new FakeDiceRoller([10, 4]); // 10 + 1 (dex) = 11, no 10+3=13

    const useCase = new ResolvePlayerAttackUseCase(diceRoller, games, characters, equipment);
    const result = await useCase.execute({
      gameId: game.id, requestingUserId: 'user-2', attackerCharacterId: 'char-2', targetId: 'enc-1-goblin-a',
    });

    expect(result.attackRoll).toBe(11);
    expect(result.hit).toBe(false);
  });

  it('lanza DomainError si el usuario no es el dueño del personaje atacante', async () => {
    const { game, games } = buildGameWithEnemy(12);
    const characters = new FakeCharacterRepository();
    const character = Character.create({
      ownerId: 'user-1', gameId: game.id, name: 'Elyndra', class: 'mago',
      attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
      hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
    }, 'char-1');
    character.addToInventory({ equipmentId: 'dagger', name: 'Dagger' });
    character.equipWeapon('dagger');
    characters.seed(character);
    const equipment = new FakeEquipmentRepository([buildDagger()]);
    const useCase = new ResolvePlayerAttackUseCase(new FakeDiceRoller([10]), games, characters, equipment);

    await expect(
      useCase.execute({
        gameId: game.id, requestingUserId: 'otro-user', attackerCharacterId: 'char-1',
        targetId: 'enc-1-goblin-a',
      }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si el personaje no tiene ningún arma equipada', async () => {
    const { game, games } = buildGameWithEnemy(12);
    const characters = new FakeCharacterRepository();
    characters.seed(Character.create({
      ownerId: 'user-1', gameId: game.id, name: 'Elyndra', class: 'mago',
      attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
      hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
    }, 'char-1'));
    const equipment = new FakeEquipmentRepository([]);
    const useCase = new ResolvePlayerAttackUseCase(new FakeDiceRoller([]), games, characters, equipment);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-1', attackerCharacterId: 'char-1', targetId: 'enc-1-goblin-a' }),
    ).rejects.toThrow();
  });

  it('aplica el daño real a la partida cuando impacta', async () => {
    const { game, games } = buildGameWithEnemy(15);
    const characters = new FakeCharacterRepository();
    const character = Character.create({
      ownerId: 'user-1', gameId: game.id, name: 'Elyndra', class: 'mago',
      attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
      hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
    }, 'char-1');
    character.addToInventory({ equipmentId: 'dagger', name: 'Dagger' });
    character.equipWeapon('dagger');
    characters.seed(character);
    const equipment = new FakeEquipmentRepository([buildDagger()]);
    const diceRoller = new FakeDiceRoller([15, 3]); // ataque 15+2=17, daño 3

    const useCase = new ResolvePlayerAttackUseCase(diceRoller, games, characters, equipment);
    await useCase.execute({ gameId: game.id, requestingUserId: 'user-1', attackerCharacterId: 'char-1', targetId: 'enc-1-goblin-a' });

    const saved = await games.findById(game.id);
    const enemy = saved?.toSnapshot().activeEncounter?.enemies.find((e) => e.instanceId === 'enc-1-goblin-a');
    expect(enemy?.currentHp).toBe(4); // 7 - 3
  });

  function daggerWielder(gameId: string, characterId = 'char-1', ownerId = 'user-1') {
    const character = Character.create({
      ownerId, gameId, name: 'Elyndra', class: 'mago',
      attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
      hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
    }, characterId);
    character.addToInventory({ equipmentId: 'dagger', name: 'Dagger' });
    character.equipWeapon('dagger');
    return character;
  }

  it('ignora una CA enviada por el cliente: usa la CA real del enemigo', async () => {
    const { game, games } = buildGameWithEnemy(18);
    const characters = new FakeCharacterRepository();
    characters.seed(daggerWielder(game.id));
    const useCase = new ResolvePlayerAttackUseCase(new FakeDiceRoller([10, 3]), games, characters, new FakeEquipmentRepository([buildDagger()]));

    const result = await useCase.execute({
      gameId: game.id, requestingUserId: 'user-1', attackerCharacterId: 'char-1', targetId: 'enc-1-goblin-a',
      targetArmorClass: -50,
    } as any);

    expect(result.attackRoll).toBe(12);
    expect(result.hit).toBe(false); // 12 < 18
  });

  it('no permite atacar a un compañero de grupo', async () => {
    const { game, games } = buildGameWithEnemy();
    const characters = new FakeCharacterRepository();
    characters.seed(daggerWielder(game.id));
    const useCase = new ResolvePlayerAttackUseCase(new FakeDiceRoller([20, 4]), games, characters, new FakeEquipmentRepository([buildDagger()]));

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-1', attackerCharacterId: 'char-1', targetId: 'char-2' }),
    ).rejects.toThrow(DomainError);
  });

  it('exige tener el turno reclamado en el combate', async () => {
    const { game, games } = buildGameWithEnemy();
    const fresh = await games.findById(game.id);
    fresh!.releaseTurnAfterAction('char-1');
    await games.save(fresh!);
    const characters = new FakeCharacterRepository();
    characters.seed(daggerWielder(game.id));
    const useCase = new ResolvePlayerAttackUseCase(new FakeDiceRoller([20, 4]), games, characters, new FakeEquipmentRepository([buildDagger()]));

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-1', attackerCharacterId: 'char-1', targetId: 'enc-1-goblin-a' }),
    ).rejects.toThrow(DomainError);
  });

  it('rechaza atacar con un personaje que no es jugador de esa partida', async () => {
    const { game, games } = buildGameWithEnemy();
    const characters = new FakeCharacterRepository();
    characters.seed(daggerWielder('otra-partida', 'char-9', 'user-1'));
    const useCase = new ResolvePlayerAttackUseCase(new FakeDiceRoller([20, 4]), games, characters, new FakeEquipmentRepository([buildDagger()]));

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-1', attackerCharacterId: 'char-9', targetId: 'enc-1-goblin-a' }),
    ).rejects.toThrow(DomainError);
  });

  describe('desde el DM-IA (tool MCP resolve_player_attack)', () => {
    // CASO REAL (partida prueba2): Tablet tiró 14 y el DM narró el tajo sin
    // resolver nada -- el Zombie no perdió vida y el turno de Tablet nunca se
    // cerró. Con esta tool el DM solo dice quién ataca a quién: el arma, el
    // modificador y la armadura salen de los datos reales.
    function thaneWithGreatclub(gameId: string): FakeCharacterRepository {
      const characters = new FakeCharacterRepository();
      const character = Character.create({
        ownerId: 'user-2', gameId, name: 'Thane', class: 'guerrero',
        attributes: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 8 }, // str +3
        hp: { current: 16, max: 16 }, ac: 16, unassignedSkillPoints: 0,
      }, 'char-2');
      character.addToInventory({ equipmentId: 'greatclub', name: 'Greatclub' });
      character.equipWeapon('greatclub');
      characters.seed(character);
      return characters;
    }

    it('sin requestingUserId, usa la tirada del jugador (playerD20) y deja la tirada en el chat', async () => {
      const { game, games } = buildGameWithEnemy(13);
      const useCase = new ResolvePlayerAttackUseCase(
          new FakeDiceRoller([5]), games, thaneWithGreatclub(game.id), new FakeEquipmentRepository([buildGreatclub()]),
      );

      const result = await useCase.execute({
        gameId: game.id, attackerCharacterId: 'char-2', targetId: 'enc-1-goblin-a', playerD20: 12,
      });

      expect(result).toEqual(expect.objectContaining({
        hit: true, attackRoll: 15, damage: 5, weaponName: 'Greatclub', targetRemainingHp: 2, targetDefeated: false,
      }));
      const log = (await games.findById(game.id))!.toSnapshot().narrativeLog;
      expect(log[log.length - 1].content).toBe(
          '🎲 **Thane** ataca con Greatclub a **Goblin explorador** (1d20+3 (tirada del jugador)): **15** vs Armadura 13 ' +
          '→ ¡IMPACTA! — Daño (1d8): **5**',
      );
    });

    it('si el golpe deja al enemigo a 0 HP, el chat dice que cae derrotado', async () => {
      const { game, games } = buildGameWithEnemy(13);
      const useCase = new ResolvePlayerAttackUseCase(
          new FakeDiceRoller([8]), games, thaneWithGreatclub(game.id), new FakeEquipmentRepository([buildGreatclub()]),
      );

      const result = await useCase.execute({
        gameId: game.id, attackerCharacterId: 'char-2', targetId: 'enc-1-goblin-a', playerD20: 15,
      });

      expect(result.targetDefeated).toBe(true);
      const log = (await games.findById(game.id))!.toSnapshot().narrativeLog;
      expect(log[log.length - 1].content).toContain('— **Goblin explorador** cae derrotado.');
    });

    it('un fallo también queda en el chat, sin daño', async () => {
      const { game, games } = buildGameWithEnemy(13);
      const useCase = new ResolvePlayerAttackUseCase(
          new FakeDiceRoller([]), games, thaneWithGreatclub(game.id), new FakeEquipmentRepository([buildGreatclub()]),
      );

      const result = await useCase.execute({
        gameId: game.id, attackerCharacterId: 'char-2', targetId: 'enc-1-goblin-a', playerD20: 2,
      });

      expect(result.hit).toBe(false);
      const log = (await games.findById(game.id))!.toSnapshot().narrativeLog;
      expect(log[log.length - 1].content).toMatch(/\*\*5\*\* vs Armadura 13 → falla$/);
    });

    it('rechaza una playerD20 fuera de 1-20', async () => {
      const { game, games } = buildGameWithEnemy(13);
      const useCase = new ResolvePlayerAttackUseCase(
          new FakeDiceRoller([]), games, thaneWithGreatclub(game.id), new FakeEquipmentRepository([buildGreatclub()]),
      );

      await expect(useCase.execute({
        gameId: game.id, attackerCharacterId: 'char-2', targetId: 'enc-1-goblin-a', playerD20: 25,
      })).rejects.toThrow(/1 y 20/);
    });
  });
});

