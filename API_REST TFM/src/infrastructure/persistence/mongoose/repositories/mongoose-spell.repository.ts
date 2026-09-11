import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SpellRepository, SpellSearchCriteria } from '../../../../domain/ports/spell.repository.port';
import { Spell } from '../../../../domain/entities/spell.entity';
import { SpellMapper, SpellDocumentShape } from '../mappers/spell.mapper';

@Injectable()
export class MongooseSpellRepository implements SpellRepository {
  constructor(@InjectModel('Spell') private readonly model: Model<SpellDocumentShape>) {}

  async findById(id: string): Promise<Spell | null> {
    const doc = await this.model.findById(id).lean<SpellDocumentShape>().exec();
    return doc ? SpellMapper.toDomain(doc) : null;
  }

  async search(criteria: SpellSearchCriteria): Promise<Spell[]> {
    const filter: Record<string, unknown> = {};
    if (criteria.classIndex) {
      filter.classes = criteria.classIndex;
    }
    if (criteria.maxLevel !== undefined) {
      filter.level = { $lte: criteria.maxLevel };
    }

    const docs = await this.model.find(filter).lean<SpellDocumentShape[]>().exec();
    return docs.map((doc) => SpellMapper.toDomain(doc));
  }

  /** Usado por scripts/import-spells.ts. */
  async save(spell: Spell): Promise<void> {
    const raw = SpellMapper.toPersistence(spell);
    await this.model.findByIdAndUpdate(raw._id, raw, { upsert: true, returnDocument: 'after' }).exec();
  }
}
