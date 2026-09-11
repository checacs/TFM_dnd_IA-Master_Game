import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { GameRepository } from '../../domain/ports/game.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { Game } from '../../domain/entities/game.entity';
import { GetCharacterUseCase } from './get-character.use-case';

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
  async findByOwnerId(ownerId: string): Promise<Character[]> {
    return Array.from(this.characters.values()).filter((c) => c.toSnapshot().ownerId === ownerId);
  }
  async deleteById(id: string): Promise<void> {
    this.characters.delete(id);
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

describe('GetCharacterUseCase', () => {
  it('devuelve la ficha completa del personaje (incluida la CA)', async () => {
    const characters = new FakeCharacterRepository();
    const character = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' });
    characters.seed(character);

    const useCase = new GetCharacterUseCase(characters, new FakeGameRepository());
    const result = await useCase.execute({ characterId: character.id });

    expect(result.name).toBe('Thane');
    expect(result.ac).toBe(character.toSnapshot().ac);
    expect(result.attributes).toEqual(character.toSnapshot().attributes);
  });

  it('lanza DomainError si el personaje no existe', async () => {
    const characters = new FakeCharacterRepository();
    const useCase = new GetCharacterUseCase(characters, new FakeGameRepository());

    await expect(useCase.execute({ characterId: 'no-existe' })).rejects.toThrow();
  });

  // Depuración: el daño en combate solo se aplica a Game.players[].currentHp;
  // la ficha (móvil y tool MCP get_character_sheet) leía Character.hp y
  // mostraba siempre la vida completa, incluso a 0 HP o tras caer el grupo.
  it('devuelve el HP actual real de la partida, no el guardado en el personaje', async () => {
    const characters = new FakeCharacterRepository();
    const games = new FakeGameRepository();
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    const character = Character.createNew({ ownerId: 'user-1', gameId: game.id, name: 'Thane', class: 'guerrero' });
    game.addPlayer({ userId: 'user-1', characterId: character.id, name: 'Thane', class: 'guerrero', currentHp: character.toSnapshot().hp.max });
    game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Elyndra', class: 'mago', currentHp: 9 });
    game.assignCaptain('host-1', 'user-1');
    game.launch('host-1');
    game.applyDamageToParticipant(character.id, 7);
    games.seed(game);
    characters.seed(character);

    const result = await new GetCharacterUseCase(characters, games).execute({ characterId: character.id });

    expect(result.hp.current).toBe(character.toSnapshot().hp.max - 7);
    expect(result.hp.max).toBe(character.toSnapshot().hp.max);
  });

  it('si la partida no existe o no lo tiene como jugador, devuelve el HP del propio personaje', async () => {
    const characters = new FakeCharacterRepository();
    const character = Character.createNew({ ownerId: 'user-1', gameId: 'partida-borrada', name: 'Thane', class: 'guerrero' });
    characters.seed(character);

    const result = await new GetCharacterUseCase(characters, new FakeGameRepository()).execute({ characterId: character.id });

    expect(result.hp).toEqual(character.toSnapshot().hp);
  });
});
