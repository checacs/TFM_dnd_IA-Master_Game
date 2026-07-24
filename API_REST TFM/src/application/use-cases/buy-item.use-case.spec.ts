import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { EquipmentRepository } from '../../domain/ports/equipment.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { Equipment } from '../../domain/entities/equipment.entity';
import { BuyItemUseCase } from './buy-item.use-case';

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

class FakeEquipmentRepository implements EquipmentRepository {
  constructor(private readonly items: Equipment[] = []) {}
  async findById(id: string): Promise<Equipment | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }
  async search(): Promise<Equipment[]> {
    return this.items;
  }
}

function buildDagger() {
  return Equipment.create(
    {
      name: 'Dagger', category: 'Weapon', cost: { quantity: 2, unit: 'gp' }, weight: 1, description: '',
      weaponCategory: 'Simple', weaponRange: 'Melee', damageDice: '1d4', damageType: 'piercing',
      properties: ['finesse'], armorClass: null,
    },
    'dagger',
  );
}

function buildFreeSpecialItem() {
  return Equipment.create(
    {
      name: 'Objeto sin precio', category: 'Adventuring Gear', cost: null, weight: null, description: '',
      weaponCategory: null, weaponRange: null, damageDice: null, damageType: null,
      properties: [], armorClass: null,
    },
    'sin-precio',
  );
}

function buildCharacter(overrides: Partial<Parameters<typeof Character.create>[0]> = {}) {
  return Character.create({
    ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago',
    attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
    hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
    ...overrides,
  }, 'char-1');
}

describe('BuyItemUseCase', () => {
  it('descuenta el precio real del catálogo y añade el objeto al inventario', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacter({ currency: { gold: 5, silver: 0, copper: 0 } }));
    const equipment = new FakeEquipmentRepository([buildDagger()]);
    const useCase = new BuyItemUseCase(characters, equipment);

    await useCase.execute({ characterId: 'char-1', equipmentId: 'dagger' });

    const saved = await characters.findById('char-1');
    const snapshot = saved?.toSnapshot();
    expect(snapshot?.currency).toEqual({ gold: 3, silver: 0, copper: 0 }); // 5 - 2 = 3
    expect(snapshot?.inventory).toEqual([{ equipmentId: 'dagger', name: 'Dagger' }]);
  });

  it('lanza DomainError si no le llega el dinero, y NO descuenta ni añade nada', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacter({ currency: { gold: 1, silver: 0, copper: 0 } }));
    const equipment = new FakeEquipmentRepository([buildDagger()]);
    const useCase = new BuyItemUseCase(characters, equipment);

    await expect(useCase.execute({ characterId: 'char-1', equipmentId: 'dagger' })).rejects.toThrow();

    const saved = await characters.findById('char-1');
    const snapshot = saved?.toSnapshot();
    expect(snapshot?.currency).toEqual({ gold: 1, silver: 0, copper: 0 });
    expect(snapshot?.inventory).toEqual([]);
  });

  it('lanza DomainError si el objeto no tiene precio definido en el catálogo', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacter({ currency: { gold: 100, silver: 0, copper: 0 } }));
    const equipment = new FakeEquipmentRepository([buildFreeSpecialItem()]);
    const useCase = new BuyItemUseCase(characters, equipment);

    await expect(useCase.execute({ characterId: 'char-1', equipmentId: 'sin-precio' })).rejects.toThrow();
  });

  it('lanza DomainError si el equipo no existe en el catálogo (nunca inventar un objeto ni un precio)', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacter());
    const equipment = new FakeEquipmentRepository([]);
    const useCase = new BuyItemUseCase(characters, equipment);

    await expect(useCase.execute({ characterId: 'char-1', equipmentId: 'no-existe' })).rejects.toThrow();
  });

  it('lanza DomainError si el personaje no existe', async () => {
    const characters = new FakeCharacterRepository();
    const equipment = new FakeEquipmentRepository([buildDagger()]);
    const useCase = new BuyItemUseCase(characters, equipment);

    await expect(useCase.execute({ characterId: 'no-existe', equipmentId: 'dagger' })).rejects.toThrow();
  });
});
