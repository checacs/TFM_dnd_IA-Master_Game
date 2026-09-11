import { InMemoryUserRepository } from './in-memory-user.repository';
import { User } from '../../../domain/entities/user.entity';

describe('InMemoryUserRepository', () => {
  it('encuentra un usuario por su username', async () => {
    const repo = new InMemoryUserRepository();
    const user = User.create({ username: 'carlos', passwordHash: 'hash-123' });
    await repo.save(user);

    const found = await repo.findByUsername('carlos');
    expect(found?.id).toBe(user.id);
  });

  it('devuelve null si no existe ese username', async () => {
    const repo = new InMemoryUserRepository();
    expect(await repo.findByUsername('no-existe')).toBeNull();
  });
});
