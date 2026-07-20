import { Injectable } from '@nestjs/common';
import { UserRepository } from '../../../domain/ports/user.repository.port';
import { User } from '../../../domain/entities/user.entity';

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async findByUsername(username: string): Promise<User | null> {
    return Array.from(this.users.values()).find((u) => u.toSnapshot().username === username) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  /** Usado por el script de siembra de usuarios y por CreateUserUseCase. */
  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }
}
