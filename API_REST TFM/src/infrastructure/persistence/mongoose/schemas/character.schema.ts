import { Schema } from 'mongoose';

/**
 * _id se define explícitamente como String (no ObjectId) para que coincida
 * siempre con el id que ya genera el dominio (Character.id, crypto.randomUUID()).
 * Así el dominio nunca tiene que enterarse de un ObjectId de Mongo.
 */
export const characterMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    gameId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    class: { type: String, required: true, enum: ['guerrero', 'picaro', 'mago', 'clerigo'] },
    level: { type: Number, required: true },
    xp: { type: Number, required: true },
    attributes: { type: Object, required: true },
    hp: { type: Object, required: true },
    ac: { type: Number, required: true },
    unassignedSkillPoints: { type: Number, required: true },
    spellcaster: { type: Boolean, required: true },
    spells: { type: Object, default: null },
    inventory: { type: [Object], default: [] },
    equippedWeaponId: { type: String, default: null },
  },
  { collection: 'characters', timestamps: true },
);
