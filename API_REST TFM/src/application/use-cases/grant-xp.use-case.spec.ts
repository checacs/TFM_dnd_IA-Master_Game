import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { GameRepository } from '../../domain/ports/game.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { Game } from '../../domain/entities/game.entity';
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
}

/**
 * Partida mínima sembrada en el repo dado -- el Character del test debe
 * crearse con gameId: game.id (el id real que genera Game.create()) para que
 * GrantXpUseCase pueda encontrarla.
 */
function buildGame(repo: FakeGameRepository): Game {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  repo.seed(game);
  return game;
}

describe('GrantXpUseCase', () => {
  it('otorga XP al personaje y persiste el resultado, incluyendo si sube de nivel', async () => {
    const characters = new FakeCharacterRepository();
    const games = new FakeGameRepository();
    const game = buildGame(games);
    const character = Character.createNew({ ownerId: 'user-1', gameId: game.id, name: 'Thane', class: 'guerrero' });
    characters.seed(character);

    const useCase = new GrantXpUseCase(characters, games);
    const result = await useCase.execute({ gameId: game.id, characterId: character.id, amount: 300 });

    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBe(2);

    const saved = await characters.findById(character.id);
    expect(saved?.toSnapshot().level).toBe(2);
  });

  it('indica que no ha subido de nivel cuando la XP no alcanza el umbral', async () => {
    const characters = new FakeCharacterRepository();
    const games = new FakeGameRepository();
    const game = buildGame(games);
    const character = Character.createNew({ ownerId: 'user-1', gameId: game.id, name: 'Thane', class: 'guerrero' });
    characters.seed(character);

    const useCase = new GrantXpUseCase(characters, games);
    const result = await useCase.execute({ gameId: game.id, characterId: character.id, amount: 50 });

    expect(result.leveledUp).toBe(false);
    expect(result.newLevel).toBe(1);
  });

  it(
      'añade un mensaje de sistema garantizado al narrativeLog de la partida notificando la XP ganada -- ' +
      'antes la XP se otorgaba en silencio, sin ningún rastro en el chat, y el jugador no tenía forma de saber ' +
      'que había ganado experiencia salvo consultando su ficha',
      async () => {
        const characters = new FakeCharacterRepository();
        const games = new FakeGameRepository();
        const game = buildGame(games);
        const character = Character.createNew({ ownerId: 'user-1', gameId: game.id, name: 'Thane', class: 'guerrero' });
        characters.seed(character);

        const useCase = new GrantXpUseCase(characters, games);
        await useCase.execute({ gameId: game.id, characterId: character.id, amount: 55 });

        const savedGame = await games.findById(game.id);
        const log = savedGame!.toSnapshot().narrativeLog;
        const xpEntry = log.find((e) => e.content.includes('XP'));

        expect(xpEntry).toBeDefined();
        expect(xpEntry?.role).toBe('assistant');
        expect(xpEntry?.content).toContain('Thane');
        expect(xpEntry?.content).toContain('55');
      },
  );

  it('lanza DomainError si el personaje no existe', async () => {
    const characters = new FakeCharacterRepository();
    const games = new FakeGameRepository();
    const useCase = new GrantXpUseCase(characters, games);

    await expect(useCase.execute({ gameId: 'no-existe', characterId: 'no-existe', amount: 100 })).rejects.toThrow();
  });
});
