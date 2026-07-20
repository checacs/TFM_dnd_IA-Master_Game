export interface TokenIssuer {
  issue(payload: { userId: string }): string;
}

export const TOKEN_ISSUER = Symbol('TokenIssuer');
