import { UserRepository } from '../../domain/ports/user.repository.port';
import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { User } from '../../domain/entities/user.entity';
import { Character } from '../../domain/entities/character.entity';
import { ListUsersUseCase } from './list-users.use-case';

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

describe('ListUsersUseCase', () => {
  it('devuelve todos los usuarios con sus personajes cuando quien lo pide es admin', async () => {
    const admin = User.create({ username: 'carlos', passwordHash: 'x', role: 'admin' }, 'admin-1');
    const player = User.create({ username: 'jugador1', passwordHash: 'y', role: 'player' }, 'user-1');
    const users = new FakeUserRepository([admin, player]);

    const character = Character.createNew(
      { ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago' },
      'char-1',
    );
    const characters = new FakeCharacterRepository([character]);

    const useCase = new ListUsersUseCase(users, characters);
    const result = await useCase.execute({ requestingUserId: 'admin-1' });

    expect(result).toHaveLength(2);
    const admin1 = result.find((u) => u.userId === 'admin-1');
    const user1 = result.find((u) => u.userId === 'user-1');
    expect(admin1?.characters).toEqual([]);
    expect(user1?.characters).toEqual([
      { id: 'char-1', name: 'Elyndra', class: 'mago', level: 1, gameId: 'game-1' },
    ]);
  });

  it('rechaza si quien lo pide no es admin', async () => {
    const player = User.create({ username: 'jugador2', passwordHash: 'x', role: 'player' }, 'user-2');
    const users = new FakeUserRepository([player]);
    const useCase = new ListUsersUseCase(users, new FakeCharacterRepository([]));

    await expect(useCase.execute({ requestingUserId: 'user-2' })).rejects.toThrow();
  });

  it('rechaza si quien lo pide no existe', async () => {
    const useCase = new ListUsersUseCase(new FakeUserRepository([]), new FakeCharacterRepository([]));

    await expect(useCase.execute({ requestingUserId: 'fantasma' })).rejects.toThrow();
  });
});
