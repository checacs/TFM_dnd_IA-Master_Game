import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RulesReferenceRepository,
  RulesReferenceSearchCriteria,
} from '../../../../domain/ports/rules-reference.repository.port';
import { RulesReference } from '../../../../domain/entities/rules-reference.entity';
import { RulesReferenceMapper, RulesReferenceDocumentShape } from '../../../dnd5eapi/rules-reference.mapper';

@Injectable()
export class MongooseRulesReferenceRepository implements RulesReferenceRepository {
  constructor(@InjectModel('RulesReference') private readonly model: Model<RulesReferenceDocumentShape>) {}

  async findById(id: string): Promise<RulesReference | null> {
    const doc = await this.model.findById(id).lean<RulesReferenceDocumentShape>().exec();
    return doc ? RulesReferenceMapper.toDomain(doc) : null;
  }

  async search(criteria: RulesReferenceSearchCriteria): Promise<RulesReference[]> {
    const filter: Record<string, unknown> = {};
    if (criteria.kind) {
      filter.kind = criteria.kind;
    }
    const docs = await this.model.find(filter).lean<RulesReferenceDocumentShape[]>().exec();
    return docs.map((doc) => RulesReferenceMapper.toDomain(doc));
  }

  /** Usado por scripts/import-rules-reference.ts. */
  async save(ref: RulesReference): Promise<void> {
    const raw = RulesReferenceMapper.toPersistence(ref);
    await this.model.findByIdAndUpdate(raw._id, raw, { upsert: true, returnDocument: 'after' }).exec();
  }
}
