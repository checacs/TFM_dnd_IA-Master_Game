import { UserRepository } from '../../domain/ports/user.repository.port';
import { PasswordHasher } from '../../domain/ports/password-hasher.port';
import { User } from '../../domain/entities/user.entity';
import { CreateUserUseCase } from './create-user.use-case';

class FakeUserRepository implements UserRepository {
  constructor(private readonly users: User[] = []) {}
  async findByUsername(username: string): Promise<User | null> {
    return this.users.find((u) => u.toSnapshot().username === username) ?? null;
  }
  async findById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async save(user: User): Promise<void> {
    this.users.push(user);
  }
}

class FakePasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }
  async compare(plain: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }
}

describe('CreateUserUseCase', () => {
  it('crea un usuario nuevo cuando quien lo pide es admin', async () => {
    const admin = User.create({ username: 'carlos', passwordHash: 'x', role: 'admin' }, 'admin-1');
    const repo = new FakeUserRepository([admin]);
    const useCase = new CreateUserUseCase(repo, new FakePasswordHasher());

    const result = await useCase.execute({
      requestingUserId: 'admin-1',
      username: 'jugador1',
      password: 'secreto123',
    });

    expect(result.username).toBe('jugador1');
    expect(result.role).toBe('player');
    const saved = await repo.findByUsername('jugador1');
    expect(saved?.toSnapshot().passwordHash).toBe('hashed:secreto123');
    expect(saved?.role).toBe('player');
  });

  it('rechaza si quien lo pide no es admin', async () => {
    const player = User.create({ username: 'jugador2', passwordHash: 'x', role: 'player' }, 'user-2');
    const repo = new FakeUserRepository([player]);
    const useCase = new CreateUserUseCase(repo, new FakePasswordHasher());

    await expect(
      useCase.execute({ requestingUserId: 'user-2', username: 'nuevo', password: 'x' }),
    ).rejects.toThrow();
  });

  it('rechaza si quien lo pide no existe', async () => {
    const useCase = new CreateUserUseCase(new FakeUserRepository([]), new FakePasswordHasher());

    await expect(
      useCase.execute({ requestingUserId: 'fantasma', username: 'nuevo', password: 'x' }),
    ).rejects.toThrow();
  });

  it('rechaza si el nombre de usuario ya existe', async () => {
    const admin = User.create({ username: 'carlos', passwordHash: 'x', role: 'admin' }, 'admin-1');
    const existing = User.create({ username: 'jugador1', passwordHash: 'y', role: 'player' }, 'user-1');
    const repo = new FakeUserRepository([admin, existing]);
    const useCase = new CreateUserUseCase(repo, new FakePasswordHasher());

    await expect(
      useCase.execute({ requestingUserId: 'admin-1', username: 'jugador1', password: 'x' }),
    ).rejects.toThrow();
  });

  it('permite crear otro admin explícitamente con role: "admin"', async () => {
    const admin = User.create({ username: 'carlos', passwordHash: 'x', role: 'admin' }, 'admin-1');
    const repo = new FakeUserRepository([admin]);
    const useCase = new CreateUserUseCase(repo, new FakePasswordHasher());

    const result = await useCase.execute({
      requestingUserId: 'admin-1',
      username: 'segundo-admin',
      password: 'secreto123',
      role: 'admin',
    });

    expect(result.role).toBe('admin');
  });
});
