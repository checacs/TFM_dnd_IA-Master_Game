import { UserRepository } from '../../domain/ports/user.repository.port';
import { PasswordHasher } from '../../domain/ports/password-hasher.port';
import { TokenIssuer } from '../../domain/ports/token-issuer.port';
import { User } from '../../domain/entities/user.entity';
import { LoginUseCase } from './login.use-case';

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

class FakeTokenIssuer implements TokenIssuer {
  issue(payload: { userId: string }): string {
    return `token-for:${payload.userId}`;
  }
}

describe('LoginUseCase', () => {
  it('devuelve un token cuando el usuario y la contraseña son correctos', async () => {
    const user = User.create({ username: 'carlos', passwordHash: 'hashed:secreto123' }, 'user-1');
    const useCase = new LoginUseCase(new FakeUserRepository([user]), new FakePasswordHasher(), new FakeTokenIssuer());

    const result = await useCase.execute({ username: 'carlos', password: 'secreto123' });

    expect(result).toEqual({ token: 'token-for:user-1' });
  });

  it('lanza DomainError si el usuario no existe', async () => {
    const useCase = new LoginUseCase(new FakeUserRepository([]), new FakePasswordHasher(), new FakeTokenIssuer());

    await expect(useCase.execute({ username: 'no-existe', password: 'x' })).rejects.toThrow();
  });

  it('lanza DomainError si la contraseña es incorrecta', async () => {
    const user = User.create({ username: 'carlos', passwordHash: 'hashed:secreto123' }, 'user-1');
    const useCase = new LoginUseCase(new FakeUserRepository([user]), new FakePasswordHasher(), new FakeTokenIssuer());

    await expect(useCase.execute({ username: 'carlos', password: 'incorrecta' })).rejects.toThrow();
  });
});
