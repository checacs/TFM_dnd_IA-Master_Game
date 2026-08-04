export interface TokenIssuer {
  issue(payload: { userId: string; role: string }): string;
}

export const TOKEN_ISSUER = Symbol('TokenIssuer');
