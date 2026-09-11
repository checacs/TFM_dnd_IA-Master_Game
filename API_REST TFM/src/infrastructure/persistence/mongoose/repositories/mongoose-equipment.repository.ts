import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EquipmentRepository, EquipmentSearchCriteria } from '../../../../domain/ports/equipment.repository.port';
import { Equipment } from '../../../../domain/entities/equipment.entity';
import { EquipmentMapper, EquipmentDocumentShape } from '../mappers/equipment.mapper';

@Injectable()
export class MongooseEquipmentRepository implements EquipmentRepository {
  constructor(@InjectModel('Equipment') private readonly model: Model<EquipmentDocumentShape>) {}

  async findById(id: string): Promise<Equipment | null> {
    const doc = await this.model.findById(id).lean<EquipmentDocumentShape>().exec();
    return doc ? EquipmentMapper.toDomain(doc) : null;
  }

  async search(criteria: EquipmentSearchCriteria): Promise<Equipment[]> {
    const filter: Record<string, unknown> = {};
    if (criteria.category) {
      filter.category = criteria.category;
    }
    const docs = await this.model.find(filter).lean<EquipmentDocumentShape[]>().exec();
    return docs.map((doc) => EquipmentMapper.toDomain(doc));
  }

  /** Usado por scripts/import-equipment.ts. */
  async save(equipment: Equipment): Promise<void> {
    const raw = EquipmentMapper.toPersistence(equipment);
    await this.model.findByIdAndUpdate(raw._id, raw, { upsert: true, returnDocument: 'after' }).exec();
  }
}
