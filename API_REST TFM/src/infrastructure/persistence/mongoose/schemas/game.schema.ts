import { Schema } from 'mongoose';

const boardPositionSchema = new Schema(
  {
    row: { type: Number, required: true },
    col: { type: Number, required: true },
  },
  { _id: false },
);

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

const playerSchema = new Schema(
  {
    userId: { type: String, required: true },
    characterId: { type: String, required: true },
    name: { type: String, required: true },
    class: { type: String, required: true, enum: ['guerrero', 'picaro', 'mago', 'clerigo'] },
    currentHp: { type: Number, required: true },
    conditions: { type: [String], default: [] },
    position: { type: boardPositionSchema, default: null },
  },
  { _id: false },
);

const encounterEnemySchema = new Schema(
  {
    instanceId: { type: String, required: true },
    enemyRefId: { type: String, required: true },
    name: { type: String, required: true },
    currentHp: { type: Number, required: true },
    ac: { type: Number, required: true },
    conditions: { type: [String], default: [] },
    position: { type: boardPositionSchema, default: null },
    imageUrl: { type: String, default: null },
  },
  { _id: false },
);

const activeEncounterSchema = new Schema(
  {
    // Modelo de rondas (sustituye a initiativeOrder/currentTurnIndex, ver
    // Game.startEncounter/claimTurn/releaseTurnAfterAction en el dominio):
    // roundPhase indica si toca actuar a jugadores o al DM-IA (enemigos),
    // turnClaim es el candado de "Mi turno" del móvil, actedThisRound son
    // los characterId que ya actuaron en la ronda de jugadores actual.
    roundPhase: { type: String, required: true, enum: ['jugadores', 'enemigos'] },
    turnClaim: { type: String, default: null },
    actedThisRound: { type: [String], default: [] },
    enemies: { type: [encounterEnemySchema], required: true },
    log: { type: [String], required: true },
  },
  { _id: false },
);

const boardSchema = new Schema(
  {
    rows: { type: Number, required: true },
    cols: { type: Number, required: true },
    imageUrl: { type: String, default: null },
    combatPoint: { type: Object, default: null },
    zones: { type: [mapZoneSchema], default: [] },
  },
  { _id: false },
);

export const gameMongooseSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, index: true },
    hostUserId: { type: String, required: true },
    maxPlayers: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: ['configuracion', 'en_curso', 'pausada', 'finalizada'],
      index: true,
    },
    players: { type: [playerSchema], required: true },
    activeEncounter: { type: activeEncounterSchema, default: null },
    board: { type: boardSchema, required: true },
    narrativeLog: {
      type: [{ role: { type: String, enum: ['user', 'assistant'] }, content: String }],
      default: [],
    },
    // Único jugador que puede escribir al DM fuera de combate (ver
    // Game.assignCaptain) — null hasta que se lanza la partida.
    captainUserId: { type: String, default: null },
  },
  { collection: 'games', timestamps: true },
);
