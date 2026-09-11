import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { UserRepository, USER_REPOSITORY } from '../../../domain/ports/user.repository.port';

/**
 * Se aplica siempre DESPUÉS de JwtAuthGuard (necesita req.user.id ya
 * resuelto). Comprueba en la propia base de datos que el usuario autenticado
 * tiene role: 'admin' — no se confía en nada que venga del token o del
 * cliente para esto, igual que el resto de comprobaciones de identidad del
 * proyecto (docs/10-autenticacion-y-lobby.md, sección 8).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;
    const user = userId ? await this.users.findById(userId) : null;

    if (!user || !user.isAdmin()) {
      throw new ForbiddenException('Solo un administrador puede realizar esta acción');
    }

    return true;
  }
}
