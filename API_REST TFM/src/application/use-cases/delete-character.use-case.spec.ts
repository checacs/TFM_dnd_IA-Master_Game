import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { DeleteCharacterUseCase } from './delete-character.use-case';

class FakeCharacterRepository implements CharacterRepository {
  constructor(private readonly characters: Character[] = []) {}
  async findById(id: string): Promise<Character | null> {
    return this.characters.find((c) => c.id === id) ?? null;
  }
  async findByOwnerId(ownerId: string): Promise<Character[]> {
    return this.characters.filter((c) => c.toSnapshot().ownerId === ownerId);
  }
  async save(character: Character): Promise<void> {
    this.characters.push(character);
  }
  async deleteById(id: string): Promise<void> {
    const idx = this.characters.findIndex((c) => c.id === id);
    if (idx >= 0) this.characters.splice(idx, 1);
  }
  async deleteByGameId(gameId: string): Promise<void> {
    for (let i = this.characters.length - 1; i >= 0; i -= 1) {
      if (this.characters[i].toSnapshot().gameId === gameId) this.characters.splice(i, 1);
    }
  }
}

describe('DeleteCharacterUseCase', () => {
  it('borra el personaje indicado, sin tocar el resto', async () => {
    const kept = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago' }, 'char-1');
    const toDelete = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' }, 'char-2');
    const characters = new FakeCharacterRepository([kept, toDelete]);

    const useCase = new DeleteCharacterUseCase(characters);
    await useCase.execute({ characterId: 'char-2' });

    expect(await characters.findById('char-2')).toBeNull();
    expect(await characters.findById('char-1')).not.toBeNull();
  });

  it('lanza DomainError si el personaje no existe', async () => {
    const useCase = new DeleteCharacterUseCase(new FakeCharacterRepository([]));

    await expect(useCase.execute({ characterId: 'no-existe' })).rejects.toThrow();
  });
});
