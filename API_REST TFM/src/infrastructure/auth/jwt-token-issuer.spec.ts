import { JwtService } from '@nestjs/jwt';
import { JwtTokenIssuer } from './jwt-token-issuer';

describe('JwtTokenIssuer', () => {
  it('emite un token verificable con el mismo secreto y que contiene el userId', () => {
    const jwtService = new JwtService({ secret: 'test-secret' });
    const issuer = new JwtTokenIssuer(jwtService);

    const token = issuer.issue({ userId: 'user-1' });
    const decoded = jwtService.verify(token) as { userId: string };

    expect(decoded.userId).toBe('user-1');
  });

  it('lanza un error si se verifica con un secreto distinto', () => {
    const jwtService = new JwtService({ secret: 'test-secret' });
    const issuer = new JwtTokenIssuer(jwtService);
    const token = issuer.issue({ userId: 'user-1' });

    const otroJwtService = new JwtService({ secret: 'otro-secreto' });
    expect(() => otroJwtService.verify(token)).toThrow();
  });
});
