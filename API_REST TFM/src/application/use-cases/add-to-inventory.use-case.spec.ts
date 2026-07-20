import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { EquipmentRepository, EquipmentSearchCriteria } from '../../domain/ports/equipment.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { Equipment } from '../../domain/entities/equipment.entity';
import { AddToInventoryUseCase } from './add-to-inventory.use-case';

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
      properties: ['finesse', 'light', 'thrown', 'monk'],
    },
    'dagger',
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

describe('AddToInventoryUseCase', () => {
  it('añade el equipo del catálogo al inventario del personaje, si el usuario es el dueño', async () => {
    const characters = new FakeCharacterRepository();
    const character = buildCharacter();
    characters.seed(character);
    const equipment = new FakeEquipmentRepository([buildDagger()]);
    const useCase = new AddToInventoryUseCase(characters, equipment);

    await useCase.execute({ characterId: 'char-1', requestingUserId: 'user-1', equipmentId: 'dagger' });

    const saved = await characters.findById('char-1');
    expect(saved?.toSnapshot().inventory).toEqual([{ equipmentId: 'dagger', name: 'Dagger' }]);
  });

  it('lanza DomainError si el usuario no es el dueño del personaje', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacter());
    const equipment = new FakeEquipmentRepository([buildDagger()]);
    const useCase = new AddToInventoryUseCase(characters, equipment);

    await expect(
      useCase.execute({ characterId: 'char-1', requestingUserId: 'user-2', equipmentId: 'dagger' }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si el equipo no existe en el catálogo', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacter());
    const equipment = new FakeEquipmentRepository([]);
    const useCase = new AddToInventoryUseCase(characters, equipment);

    await expect(
      useCase.execute({ characterId: 'char-1', requestingUserId: 'user-1', equipmentId: 'no-existe' }),
    ).rejects.toThrow();
  });
});
