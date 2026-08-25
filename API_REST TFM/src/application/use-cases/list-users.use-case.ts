import { Injectable, Inject } from '@nestjs/common';
import { UserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { UserRole } from '../../domain/entities/user.entity';
import { CharacterClass } from '../../domain/entities/character.entity';
import { DomainError } from '../../domain/errors/domain-error';

export interface ListUsersInput {
  requestingUserId: string;
}

export interface AdminCharacterSummary {
  id: string;
  name: string;
  class: CharacterClass;
  level: number;
  gameId: string;
}

export interface AdminUserSummary {
  userId: string;
  username: string;
  role: UserRole;
  characters: AdminCharacterSummary[];
}

export type ListUsersResult = AdminUserSummary[];

/**
 * Alimenta el panel "Administración de Usuarios" de ui-web (docs/10, sección
 * 6bis): solo un admin puede ver el listado completo de cuentas junto con
 * los personajes de cada una. Igual que CreateUserUseCase/ChangePasswordUseCase,
 * la comprobación de admin se hace aquí (no solo en AdminGuard) por si el
 * caso de uso se invoca alguna vez desde otro sitio.
 */
@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
  ) {}

  async execute(input: ListUsersInput): Promise<ListUsersResult> {
    const requester = await this.users.findById(input.requestingUserId);
    if (!requester || !requester.isAdmin()) {
      throw new DomainError('Solo un administrador puede listar usuarios');
    }

    const allUsers = await this.users.findAll();

    return Promise.all(
      allUsers.map(async (user) => {
        const ownedCharacters = await this.characters.findByOwnerId(user.id);
        return {
          userId: user.id,
          username: user.toSnapshot().username,
          role: user.role,
          characters: ownedCharacters.map((character) => {
            const snapshot = character.toSnapshot();
            return {
              id: character.id,
              name: snapshot.name,
              class: snapshot.class,
              level: snapshot.level,
              gameId: snapshot.gameId,
            };
          }),
        };
      }),
    );
  }
}
