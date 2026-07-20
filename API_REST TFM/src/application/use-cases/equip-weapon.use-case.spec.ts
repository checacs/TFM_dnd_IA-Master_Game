import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { EquipWeaponUseCase } from './equip-weapon.use-case';

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

function buildCharacterWithDagger() {
  const character = Character.create({
    ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago',
    attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
    hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
  }, 'char-1');
  character.addToInventory({ equipmentId: 'dagger', name: 'Dagger' });
  return character;
}

describe('EquipWeaponUseCase', () => {
  it('equipa un arma que ya está en el inventario, si el usuario es el dueño', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacterWithDagger());
    const useCase = new EquipWeaponUseCase(characters);

    await useCase.execute({ characterId: 'char-1', requestingUserId: 'user-1', equipmentId: 'dagger' });

    const saved = await characters.findById('char-1');
    expect(saved?.toSnapshot().equippedWeaponId).toBe('dagger');
  });

  it('lanza DomainError si el usuario no es el dueño', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacterWithDagger());
    const useCase = new EquipWeaponUseCase(characters);

    await expect(
      useCase.execute({ characterId: 'char-1', requestingUserId: 'otro-user', equipmentId: 'dagger' }),
    ).rejects.toThrow();
  });

  it('propaga el error de dominio si el objeto no está en el inventario', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacterWithDagger());
    const useCase = new EquipWeaponUseCase(characters);

    await expect(
      useCase.execute({ characterId: 'char-1', requestingUserId: 'user-1', equipmentId: 'longsword' }),
    ).rejects.toThrow();
  });
});
