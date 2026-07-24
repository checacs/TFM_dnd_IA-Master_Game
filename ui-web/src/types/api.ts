export type GameStatus = 'configuracion' | 'en_curso' | 'pausada' | 'finalizada';

export type CharacterClass = 'guerrero' | 'picaro' | 'mago' | 'clerigo';

export type AttributeKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface DmEngineChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type GameEventType =
  | 'combate_iniciado'
  | 'ataque_resuelto'
  | 'tirada_realizada'
  | 'xp_otorgada'
  | 'mapa_aplicado'
  | 'mapa_limpiado'
  | 'participante_colocado'
  | 'ronda_reabierta';

export interface GameEvent {
  type: GameEventType;
  payload: unknown;
}

export interface DmEngineResult {
  narrative: string;
  events: GameEvent[];
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
}

export interface CreateGameInput {
  name: string;
  maxPlayers: number;
}

export interface CreateGameResult {
  gameId: string;
}

export interface JoinGameInput {
  characterName: string;
  characterClass: CharacterClass;
}

export interface JoinGameResult {
  characterId: string;
}

export interface PlayerAttackInput {
  attackerCharacterId: string;
  targetId: string;
  targetArmorClass: number;
}

export interface PlayerAttackResult {
  hit: boolean;
  attackRoll: number;
  damage: number;
  weaponName: string;
}

export interface SendMessageInput {
  messages: DmEngineChatMessage[];
}

export interface CastSpellInput {
  casterCharacterId: string;
  spellId: string;
  targetId?: string;
}

export interface LevelUpInput {
  attribute: AttributeKey;
}

export interface SpellSlots {
  level1: { max: number; used: number };
  level2: { max: number; used: number };
}

export interface InventoryItem {
  equipmentId: string;
  name: string;
}

export interface CharacterSnapshot {
  _id: string;
  ownerId: string;
  gameId: string;
  name: string;
  class: CharacterClass;
  level: number;
  xp: number;
  attributes: Record<AttributeKey, number>;
  hp: { current: number; max: number };
  ac: number;
  unassignedSkillPoints: number;
  spellcaster: boolean;
  spells: { known: string[]; slots: SpellSlots } | null;
  inventory: InventoryItem[];
  equippedWeaponId: string | null;
  equippedArmorId: string | null;
  equippedAccessoryId: string | null;
  currency: { gold: number; silver: number; copper: number };
}

export interface BoardPosition {
  row: number;
  col: number;
}

export interface Player {
  userId: string;
  characterId: string;
  name: string;
  class: CharacterClass;
  currentHp: number;
  conditions: string[];
  position: BoardPosition | null;
}

export interface EncounterEnemy {
  instanceId: string;
  enemyRefId: string;
  name: string;
  currentHp: number;
  ac: number;
  conditions: string[];
  position: BoardPosition | null;
  /** Imagen del catálogo (dnd5eapi.co) -- null/ausente si el monstruo no tiene arte oficial. */
  imageUrl?: string | null;
}

export type RoundPhase = 'jugadores' | 'enemigos';

/**
 * Modelo de rondas (sustituye a la iniciativa 1d20+destreza entre
 * jugadores): roundPhase indica si toca actuar a los jugadores o al DM-IA
 * (enemigos); turnClaims son los characterId que tienen el turno reclamado
 * desde el móvil ("Mi turno") -- YA NO es exclusivo de uno solo, varios
 * jugadores pueden reclamarlo a la vez sin bloquearse entre ellos;
 * actedThisRound son los characterId que ya actuaron en la ronda de
 * jugadores actual.
 */
export interface ActiveEncounter {
  roundPhase: RoundPhase;
  turnClaims: string[];
  actedThisRound: string[];
  enemies: EncounterEnemy[];
  log: string[];
}

export interface MapZoneCells {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

export interface MapZone {
  name: string;
  cells: MapZoneCells[];
}

export interface Board {
  rows: number;
  cols: number;
  imageUrl: string | null;
  combatPoint: { row: number; col: number } | null;
  zones: MapZone[];
}

export interface MyGameSummary {
  id: string;
  name: string;
  status: string;
  players: number;
  maxPlayers: number;
}

export interface NarrativeEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface GameSnapshot {
  name: string;
  hostUserId: string;
  maxPlayers: number;
  status: GameStatus;
  players: Player[];
  activeEncounter: ActiveEncounter | null;
  board: Board;
  narrativeLog: NarrativeEntry[];
  /** Único jugador que puede escribir al DM fuera de combate — ver assignCaptain. */
  captainUserId: string | null;
}
