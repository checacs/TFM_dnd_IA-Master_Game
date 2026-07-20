import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { LevelUpUseCase } from './level-up.use-case';

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

function buildCharacter(overrides: Partial<Parameters<typeof Character.create>[0]> = {}) {
  return Character.create({
    ownerId: 'user-1',
    gameId: 'game-1',
    name: 'Elyndra',
    class: 'mago',
    attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
    hp: { current: 11, max: 14 },
    ac: 12,
    unassignedSkillPoints: 2,
    ...overrides,
  });
}

describe('LevelUpUseCase', () => {
  it('asigna un punto de habilidad cuando el personaje pertenece al usuario', async () => {
    const characters = new FakeCharacterRepository();
    const character = buildCharacter();
    characters.seed(character);
    const useCase = new LevelUpUseCase(characters);

    await useCase.execute({ characterId: character.id, requestingUserId: 'user-1', attribute: 'con' });

    const saved = await characters.findById(character.id);
    expect(saved?.attributeModifier('con')).toBe(1); // 12 -> 13, floor(3/2)=1
    expect(saved?.toSnapshot().unassignedSkillPoints).toBe(1);
  });

  it('lanza DomainError si el personaje no pertenece al usuario que lo pide, y no modifica nada', async () => {
    const characters = new FakeCharacterRepository();
    const character = buildCharacter({ ownerId: 'user-1' });
    characters.seed(character);
    const useCase = new LevelUpUseCase(characters);

    await expect(
      useCase.execute({ characterId: character.id, requestingUserId: 'user-2', attribute: 'con' }),
    ).rejects.toThrow();

    const saved = await characters.findById(character.id);
    expect(saved?.toSnapshot().unassignedSkillPoints).toBe(2); // sin cambios
  });

  it('lanza DomainError si el personaje no existe', async () => {
    const characters = new FakeCharacterRepository();
    const useCase = new LevelUpUseCase(characters);

    await expect(
      useCase.execute({ characterId: 'no-existe', requestingUserId: 'user-1', attribute: 'con' }),
    ).rejects.toThrow();
  });

  it('propaga el error de dominio si no hay puntos de habilidad disponibles', async () => {
    const characters = new FakeCharacterRepository();
    const character = buildCharacter({ unassignedSkillPoints: 0 });
    characters.seed(character);
    const useCase = new LevelUpUseCase(characters);

    await expect(
      useCase.execute({ characterId: character.id, requestingUserId: 'user-1', attribute: 'con' }),
    ).rejects.toThrow();
  });
});
