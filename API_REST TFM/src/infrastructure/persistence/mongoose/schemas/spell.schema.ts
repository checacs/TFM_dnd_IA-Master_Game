import { Schema } from 'mongoose';

export const spellMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    level: { type: Number, required: true, index: true },
    school: { type: String, required: true },
    castingTime: { type: String, required: true },
    range: { type: String, required: true },
    duration: { type: String, required: true },
    concentration: { type: Boolean, required: true },
    ritual: { type: Boolean, required: true },
    components: { type: [String], required: true },
    material: { type: String, default: null },
    description: { type: String, required: true },
    classes: { type: [String], required: true, index: true },
    damageType: { type: String, default: null },
    damageAtSlotLevel: { type: Object, default: null },
    savingThrowAbility: { type: String, default: null },
    savingThrowSuccess: { type: String, default: null },
    areaOfEffectType: { type: String, default: null },
    areaOfEffectSize: { type: Number, default: null },
  },
  { collection: 'spells', timestamps: true },
);
