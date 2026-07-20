import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { GrantXpUseCase } from './grant-xp.use-case';

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

describe('GrantXpUseCase', () => {
  it('otorga XP al personaje y persiste el resultado, incluyendo si sube de nivel', async () => {
    const characters = new FakeCharacterRepository();
    const character = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' });
    characters.seed(character);

    const useCase = new GrantXpUseCase(characters);
    const result = await useCase.execute({ characterId: character.id, amount: 300 });

    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBe(2);

    const saved = await characters.findById(character.id);
    expect(saved?.toSnapshot().level).toBe(2);
  });

  it('indica que no ha subido de nivel cuando la XP no alcanza el umbral', async () => {
    const characters = new FakeCharacterRepository();
    const character = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' });
    characters.seed(character);

    const useCase = new GrantXpUseCase(characters);
    const result = await useCase.execute({ characterId: character.id, amount: 50 });

    expect(result.leveledUp).toBe(false);
    expect(result.newLevel).toBe(1);
  });

  it('lanza DomainError si el personaje no existe', async () => {
    const characters = new FakeCharacterRepository();
    const useCase = new GrantXpUseCase(characters);

    await expect(useCase.execute({ characterId: 'no-existe', amount: 100 })).rejects.toThrow();
  });
});
