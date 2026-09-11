import { BcryptPasswordHasher } from './bcrypt-password-hasher';

describe('BcryptPasswordHasher', () => {
  it('hashea una contraseña y compara correctamente contra el hash', async () => {
    const hasher = new BcryptPasswordHasher();
    const hash = await hasher.hash('secreto123');

    expect(hash).not.toBe('secreto123'); // nunca en texto plano
    expect(await hasher.compare('secreto123', hash)).toBe(true);
    expect(await hasher.compare('otra-cosa', hash)).toBe(false);
  });

  it('dos hashes de la misma contraseña son distintos (salt aleatorio)', async () => {
    const hasher = new BcryptPasswordHasher();
    const hash1 = await hasher.hash('secreto123');
    const hash2 = await hasher.hash('secreto123');

    expect(hash1).not.toBe(hash2);
    expect(await hasher.compare('secreto123', hash1)).toBe(true);
    expect(await hasher.compare('secreto123', hash2)).toBe(true);
  });
});
