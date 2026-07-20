import { Enemy, EnemyProps } from '../../../../domain/entities/enemy.entity';

export type EnemyDocumentShape = EnemyProps & { _id: string };

export const EnemyMapper = {
  toPersistence(enemy: Enemy): EnemyDocumentShape {
    return { _id: enemy.id, ...enemy.toSnapshot() };
  },

  toDomain(doc: EnemyDocumentShape): Enemy {
    const { _id, ...props } = doc;
    return Enemy.create(props, _id);
  },
};
