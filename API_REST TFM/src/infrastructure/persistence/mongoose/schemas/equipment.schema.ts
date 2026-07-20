import { Schema } from 'mongoose';

export const equipmentMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true, index: true },
    cost: { type: Object, default: null },
    weight: { type: Number, default: null },
    description: { type: String, required: true },
    weaponCategory: { type: String, default: null },
    weaponRange: { type: String, default: null },
    damageDice: { type: String, default: null },
    damageType: { type: String, default: null },
    properties: { type: [String], required: true },
  },
  { collection: 'equipment', timestamps: true },
);
