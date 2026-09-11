import { Injectable } from '@nestjs/common';
import { EnemyRepository, EnemySearchCriteria } from '../../../domain/ports/enemy.repository.port';
import { Enemy } from '../../../domain/entities/enemy.entity';

@Injectable()
export class InMemoryEnemyRepository implements EnemyRepository {
  private readonly enemies = new Map<string, Enemy>();

  async findById(id: string): Promise<Enemy | null> {
    return this.enemies.get(id) ?? null;
  }

  async search(criteria: EnemySearchCriteria): Promise<Enemy[]> {
    return Array.from(this.enemies.values()).filter((enemy) => {
      const snapshot = enemy.toSnapshot();
      const matchesTags = !criteria.tags?.length || criteria.tags.some((tag) => snapshot.tags.includes(tag));
      const matchesCr =
        criteria.maxChallengeRating === undefined || snapshot.challengeRating <= criteria.maxChallengeRating;
      return matchesTags && matchesCr;
    });
  }

  async save(enemy: Enemy): Promise<void> {
    this.enemies.set(enemy.id, enemy);
  }
}
