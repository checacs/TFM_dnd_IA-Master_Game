export type GameStatus = 'configuracion' | 'en_curso' | 'pausada' | 'finalizada';

export type CharacterClass = 'guerrero' | 'picaro' | 'mago' | 'clerigo';

export type AttributeKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface DmEngineChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type GameEventType = 'combate_iniciado' | 'ataque_resuelto' | 'tirada_realizada' | 'xp_otorgada' | 'mapa_aplicado';

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

export interface InitiativeEntry {
  participantId: string;
  type: 'jugador' | 'enemigo';
  initiative: number;
}

export interface EncounterEnemy {
  instanceId: string;
  enemyRefId: string;
  name: string;
  currentHp: number;
  ac: number;
  conditions: string[];
  position: BoardPosition | null;
}

export interface ActiveEncounter {
  initiativeOrder: InitiativeEntry[];
  currentTurnIndex: number;
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
}
