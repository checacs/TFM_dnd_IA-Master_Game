import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRepository, USER_REPOSITORY } from '../../../domain/ports/user.repository.port';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    'Falta la variable de entorno JWT_SECRET. Añádela a tu .env (puedes partir de .env.example).',
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET as string,
    });
  }

  /**
   * Antes solo se decodificaba el token: un usuario borrado por un admin
   * seguía teniendo acceso completo hasta que caducara su JWT (7 días por
   * defecto). Ahora se comprueba que la cuenta sigue existiendo, y el rol se
   * toma de la base de datos, no del token.
   */
  async validate(payload: { userId: string; role: string }): Promise<{ id: string; role: string }> {
    const user = await this.users.findById(payload.userId);
    if (!user) {
      throw new UnauthorizedException('La sesión ya no es válida');
    }
    return { id: user.id, role: user.role };
  }
}
