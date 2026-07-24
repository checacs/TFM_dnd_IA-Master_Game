import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { EquipmentRepository } from '../../domain/ports/equipment.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { Equipment } from '../../domain/entities/equipment.entity';
import { GrantItemUseCase } from './grant-item.use-case';

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
      properties: ['finesse', 'light', 'thrown', 'monk'], armorClass: null,
    },
    'dagger',
  );
}

function buildCharacter() {
  return Character.create({
    ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago',
    attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
    hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
  }, 'char-1');
}

describe('GrantItemUseCase', () => {
  it(
      'añade el equipo del catálogo al inventario del personaje -- lo llama el DM-IA (tool MCP ' +
      'grant_item) cuando la narración implica que un jugador encuentra o recibe un objeto (ej. una daga ' +
      'que apareció narrada pero nunca llegó a la ficha porque no existía ninguna tool para concederla), ' +
      'SIN comprobar propiedad (a diferencia de AddToInventoryUseCase, que es el jugador añadiendo algo ' +
      'por su cuenta, ej. una compra)',
      async () => {
        const characters = new FakeCharacterRepository();
        characters.seed(buildCharacter());
        const equipment = new FakeEquipmentRepository([buildDagger()]);
        const useCase = new GrantItemUseCase(characters, equipment);

        await useCase.execute({ characterId: 'char-1', equipmentId: 'dagger' });

        const saved = await characters.findById('char-1');
        expect(saved?.toSnapshot().inventory).toEqual([{ equipmentId: 'dagger', name: 'Dagger' }]);
      },
  );

  it('permite conceder varios objetos distintos al mismo personaje (se acumulan, no se pisan)', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacter());
    const shield = Equipment.create(
      {
        name: 'Shield', category: 'Armor', cost: { quantity: 10, unit: 'gp' }, weight: 6, description: '',
        weaponCategory: null, weaponRange: null, damageDice: null, damageType: null, properties: [], armorClass: null,
      },
      'shield',
    );
    const equipment = new FakeEquipmentRepository([buildDagger(), shield]);
    const useCase = new GrantItemUseCase(characters, equipment);

    await useCase.execute({ characterId: 'char-1', equipmentId: 'dagger' });
    await useCase.execute({ characterId: 'char-1', equipmentId: 'shield' });

    const saved = await characters.findById('char-1');
    expect(saved?.toSnapshot().inventory).toEqual([
      { equipmentId: 'dagger', name: 'Dagger' },
      { equipmentId: 'shield', name: 'Shield' },
    ]);
  });

  it('lanza DomainError si el personaje no existe', async () => {
    const characters = new FakeCharacterRepository();
    const equipment = new FakeEquipmentRepository([buildDagger()]);
    const useCase = new GrantItemUseCase(characters, equipment);

    await expect(useCase.execute({ characterId: 'no-existe', equipmentId: 'dagger' })).rejects.toThrow();
  });

  it('lanza DomainError si el equipo no existe en el catálogo (nunca inventar un objeto)', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacter());
    const equipment = new FakeEquipmentRepository([]);
    const useCase = new GrantItemUseCase(characters, equipment);

    await expect(useCase.execute({ characterId: 'char-1', equipmentId: 'no-existe' })).rejects.toThrow();
  });
});
