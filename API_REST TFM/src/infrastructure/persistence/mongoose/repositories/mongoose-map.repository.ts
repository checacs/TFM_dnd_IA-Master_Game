import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MapRepository, MapSearchCriteria } from '../../../../domain/ports/map.repository.port';
import { BattleMap } from '../../../../domain/entities/battle-map.entity';
import { MapMapper, MapDocumentShape } from '../mappers/map.mapper';

@Injectable()
export class MongooseMapRepository implements MapRepository {
  constructor(@InjectModel('Map') private readonly model: Model<MapDocumentShape>) {}

  async findById(id: string): Promise<BattleMap | null> {
    const doc = await this.model.findById(id).lean<MapDocumentShape>().exec();
    return doc ? MapMapper.toDomain(doc) : null;
  }

  async search(criteria: MapSearchCriteria): Promise<BattleMap[]> {
    const filter: Record<string, unknown> = {};
    if (criteria.tags?.length) {
      filter.tags = { $in: criteria.tags };
    }

    const docs = await this.model.find(filter).lean<MapDocumentShape[]>().exec();
    return docs.map((doc) => MapMapper.toDomain(doc));
  }

  /** Usado por el script de importación del catálogo de mapas. */
  async save(map: BattleMap): Promise<void> {
    const raw = MapMapper.toPersistence(map);
    await this.model.findByIdAndUpdate(raw._id, raw, { upsert: true, returnDocument: 'after' }).exec();
  }
}
