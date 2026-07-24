import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { EquipmentRepository } from '../../domain/ports/equipment.repository.port';
import { MagicItemRepository } from '../../domain/ports/magic-item.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { Equipment } from '../../domain/entities/equipment.entity';
import { MagicItem } from '../../domain/entities/magic-item.entity';
import { EquipItemUseCase } from './equip-item.use-case';

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

class FakeMagicItemRepository implements MagicItemRepository {
  constructor(private readonly items: MagicItem[] = []) {}
  async findById(id: string): Promise<MagicItem | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }
  async search(): Promise<MagicItem[]> {
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

function buildLeatherArmor() {
  return Equipment.create(
    {
      name: 'Leather Armor', category: 'Armor', cost: { quantity: 10, unit: 'gp' }, weight: 10, description: '',
      weaponCategory: null, weaponRange: null, damageDice: null, damageType: null,
      properties: [], armorClass: { base: 11, dexBonus: true, maxBonus: null },
    },
    'leather-armor',
  );
}

function buildRingOfProtection() {
  return MagicItem.create(
    { name: 'Anillo de Protección', category: 'Ring', rarity: 'Rare', description: '', isVariant: false, variantNames: [] },
    'ring-of-protection',
  );
}

function buildCharacterWithInventory(items: { equipmentId: string; name: string }[]) {
  const character = Character.create({
    ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago',
    attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
    hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
  }, 'char-1');
  for (const item of items) character.addToInventory(item);
  return character;
}

describe('EquipItemUseCase', () => {
  it('equipa un arma real del catálogo (equippedWeaponId)', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacterWithInventory([{ equipmentId: 'dagger', name: 'Dagger' }]));
    const useCase = new EquipItemUseCase(
      characters, new FakeEquipmentRepository([buildDagger()]), new FakeMagicItemRepository([]),
    );

    await useCase.execute({ characterId: 'char-1', requestingUserId: 'user-1', equipmentId: 'dagger' });

    expect((await characters.findById('char-1'))?.toSnapshot().equippedWeaponId).toBe('dagger');
  });

  it('equipa una armadura real y recalcula la CA de verdad (11 base + mod destreza +2 = 13)', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacterWithInventory([{ equipmentId: 'leather-armor', name: 'Leather Armor' }]));
    const useCase = new EquipItemUseCase(
      characters, new FakeEquipmentRepository([buildLeatherArmor()]), new FakeMagicItemRepository([]),
    );

    await useCase.execute({ characterId: 'char-1', requestingUserId: 'user-1', equipmentId: 'leather-armor' });

    const snapshot = (await characters.findById('char-1'))?.toSnapshot();
    expect(snapshot?.equippedArmorId).toBe('leather-armor');
    expect(snapshot?.ac).toBe(13);
  });

  it('equipa un objeto mágico que no está en el catálogo de equipo normal (equippedAccessoryId)', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacterWithInventory([{ equipmentId: 'ring-of-protection', name: 'Anillo de Protección' }]));
    const useCase = new EquipItemUseCase(
      characters, new FakeEquipmentRepository([]), new FakeMagicItemRepository([buildRingOfProtection()]),
    );

    await useCase.execute({ characterId: 'char-1', requestingUserId: 'user-1', equipmentId: 'ring-of-protection' });

    expect((await characters.findById('char-1'))?.toSnapshot().equippedAccessoryId).toBe('ring-of-protection');
  });

  it('lanza DomainError si el usuario no es el dueño', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacterWithInventory([{ equipmentId: 'dagger', name: 'Dagger' }]));
    const useCase = new EquipItemUseCase(
      characters, new FakeEquipmentRepository([buildDagger()]), new FakeMagicItemRepository([]),
    );

    await expect(
      useCase.execute({ characterId: 'char-1', requestingUserId: 'otro-user', equipmentId: 'dagger' }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si el objeto no existe en ningún catálogo', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacterWithInventory([]));
    const useCase = new EquipItemUseCase(
      characters, new FakeEquipmentRepository([]), new FakeMagicItemRepository([]),
    );

    await expect(
      useCase.execute({ characterId: 'char-1', requestingUserId: 'user-1', equipmentId: 'no-existe' }),
    ).rejects.toThrow();
  });

  it('propaga el error de dominio si el objeto de equipo normal no está en el inventario', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacterWithInventory([]));
    const useCase = new EquipItemUseCase(
      characters, new FakeEquipmentRepository([buildDagger()]), new FakeMagicItemRepository([]),
    );

    await expect(
      useCase.execute({ characterId: 'char-1', requestingUserId: 'user-1', equipmentId: 'dagger' }),
    ).rejects.toThrow();
  });
});
