import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { GetCharacterUseCase } from './get-character.use-case';

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

describe('GetCharacterUseCase', () => {
  it('devuelve la ficha completa del personaje (incluida la CA)', async () => {
    const characters = new FakeCharacterRepository();
    const character = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' });
    characters.seed(character);

    const useCase = new GetCharacterUseCase(characters);
    const result = await useCase.execute({ characterId: character.id });

    expect(result.name).toBe('Thane');
    expect(result.ac).toBe(character.toSnapshot().ac);
    expect(result.attributes).toEqual(character.toSnapshot().attributes);
  });

  it('lanza DomainError si el personaje no existe', async () => {
    const characters = new FakeCharacterRepository();
    const useCase = new GetCharacterUseCase(characters);

    await expect(useCase.execute({ characterId: 'no-existe' })).rejects.toThrow();
  });
});
