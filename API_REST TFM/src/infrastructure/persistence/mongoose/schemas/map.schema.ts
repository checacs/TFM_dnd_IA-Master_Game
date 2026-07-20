import { Schema } from 'mongoose';

const mapZoneCellsSchema = new Schema(
  {
    rowStart: { type: Number, required: true },
    rowEnd: { type: Number, required: true },
    colStart: { type: Number, required: true },
    colEnd: { type: Number, required: true },
  },
  { _id: false },
);

const mapZoneSchema = new Schema(
  {
    name: { type: String, required: true },
    cells: { type: [mapZoneCellsSchema], required: true },
  },
  { _id: false },
);

export const mapMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    tags: { type: [String], required: true, index: true },
    rows: { type: Number, required: true },
    cols: { type: Number, required: true },
    imageUrl: { type: String, required: true },
    /** Salas/zonas válidas del mapa — [] en mapas del catálogo aún no catalogados (ver BattleMap.isCellInsideZones). */
    zones: { type: [mapZoneSchema], default: [] },
  },
  { collection: 'maps', timestamps: true },
);
