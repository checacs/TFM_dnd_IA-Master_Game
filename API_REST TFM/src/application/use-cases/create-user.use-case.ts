import { Injectable, Inject } from '@nestjs/common';
import { UserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { PasswordHasher, PASSWORD_HASHER } from '../../domain/ports/password-hasher.port';
import { User, UserRole } from '../../domain/entities/user.entity';
import { DomainError } from '../../domain/errors/domain-error';

export interface CreateUserInput {
  requestingUserId: string;
  username: string;
  password: string;
  role?: UserRole;
}

export interface CreateUserResult {
  userId: string;
  username: string;
  role: UserRole;
}

/**
 * No hay registro público (docs/10) — esta es la única forma de crear
 * cuentas fuera del script de siembra, y solo puede invocarla un usuario
 * que ya sea admin (comprobado aquí, no solo en el guard REST, por si el
 * caso de uso se llama alguna vez desde otro sitio, ej. un script).
 */
@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: CreateUserInput): Promise<CreateUserResult> {
    const requester = await this.users.findById(input.requestingUserId);
    if (!requester || !requester.isAdmin()) {
      throw new DomainError('Solo un administrador puede crear usuarios');
    }

    const existing = await this.users.findByUsername(input.username);
    if (existing) {
      throw new DomainError('Ya existe un usuario con ese nombre');
    }

    const passwordHash = await this.hasher.hash(input.password);
    const user = User.create({ username: input.username, passwordHash, role: input.role ?? 'player' });
    await this.users.save(user);

    return { userId: user.id, username: input.username, role: user.role };
  }
}
