import { DiceRoller } from '../../domain/ports/dice-roller.port';
import { GameRepository } from '../../domain/ports/game.repository.port';
import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { EquipmentRepository, EquipmentSearchCriteria } from '../../domain/ports/equipment.repository.port';
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
}

class FakeCharacterRepository implements CharacterRepository {
  private readonly characters = new Map<string, Character>();
  seed(character: Character): void {
    this.characters.set(character.id, character);
  }
  async findById(id: string): Promise<Character | null> {
    return this.characters.get(id) ?? null;
  }
  async save(): Promise<void> {}
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
      properties: ['finesse', 'light', 'thrown'],
    },
    'dagger',
  );
}

function buildGreatclub() {
  return Equipment.create(
    {
      name: 'Greatclub', category: 'Weapon', cost: null, weight: 10, description: '',
      weaponCategory: 'Simple', weaponRange: 'Melee', damageDice: '1d8', damageType: 'bludgeoning',
      properties: [],
    },
    'greatclub',
  );
}

function buildLongbow() {
  return Equipment.create(
    {
      name: 'Longbow', category: 'Weapon', cost: null, weight: 2, description: '',
      weaponCategory: 'Martial', weaponRange: 'Ranged', damageDice: '1d8', damageType: 'piercing',
      properties: [],
    },
    'longbow',
  );
}

function buildGameWithEnemy(): { game: Game; games: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 14 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
  game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
  game.launch('host-1');
  game.startEncounter({
    enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
  });
  const games = new FakeGameRepository();
  games.seed(game);
  return { game, games };
}

describe('ResolvePlayerAttackUseCase', () => {
  it('usa el modificador de STR si el arma no es finesse ni a distancia', async () => {
    const { game, games } = buildGameWithEnemy();
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
      gameId: game.id, requestingUserId: 'user-2', attackerCharacterId: 'char-2', targetId: 'enc-1-goblin-a', targetArmorClass: 13,
    });

    expect(result.attackRoll).toBe(13);
    expect(result.hit).toBe(true);
  });

  it('usa el mayor entre STR y DEX si el arma tiene la propiedad finesse', async () => {
    const { game, games } = buildGameWithEnemy();
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
      gameId: game.id, requestingUserId: 'user-1', attackerCharacterId: 'char-1', targetId: 'enc-1-goblin-a', targetArmorClass: 12,
    });

    expect(result.attackRoll).toBe(12);
    expect(result.hit).toBe(true);
  });

  it('usa el modificador de DEX si el arma es a distancia, aunque STR sea mayor', async () => {
    const { game, games } = buildGameWithEnemy();
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
      gameId: game.id, requestingUserId: 'user-2', attackerCharacterId: 'char-2', targetId: 'enc-1-goblin-a', targetArmorClass: 12,
    });

    expect(result.attackRoll).toBe(11);
    expect(result.hit).toBe(false);
  });

  it('lanza DomainError si el usuario no es el dueño del personaje atacante', async () => {
    const { game, games } = buildGameWithEnemy();
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
        targetId: 'enc-1-goblin-a', targetArmorClass: 12,
      }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si el personaje no tiene ningún arma equipada', async () => {
    const { game, games } = buildGameWithEnemy();
    const characters = new FakeCharacterRepository();
    characters.seed(Character.create({
      ownerId: 'user-1', gameId: game.id, name: 'Elyndra', class: 'mago',
      attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
      hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
    }, 'char-1'));
    const equipment = new FakeEquipmentRepository([]);
    const useCase = new ResolvePlayerAttackUseCase(new FakeDiceRoller([]), games, characters, equipment);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-1', attackerCharacterId: 'char-1', targetId: 'enc-1-goblin-a', targetArmorClass: 12 }),
    ).rejects.toThrow();
  });

  it('aplica el daño real a la partida cuando impacta', async () => {
    const { game, games } = buildGameWithEnemy();
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
    await useCase.execute({ gameId: game.id, requestingUserId: 'user-1', attackerCharacterId: 'char-1', targetId: 'enc-1-goblin-a', targetArmorClass: 15 });

    const saved = await games.findById(game.id);
    const enemy = saved?.toSnapshot().activeEncounter?.enemies.find((e) => e.instanceId === 'enc-1-goblin-a');
    expect(enemy?.currentHp).toBe(4); // 7 - 3
  });
});
