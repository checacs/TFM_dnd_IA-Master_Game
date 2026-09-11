import { User } from './user.entity';

describe('User', () => {
  it('expone sus datos a través de toSnapshot', () => {
    const user = User.create({ username: 'carlos', passwordHash: 'hash-123' });

    expect(user.toSnapshot()).toEqual({ username: 'carlos', passwordHash: 'hash-123', role: 'player' });
    expect(user.id).toEqual(expect.any(String));
  });
});
