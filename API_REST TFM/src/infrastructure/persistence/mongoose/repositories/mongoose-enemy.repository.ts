import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EnemyRepository, EnemySearchCriteria } from '../../../../domain/ports/enemy.repository.port';
import { Enemy } from '../../../../domain/entities/enemy.entity';
import { EnemyMapper, EnemyDocumentShape } from '../mappers/enemy.mapper';

@Injectable()
export class MongooseEnemyRepository implements EnemyRepository {
  constructor(@InjectModel('Enemy') private readonly model: Model<EnemyDocumentShape>) {}

  async findById(id: string): Promise<Enemy | null> {
    const doc = await this.model.findById(id).lean<EnemyDocumentShape>().exec();
    return doc ? EnemyMapper.toDomain(doc) : null;
  }

  async search(criteria: EnemySearchCriteria): Promise<Enemy[]> {
    const filter: Record<string, unknown> = {};
    if (criteria.tags?.length) {
      filter.tags = { $in: criteria.tags };
    }
    if (criteria.maxChallengeRating !== undefined) {
      filter.challengeRating = { $lte: criteria.maxChallengeRating };
    }

    const docs = await this.model.find(filter).lean<EnemyDocumentShape[]>().exec();
    return docs.map((doc) => EnemyMapper.toDomain(doc));
  }

  /** Usado por el script de importación del catálogo — no forma parte del puerto EnemyRepository. */
  async save(enemy: Enemy): Promise<void> {
    const raw = EnemyMapper.toPersistence(enemy);
    await this.model.findByIdAndUpdate(raw._id, raw, { upsert: true, returnDocument: 'after' }).exec();
  }
}
