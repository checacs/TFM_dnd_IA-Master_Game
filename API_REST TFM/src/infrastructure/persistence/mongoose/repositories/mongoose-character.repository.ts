import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterRepository } from '../../../../domain/ports/character.repository.port';
import { Character } from '../../../../domain/entities/character.entity';
import { CharacterMapper, CharacterDocumentShape } from '../mappers/character.mapper';

@Injectable()
export class MongooseCharacterRepository implements CharacterRepository {
  constructor(
    @InjectModel('Character') private readonly model: Model<CharacterDocumentShape>,
  ) {}

  async findById(id: string): Promise<Character | null> {
    const doc = await this.model.findById(id).lean<CharacterDocumentShape>().exec();
    return doc ? CharacterMapper.toDomain(doc) : null;
  }

  async save(character: Character): Promise<void> {
    const raw = CharacterMapper.toPersistence(character);
    await this.model.findByIdAndUpdate(raw._id, raw, { upsert: true, returnDocument: 'after' }).exec();
  }
}
