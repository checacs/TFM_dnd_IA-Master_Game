// Mismos tipos que ui-web/src/types/api.ts — es el contrato del mismo backend
// (API_REST TFM), así que se mantienen sincronizados a mano entre ambos
// frontends en vez de duplicar lógica de más alto nivel.

export type GameStatus = 'configuracion' | 'en_curso' | 'pausada' | 'finalizada';

export type CharacterClass = 'guerrero' | 'picaro' | 'mago' | 'clerigo';

export type AttributeKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
}

export interface JoinGameInput {
  characterName: string;
  characterClass: CharacterClass;
}

export interface JoinGameResult {
  characterId: string;
}

export interface LevelUpInput {
  attribute: AttributeKey;
}

export interface MyGameSummary {
  id: string;
  name: string;
  status: GameStatus;
  players: number;
  maxPlayers: number;
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

export interface EncounterEnemy {
  instanceId: string;
  enemyRefId: string;
  name: string;
  currentHp: number;
  ac: number;
  conditions: string[];
  position: BoardPosition | null;
}

export type RoundPhase = 'jugadores' | 'enemigos';

/**
 * Modelo de rondas (sustituye a la iniciativa 1d20+destreza entre
 * jugadores): roundPhase indica si toca actuar a los jugadores o al DM-IA
 * (enemigos); turnClaims son los characterId que tienen el turno reclamado
 * con el botón "Mi turno" -- YA NO es exclusivo de uno solo, varios
 * jugadores pueden reclamarlo a la vez sin bloquearse entre ellos (antes
 * era un candado único que dejaba a un jugador bloqueado si la IA se
 * dirigía a él sin haber liberado el turno de otro); actedThisRound son
 * los characterId que ya actuaron en la ronda de jugadores actual.
 */
export interface ActiveEncounter {
  roundPhase: RoundPhase;
  turnClaims: string[];
  actedThisRound: string[];
  enemies: EncounterEnemy[];
  log: string[];
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
  narrativeLog: NarrativeEntry[];
  /** Único jugador que puede escribir al DM fuera de combate — ver PlayerActionInput. */
  captainUserId: string | null;
}

export interface PlayerActionInput {
  characterId: string;
  content: string;
}

export interface PlayerActionResult {
  narrative: string;
  events: unknown[];
}

export interface PlayerRollInput {
  /** Para atribuir la tirada al jugador en el chat de ui-web (ver PlayerRollUseCase). */
  characterId: string;
  notation?: string;
}

export interface PlayerRollResult {
  notation: string;
  result: number;
  /** Respuesta del DM-IA al turno que dispara esta tirada (ver PlayerRollUseCase) -- la pantalla no la muestra (el móvil no narra), pero invalida ['game', gameId] para que ui-web/HP se actualicen. */
  narrative: string;
  events: unknown[];
}
