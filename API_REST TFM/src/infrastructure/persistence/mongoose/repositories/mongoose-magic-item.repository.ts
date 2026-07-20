import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MagicItemRepository, MagicItemSearchCriteria } from '../../../../domain/ports/magic-item.repository.port';
import { MagicItem } from '../../../../domain/entities/magic-item.entity';
import { MagicItemMapper, MagicItemDocumentShape } from '../../../dnd5eapi/magic-item.mapper';

@Injectable()
export class MongooseMagicItemRepository implements MagicItemRepository {
  constructor(@InjectModel('MagicItem') private readonly model: Model<MagicItemDocumentShape>) {}

  async findById(id: string): Promise<MagicItem | null> {
    const doc = await this.model.findById(id).lean<MagicItemDocumentShape>().exec();
    return doc ? MagicItemMapper.toDomain(doc) : null;
  }

  async search(criteria: MagicItemSearchCriteria): Promise<MagicItem[]> {
    const filter: Record<string, unknown> = {};
    if (criteria.rarity) {
      filter.rarity = criteria.rarity;
    }
    const docs = await this.model.find(filter).lean<MagicItemDocumentShape[]>().exec();
    return docs.map((doc) => MagicItemMapper.toDomain(doc));
  }

  /** Usado por scripts/import-magic-items.ts. */
  async save(item: MagicItem): Promise<void> {
    const raw = MagicItemMapper.toPersistence(item);
    await this.model.findByIdAndUpdate(raw._id, raw, { upsert: true, returnDocument: 'after' }).exec();
  }
}
