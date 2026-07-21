import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { MagicItemRepository } from '../../domain/ports/magic-item.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { MagicItem } from '../../domain/entities/magic-item.entity';
import { GrantMagicItemUseCase } from './grant-magic-item.use-case';

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

class FakeMagicItemRepository implements MagicItemRepository {
  constructor(private readonly items: MagicItem[] = []) {}
  async findById(id: string): Promise<MagicItem | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }
  async search(): Promise<MagicItem[]> {
    return this.items;
  }
}

function buildRingOfProtection() {
  return MagicItem.create(
    {
      name: 'Ring of Protection', category: 'Ring', rarity: 'Rare', description: '...',
      isVariant: false, variantNames: [],
    },
    'ring-of-protection',
  );
}

function buildCharacter() {
  return Character.create({
    ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago',
    attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
    hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
  }, 'char-1');
}

describe('GrantMagicItemUseCase', () => {
  it(
      'añade un objeto mágico del catálogo al inventario del personaje -- lo llama el DM-IA (tool MCP ' +
      'grant_magic_item) cuando la narración implica que un jugador encuentra o recibe un objeto mágico ' +
      'concreto (ej. "el anillo brilla en tu mano"). Hasta ahora get_magic_items solo servía para consultar ' +
      'el catálogo (evitar inventar su efecto), pero no existía ninguna tool para concederlo de verdad -- el ' +
      'mismo hueco que grant_item ya resolvió para el equipo normal, sin extenderlo a objetos mágicos. Sin ' +
      'comprobación de propiedad (el DM concede, el jugador no lo reclama por su cuenta).',
      async () => {
        const characters = new FakeCharacterRepository();
        characters.seed(buildCharacter());
        const magicItems = new FakeMagicItemRepository([buildRingOfProtection()]);
        const useCase = new GrantMagicItemUseCase(characters, magicItems);

        await useCase.execute({ characterId: 'char-1', magicItemId: 'ring-of-protection' });

        const saved = await characters.findById('char-1');
        expect(saved?.toSnapshot().inventory).toEqual([{ equipmentId: 'ring-of-protection', name: 'Ring of Protection' }]);
      },
  );

  it('permite conceder varios objetos mágicos distintos al mismo personaje (se acumulan, no se pisan)', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacter());
    const cloak = MagicItem.create(
      { name: 'Cloak of Elvenkind', category: 'Wondrous Item', rarity: 'Uncommon', description: '...', isVariant: false, variantNames: [] },
      'cloak-of-elvenkind',
    );
    const magicItems = new FakeMagicItemRepository([buildRingOfProtection(), cloak]);
    const useCase = new GrantMagicItemUseCase(characters, magicItems);

    await useCase.execute({ characterId: 'char-1', magicItemId: 'ring-of-protection' });
    await useCase.execute({ characterId: 'char-1', magicItemId: 'cloak-of-elvenkind' });

    const saved = await characters.findById('char-1');
    expect(saved?.toSnapshot().inventory).toEqual([
      { equipmentId: 'ring-of-protection', name: 'Ring of Protection' },
      { equipmentId: 'cloak-of-elvenkind', name: 'Cloak of Elvenkind' },
    ]);
  });

  it('lanza DomainError si el personaje no existe', async () => {
    const characters = new FakeCharacterRepository();
    const magicItems = new FakeMagicItemRepository([buildRingOfProtection()]);
    const useCase = new GrantMagicItemUseCase(characters, magicItems);

    await expect(useCase.execute({ characterId: 'no-existe', magicItemId: 'ring-of-protection' })).rejects.toThrow();
  });

  it('lanza DomainError si el objeto mágico no existe en el catálogo (nunca inventar uno)', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacter());
    const magicItems = new FakeMagicItemRepository([]);
    const useCase = new GrantMagicItemUseCase(characters, magicItems);

    await expect(useCase.execute({ characterId: 'char-1', magicItemId: 'no-existe' })).rejects.toThrow();
  });
});
