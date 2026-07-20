import { Enemy } from '../entities/enemy.entity';

export interface EnemySearchCriteria {
  tags?: string[];
  maxChallengeRating?: number;
}

export interface EnemyRepository {
  findById(id: string): Promise<Enemy | null>;
  search(criteria: EnemySearchCriteria): Promise<Enemy[]>;
}

export const ENEMY_REPOSITORY = Symbol('EnemyRepository');
