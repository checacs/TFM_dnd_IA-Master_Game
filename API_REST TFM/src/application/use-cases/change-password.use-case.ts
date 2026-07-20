import { Injectable, Inject } from '@nestjs/common';
import { UserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { PasswordHasher, PASSWORD_HASHER } from '../../domain/ports/password-hasher.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface ChangePasswordInput {
  requestingUserId: string;
  targetUserId: string;
  newPassword: string;
}

export interface ChangePasswordResult {
  userId: string;
  username: string;
}

/**
 * Reseteo de contraseña administrado (docs/10) — solo un admin puede
 * cambiar la contraseña de cualquier usuario (incluida la suya propia), sin
 * necesidad de conocer la contraseña actual. Se comprueba aquí, no solo en
 * el guard REST, por si el caso de uso se llama alguna vez desde otro
 * sitio (mismo patrón que CreateUserUseCase).
 */
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: ChangePasswordInput): Promise<ChangePasswordResult> {
    const requester = await this.users.findById(input.requestingUserId);
    if (!requester || !requester.isAdmin()) {
      throw new DomainError('Solo un administrador puede cambiar contraseñas');
    }

    const target = await this.users.findById(input.targetUserId);
    if (!target) {
      throw new DomainError('El usuario indicado no existe');
    }

    const passwordHash = await this.hasher.hash(input.newPassword);
    target.changePassword(passwordHash);
    await this.users.save(target);

    return { userId: target.id, username: target.toSnapshot().username };
  }
}
