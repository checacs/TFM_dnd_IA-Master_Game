import { Schema } from 'mongoose';

export const userMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'player'], required: true, default: 'player' },
  },
  { collection: 'users', timestamps: true },
);
