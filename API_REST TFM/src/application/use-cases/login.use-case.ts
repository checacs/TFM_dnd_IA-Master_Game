import { Injectable, Inject } from '@nestjs/common';
import { UserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { PasswordHasher, PASSWORD_HASHER } from '../../domain/ports/password-hasher.port';
import { TokenIssuer, TOKEN_ISSUER } from '../../domain/ports/token-issuer.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
}

/** Único endpoint público de autenticación (docs/10) — no hay registro. */
@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const user = await this.users.findByUsername(input.username);
    if (!user) {
      throw new DomainError('Credenciales inválidas');
    }

    const valid = await this.hasher.compare(input.password, user.toSnapshot().passwordHash);
    if (!valid) {
      throw new DomainError('Credenciales inválidas');
    }

    return { token: this.tokens.issue({ userId: user.id }) };
  }
}
