import { UserRepository } from '../../domain/ports/user.repository.port';
import { PasswordHasher } from '../../domain/ports/password-hasher.port';
import { User } from '../../domain/entities/user.entity';
import { ChangePasswordUseCase } from './change-password.use-case';

class FakeUserRepository implements UserRepository {
  constructor(private readonly users: User[] = []) {}
  async findByUsername(username: string): Promise<User | null> {
    return this.users.find((u) => u.toSnapshot().username === username) ?? null;
  }
  async findById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async save(user: User): Promise<void> {
    const idx = this.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      this.users[idx] = user;
    } else {
      this.users.push(user);
    }
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

describe('ChangePasswordUseCase', () => {
  it('permite a un admin cambiar la contraseña de otro usuario', async () => {
    const admin = User.create({ username: 'carlos', passwordHash: 'x', role: 'admin' }, 'admin-1');
    const target = User.create({ username: 'jugador1', passwordHash: 'vieja', role: 'player' }, 'user-1');
    const repo = new FakeUserRepository([admin, target]);
    const useCase = new ChangePasswordUseCase(repo, new FakePasswordHasher());

    const result = await useCase.execute({
      requestingUserId: 'admin-1',
      targetUserId: 'user-1',
      newPassword: 'nueva-clave-123',
    });

    expect(result.userId).toBe('user-1');
    expect(result.username).toBe('jugador1');
    const saved = await repo.findById('user-1');
    expect(saved?.toSnapshot().passwordHash).toBe('hashed:nueva-clave-123');
  });

  it('permite a un admin cambiar su propia contraseña', async () => {
    const admin = User.create({ username: 'carlos', passwordHash: 'vieja', role: 'admin' }, 'admin-1');
    const repo = new FakeUserRepository([admin]);
    const useCase = new ChangePasswordUseCase(repo, new FakePasswordHasher());

    await useCase.execute({
      requestingUserId: 'admin-1',
      targetUserId: 'admin-1',
      newPassword: 'otra-clave-456',
    });

    const saved = await repo.findById('admin-1');
    expect(saved?.toSnapshot().passwordHash).toBe('hashed:otra-clave-456');
  });

  it('rechaza si quien lo pide no es admin', async () => {
    const player = User.create({ username: 'jugador2', passwordHash: 'x', role: 'player' }, 'user-2');
    const target = User.create({ username: 'jugador3', passwordHash: 'y', role: 'player' }, 'user-3');
    const repo = new FakeUserRepository([player, target]);
    const useCase = new ChangePasswordUseCase(repo, new FakePasswordHasher());

    await expect(
      useCase.execute({ requestingUserId: 'user-2', targetUserId: 'user-3', newPassword: 'nueva-clave-123' }),
    ).rejects.toThrow();
  });

  it('rechaza si quien lo pide no existe', async () => {
    const useCase = new ChangePasswordUseCase(new FakeUserRepository([]), new FakePasswordHasher());

    await expect(
      useCase.execute({ requestingUserId: 'fantasma', targetUserId: 'user-1', newPassword: 'nueva-clave-123' }),
    ).rejects.toThrow();
  });

  it('rechaza si el usuario objetivo no existe', async () => {
    const admin = User.create({ username: 'carlos', passwordHash: 'x', role: 'admin' }, 'admin-1');
    const repo = new FakeUserRepository([admin]);
    const useCase = new ChangePasswordUseCase(repo, new FakePasswordHasher());

    await expect(
      useCase.execute({ requestingUserId: 'admin-1', targetUserId: 'fantasma', newPassword: 'nueva-clave-123' }),
    ).rejects.toThrow();
  });
});
