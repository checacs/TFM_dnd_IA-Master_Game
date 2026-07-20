import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserRepository } from '../../../../domain/ports/user.repository.port';
import { User } from '../../../../domain/entities/user.entity';
import { UserMapper, UserDocumentShape } from '../mappers/user.mapper';

@Injectable()
export class MongooseUserRepository implements UserRepository {
  constructor(@InjectModel('User') private readonly model: Model<UserDocumentShape>) {}

  async findByUsername(username: string): Promise<User | null> {
    const doc = await this.model.findOne({ username }).lean<UserDocumentShape>().exec();
    return doc ? UserMapper.toDomain(doc) : null;
  }

  async findById(id: string): Promise<User | null> {
    const doc = await this.model.findById(id).lean<UserDocumentShape>().exec();
    return doc ? UserMapper.toDomain(doc) : null;
  }

  /** Usado por scripts/seed-users.ts y por CreateUserUseCase. */
  async save(user: User): Promise<void> {
    const raw = UserMapper.toPersistence(user);
    await this.model.findByIdAndUpdate(raw._id, raw, { upsert: true, returnDocument: 'after' }).exec();
  }
}
