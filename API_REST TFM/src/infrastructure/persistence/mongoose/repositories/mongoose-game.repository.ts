import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GameRepository } from '../../../../domain/ports/game.repository.port';
import { Game } from '../../../../domain/entities/game.entity';
import { GameMapper, GameDocumentShape } from '../mappers/game.mapper';

@Injectable()
export class MongooseGameRepository implements GameRepository {
  constructor(@InjectModel('Game') private readonly model: Model<GameDocumentShape>) {}

  async findById(id: string): Promise<Game | null> {
    const doc = await this.model.findById(id).lean<GameDocumentShape>().exec();
    return doc ? GameMapper.toDomain(doc) : null;
  }

  async findByUserId(userId: string): Promise<Game[]> {
    const docs = await this.model
      .find({ $or: [{ hostUserId: userId }, { 'players.userId': userId }] })
      .lean<GameDocumentShape[]>()
      .exec();
    return docs.map((doc) => GameMapper.toDomain(doc));
  }

  async save(game: Game): Promise<void> {
    const raw = GameMapper.toPersistence(game);
    await this.model.findByIdAndUpdate(raw._id, raw, { upsert: true, returnDocument: 'after' }).exec();
  }
}
