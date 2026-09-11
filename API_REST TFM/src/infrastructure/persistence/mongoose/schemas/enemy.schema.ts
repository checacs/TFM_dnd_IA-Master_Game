import { Schema } from 'mongoose';

const attackSchema = new Schema(
  {
    name: { type: String, required: true },
    toHitBonus: { type: Number, required: true },
    damageDice: { type: String, required: true },
    damageType: { type: String, required: true },
  },
  { _id: false },
);

export const enemyMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    tags: { type: [String], required: true, index: true },
    challengeRating: { type: Number, required: true, index: true },
    attributes: { type: Object, required: true },
    hp: { type: Number, required: true },
    ac: { type: Number, required: true },
    attacks: { type: [attackSchema], required: true },
    resistances: { type: [String], required: true },
    source: { type: String },
    imageUrl: { type: String, default: null },
  },
  { collection: 'enemies', timestamps: true },
);
