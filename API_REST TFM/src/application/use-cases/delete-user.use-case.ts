import { Injectable, Inject } from '@nestjs/common';
import { UserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface DeleteUserInput {
  requestingUserId: string;
  targetUserId: string;
}

/**
 * Borra una cuenta de usuario y, en cascada, los personajes que le
 * pertenecen (mismo criterio que DeleteGameUseCase con sus personajes) para
 * no dejarlos huérfanos apuntando a un ownerId que ya no existe. Solo un
 * admin puede invocarlo (comprobado aquí, no solo en AdminGuard, mismo
 * patrón que CreateUserUseCase/ChangePasswordUseCase) y no se permite que un
 * admin se borre a sí mismo, para no dejar el sistema sin ninguna cuenta con
 * privilegios de administración.
 */
@Injectable()
export class DeleteUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
  ) {}

  async execute(input: DeleteUserInput): Promise<void> {
    const requester = await this.users.findById(input.requestingUserId);
    if (!requester || !requester.isAdmin()) {
      throw new DomainError('Solo un administrador puede eliminar usuarios');
    }

    const target = await this.users.findById(input.targetUserId);
    if (!target) {
      throw new DomainError('El usuario indicado no existe');
    }

    if (target.id === requester.id) {
      throw new DomainError('Un administrador no puede eliminarse a sí mismo');
    }

    const ownedCharacters = await this.characters.findByOwnerId(target.id);
    for (const character of ownedCharacters) {
      await this.characters.deleteById(character.id);
    }

    await this.users.deleteById(target.id);
  }
}
