import { Schema } from 'mongoose';

export const magicItemMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    rarity: { type: String, required: true, index: true },
    description: { type: String, required: true },
    isVariant: { type: Boolean, required: true },
    variantNames: { type: [String], required: true },
  },
  { collection: 'magic_items', timestamps: true },
);
