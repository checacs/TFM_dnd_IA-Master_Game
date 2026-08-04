import { GameRepository } from '../../domain/ports/game.repository.port';
import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { Character } from '../../domain/entities/character.entity';
import { DeleteGameUseCase } from './delete-game.use-case';

class FakeGameRepository implements GameRepository {
  private readonly games = new Map<string, Game>();
  seed(game: Game): void {
    this.games.set(game.id, game);
  }
  async findById(id: string): Promise<Game | null> {
    return this.games.get(id) ?? null;
  }
  async findByUserId(_userId: string): Promise<Game[]> { return []; }
  async save(game: Game): Promise<void> {
    this.games.set(game.id, game);
  }
  async deleteById(id: string): Promise<void> {
    this.games.delete(id);
  }
}

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
  async deleteByGameId(gameId: string): Promise<void> {
    for (const [id, character] of this.characters) {
      if (character.toSnapshot().gameId === gameId) {
        this.characters.delete(id);
      }
    }
  }
}

function buildGameWithCharacters(): { game: Game; otherGame: Game; repo: FakeGameRepository; characters: FakeCharacterRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  const otherGame = Game.create({ name: 'Otra partida', hostUserId: 'host-2', maxPlayers: 4 });
  const repo = new FakeGameRepository();
  repo.seed(game);
  repo.seed(otherGame);

  const characters = new FakeCharacterRepository();
  characters.seed(Character.createNew({ ownerId: 'user-1', gameId: game.id, name: 'Elyndra', class: 'mago' }, 'char-1'));
  characters.seed(Character.createNew({ ownerId: 'user-2', gameId: game.id, name: 'Thane', class: 'guerrero' }, 'char-2'));
  characters.seed(Character.createNew({ ownerId: 'user-3', gameId: otherGame.id, name: 'Bruma', class: 'picaro' }, 'char-3'));

  return { game, otherGame, repo, characters };
}

describe('DeleteGameUseCase', () => {
  it('borra la partida', async () => {
    const { game, repo, characters } = buildGameWithCharacters();
    const useCase = new DeleteGameUseCase(repo, characters);

    await useCase.execute({ gameId: game.id });

    expect(await repo.findById(game.id)).toBeNull();
  });

  it('borra en cascada los personajes de esa partida, sin tocar los de otras partidas', async () => {
    const { game, otherGame, repo, characters } = buildGameWithCharacters();
    const useCase = new DeleteGameUseCase(repo, characters);

    await useCase.execute({ gameId: game.id });

    expect(await characters.findById('char-1')).toBeNull();
    expect(await characters.findById('char-2')).toBeNull();
    expect(await characters.findById('char-3')).not.toBeNull();
    expect((await repo.findById(otherGame.id))).not.toBeNull();
  });

  it('lanza DomainError si la partida no existe', async () => {
    const repo = new FakeGameRepository();
    const characters = new FakeCharacterRepository();
    const useCase = new DeleteGameUseCase(repo, characters);

    await expect(
      useCase.execute({ gameId: 'no-existe' }),
    ).rejects.toThrow();
  });
});
