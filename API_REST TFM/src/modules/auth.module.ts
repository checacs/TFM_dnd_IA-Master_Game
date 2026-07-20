import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from '../interface/http/auth/auth.controller';
import { JwtStrategy } from '../interface/http/auth/jwt.strategy';
import { AdminGuard } from '../interface/http/auth/admin.guard';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { CreateUserUseCase } from '../application/use-cases/create-user.use-case';
import { ChangePasswordUseCase } from '../application/use-cases/change-password.use-case';
import { PASSWORD_HASHER } from '../domain/ports/password-hasher.port';
import { TOKEN_ISSUER } from '../domain/ports/token-issuer.port';
import { BcryptPasswordHasher } from '../infrastructure/auth/bcrypt-password-hasher';
import { JwtTokenIssuer } from '../infrastructure/auth/jwt-token-issuer';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    'Falta la variable de entorno JWT_SECRET. Añádela a tu .env (puedes partir de .env.example).',
  );
}

// JWT_EXPIRES_IN admite dos formatos: un número de segundos (ej. "28800"),
// o una notación de duración de la librería `ms` (ej. "8h", "7d"). Si no se
// define, cae en 7 días (comportamiento previo a esta variable).
const JWT_EXPIRES_IN_RAW = process.env.JWT_EXPIRES_IN ?? '7d';
const JWT_EXPIRES_IN = /^\d+$/.test(JWT_EXPIRES_IN_RAW) ? Number(JWT_EXPIRES_IN_RAW) : JWT_EXPIRES_IN_RAW;

/**
 * USER_REPOSITORY no se declara aquí — ya lo exporta PersistenceModule
 * (@Global()), igual que el resto de repositorios.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: JWT_SECRET,
      // `expiresIn` tipa como StringValue (unión de literales tipo "8h") en
      // los tipos de `ms`, que no puede representar un string calculado en
      // runtime a partir de la env var -- el valor en sí es válido para
      // jsonwebtoken (número de segundos o duración tipo "8h"/"7d"), de ahí
      // el escape hatch con `any` en vez de mentir con un tipo más estrecho.
      signOptions: { expiresIn: JWT_EXPIRES_IN as any },
    }),
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    CreateUserUseCase,
    ChangePasswordUseCase,
    JwtStrategy,
    AdminGuard,
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_ISSUER, useClass: JwtTokenIssuer },
  ],
})
export class AuthModule {}
