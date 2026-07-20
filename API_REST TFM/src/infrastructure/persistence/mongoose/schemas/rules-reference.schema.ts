import { Schema } from 'mongoose';

export const rulesReferenceMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    kind: { type: String, required: true, enum: ['condition', 'skill', 'damage-type', 'ability-score', 'rule-section'], index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    abilityScore: { type: String, default: null },
    relatedSkills: { type: [String], default: null },
  },
  { collection: 'rules_references', timestamps: true },
);
