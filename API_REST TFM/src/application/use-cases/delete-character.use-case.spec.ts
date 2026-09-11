import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { GameRepository } from '../../domain/ports/game.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { Game } from '../../domain/entities/game.entity';
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

/** Partida en curso con Elyndra (char-1, user-1, capitana) y Thane (char-2, user-2). */
function buildGameWithTwoPlayers(): Game {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 }, 'game-1');
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 14 });
  game.assignCaptain('host-1', 'user-1');
  game.launch('host-1');
  return game;
}

describe('DeleteCharacterUseCase', () => {
  it('borra el personaje indicado, sin tocar el resto', async () => {
    const kept = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago' }, 'char-1');
    const toDelete = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' }, 'char-2');
    const characters = new FakeCharacterRepository([kept, toDelete]);

    const useCase = new DeleteCharacterUseCase(characters, new FakeGameRepository());
    await useCase.execute({ characterId: 'char-2' });

    expect(await characters.findById('char-2')).toBeNull();
    expect(await characters.findById('char-1')).not.toBeNull();
  });

  it('lanza DomainError si el personaje no existe', async () => {
    const useCase = new DeleteCharacterUseCase(new FakeCharacterRepository([]), new FakeGameRepository());

    await expect(useCase.execute({ characterId: 'no-existe' })).rejects.toThrow();
  });

  // Depuración: se borraba el documento del personaje pero seguía en
  // Game.players como jugador "fantasma" (bloqueaba la ronda de combate).
  it('saca también al personaje de su partida', async () => {
    const games = new FakeGameRepository();
    games.seed(buildGameWithTwoPlayers());
    const characters = new FakeCharacterRepository([
      Character.createNew({ ownerId: 'user-2', gameId: 'game-1', name: 'Thane', class: 'guerrero' }, 'char-2'),
    ]);

    await new DeleteCharacterUseCase(characters, games).execute({ characterId: 'char-2' });

    const players = (await games.findById('game-1'))!.toSnapshot().players;
    expect(players.map((p) => p.characterId)).toEqual(['char-1']);
  });
});
