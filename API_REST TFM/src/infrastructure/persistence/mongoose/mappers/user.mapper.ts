import { User, UserProps } from '../../../../domain/entities/user.entity';

export type UserDocumentShape = UserProps & { _id: string };

export const UserMapper = {
  toPersistence(user: User): UserDocumentShape {
    return { _id: user.id, ...user.toSnapshot() };
  },

  toDomain(doc: UserDocumentShape): User {
    const { _id, ...props } = doc;
    return User.create(props, _id);
  },
};
