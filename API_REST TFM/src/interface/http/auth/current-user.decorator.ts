import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extrae el id del usuario autenticado desde req.user (lo pone JwtStrategy
 * tras validar el token). Nunca se lee un userId del body — por eso ya no
 * quedan campos "TEMPORAL" en los DTOs de games/characters.
 */
export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.user.id;
});
