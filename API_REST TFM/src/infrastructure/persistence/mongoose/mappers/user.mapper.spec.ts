import { User } from '../../../../domain/entities/user.entity';
import { UserMapper } from './user.mapper';

describe('UserMapper', () => {
  it('convierte de dominio a persistencia y de vuelta sin perder datos', () => {
    const user = User.create({ username: 'carlos', passwordHash: 'hash-123' });

    const persisted = UserMapper.toPersistence(user);
    const recovered = UserMapper.toDomain(persisted);

    expect(recovered.id).toBe(user.id);
    expect(recovered.toSnapshot()).toEqual(user.toSnapshot());
  });
});
