import { UserRepository } from '../../domain/ports/user.repository.port';
import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { User } from '../../domain/entities/user.entity';
import { Character } from '../../domain/entities/character.entity';
import { DeleteUserUseCase } from './delete-user.use-case';

class FakeUserRepository implements UserRepository {
  constructor(private readonly users: User[] = []) {}
  async findByUsername(username: string): Promise<User | null> {
    return this.users.find((u) => u.toSnapshot().username === username) ?? null;
  }
  async findById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async findAll(): Promise<User[]> {
    return [...this.users];
  }
  async save(user: User): Promise<void> {
    this.users.push(user);
  }
  async deleteById(id: string): Promise<void> {
    const idx = this.users.findIndex((u) => u.id === id);
    if (idx >= 0) this.users.splice(idx, 1);
  }
}

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

describe('DeleteUserUseCase', () => {
  it('borra la cuenta y, en cascada, todos sus personajes', async () => {
    const admin = User.create({ username: 'carlos', passwordHash: 'x', role: 'admin' }, 'admin-1');
    const target = User.create({ username: 'jugador1', passwordHash: 'y', role: 'player' }, 'user-1');
    const users = new FakeUserRepository([admin, target]);

    const ownCharacter = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago' }, 'char-1');
    const otherCharacter = Character.createNew({ ownerId: 'user-2', gameId: 'game-1', name: 'Thane', class: 'guerrero' }, 'char-2');
    const characters = new FakeCharacterRepository([ownCharacter, otherCharacter]);

    const useCase = new DeleteUserUseCase(users, characters, new FakeGameRepository());
    await useCase.execute({ requestingUserId: 'admin-1', targetUserId: 'user-1' });

    expect(await users.findById('user-1')).toBeNull();
    expect(await characters.findById('char-1')).toBeNull();
    expect(await characters.findById('char-2')).not.toBeNull();
  });

  it('rechaza si quien lo pide no es admin', async () => {
    const player = User.create({ username: 'jugador2', passwordHash: 'x', role: 'player' }, 'user-2');
    const target = User.create({ username: 'jugador3', passwordHash: 'y', role: 'player' }, 'user-3');
    const users = new FakeUserRepository([player, target]);
    const useCase = new DeleteUserUseCase(users, new FakeCharacterRepository([]), new FakeGameRepository());

    await expect(
      useCase.execute({ requestingUserId: 'user-2', targetUserId: 'user-3' }),
    ).rejects.toThrow();
  });

  it('rechaza si quien lo pide no existe', async () => {
    const useCase = new DeleteUserUseCase(new FakeUserRepository([]), new FakeCharacterRepository([]), new FakeGameRepository());

    await expect(
      useCase.execute({ requestingUserId: 'fantasma', targetUserId: 'user-1' }),
    ).rejects.toThrow();
  });

  it('rechaza si el usuario objetivo no existe', async () => {
    const admin = User.create({ username: 'carlos', passwordHash: 'x', role: 'admin' }, 'admin-1');
    const users = new FakeUserRepository([admin]);
    const useCase = new DeleteUserUseCase(users, new FakeCharacterRepository([]), new FakeGameRepository());

    await expect(
      useCase.execute({ requestingUserId: 'admin-1', targetUserId: 'fantasma' }),
    ).rejects.toThrow();
  });

  it('rechaza que un admin se elimine a sí mismo', async () => {
    const admin = User.create({ username: 'carlos', passwordHash: 'x', role: 'admin' }, 'admin-1');
    const users = new FakeUserRepository([admin]);
    const useCase = new DeleteUserUseCase(users, new FakeCharacterRepository([]), new FakeGameRepository());

    await expect(
      useCase.execute({ requestingUserId: 'admin-1', targetUserId: 'admin-1' }),
    ).rejects.toThrow();
    expect(await users.findById('admin-1')).not.toBeNull();
  });

  it('saca de sus partidas a los personajes del usuario borrado y reasigna la capitanía', async () => {
    const admin = User.create({ username: 'carlos', passwordHash: 'x', role: 'admin' }, 'admin-1');
    const target = User.create({ username: 'jugador1', passwordHash: 'y', role: 'player' }, 'user-1');
    const games = new FakeGameRepository();
    games.seed(buildGameWithTwoPlayers());
    const characters = new FakeCharacterRepository([
      Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago' }, 'char-1'),
    ]);

    await new DeleteUserUseCase(new FakeUserRepository([admin, target]), characters, games)
      .execute({ requestingUserId: 'admin-1', targetUserId: 'user-1' });

    const snapshot = (await games.findById('game-1'))!.toSnapshot();
    expect(snapshot.players.map((p) => p.characterId)).toEqual(['char-2']);
    expect(snapshot.captainUserId).toBe('user-2');
  });
});
