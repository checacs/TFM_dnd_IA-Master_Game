import { DomainError } from '../errors/domain-error';
import { CharacterClass } from './character.entity';
import { MapZone, isCellInsideZones } from './battle-map.entity';

export type GameStatus = 'configuracion' | 'en_curso' | 'pausada' | 'finalizada';

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
  /** null hasta que el DM-IA lo coloque en el tablero con placeParticipant. */
  position: BoardPosition | null;
}

export type RoundPhase = 'jugadores' | 'enemigos';

export interface EncounterEnemy {
  instanceId: string;
  enemyRefId: string;
  name: string;
  currentHp: number;
  ac: number;
  conditions: string[];
  /** null hasta que el DM-IA lo coloque en el tablero con placeParticipant. */
  position: BoardPosition | null;
  /** Copiado del catálogo (Enemy.imageUrl) al arrancar el combate -- null si el
   * monstruo no tiene arte oficial en el SRD. */
  imageUrl?: string | null;
}

/**
 * Modelo de rondas simplificado (sustituye a la iniciativa 1d20+destreza
 * entre jugadores): dentro de una ronda de combate, la fase 'jugadores' deja
 * que cualquiera actúe en el orden que quiera —turnClaim es el candado que
 * evita que dos jugadores actúen a la vez (ver Game.claimTurn/
 * releaseTurnAfterAction)—. Cuando todos los jugadores vivos han actuado
 * (actedThisRound), la fase pasa a 'enemigos', que el DM-IA resuelve
 * libremente (resolve_attack, etc.) y luego reabre la ronda de jugadores
 * llamando a la tool MCP advance_to_player_round.
 */
export interface ActiveEncounter {
  enemies: EncounterEnemy[];
  log: string[];
  roundPhase: RoundPhase;
  /** characterId del jugador que tiene el turno reclamado ahora mismo, o null si está libre. */
  turnClaim: string | null;
  /** characterIds que ya han actuado en la ronda de jugadores actual. */
  actedThisRound: string[];
}

export interface Board {
  rows: number;
  cols: number;
  /** null hasta que se aplique un mapa (setBattleMap) — sin imagen, la UI pinta una cuadrícula plana. */
  imageUrl: string | null;
  combatPoint: { row: number; col: number } | null;
  /** Zonas del mapa aplicado (copiadas del catálogo BattleMap). Vacío en tableros sin mapa o con mapas sin catalogar. */
  zones: MapZone[];
}

export interface NarrativeEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface GameProps {
  name: string;
  hostUserId: string;
  maxPlayers: number;
  status: GameStatus;
  players: Player[];
  activeEncounter: ActiveEncounter | null;
  board: Board;
  narrativeLog: NarrativeEntry[];
  /**
   * El capitán es el único jugador que puede hablar con el DM fuera de
   * combate (dentro de combate manda el candado de turno, ver claimTurn) —
   * simplifica coordinar quién narra cuando el grupo no está en pelea. null
   * hasta que se lanza la partida (launch() lo fija al host por defecto) o
   * se reasigna explícitamente con assignCaptain.
   */
  captainUserId: string | null;
}

export type CreateGameInput = Pick<GameProps, 'name' | 'hostUserId' | 'maxPlayers'> & {
  board?: Partial<Pick<Board, 'rows' | 'cols'>>;
};

const DEFAULT_BOARD_SIZE = 8;

const MIN_PLAYERS_TO_LAUNCH = 1;

/**
 * Aggregate root de una partida (docs/02-modelo-datos-mongodb.md).
 * Embebe el combate activo a propósito: es el mismo documento que la UI
 * necesita leer entero para pintar tablero + enemigos + turno actual.
 */
export class Game {
  private constructor(
    public readonly id: string,
    private props: GameProps,
  ) {}

  /** Rehidrata una partida ya existente desde persistencia — a diferencia de
   * create(), no resetea jugadores ni combate activo, y no revalida
   * invariantes de creación (ya se validaron cuando se creó por primera vez). */
  static reconstitute(id: string, props: GameProps): Game {
    if (!props.narrativeLog) props.narrativeLog = [];
    if (!props.board.zones) props.board.zones = [];
    if (props.captainUserId === undefined) props.captainUserId = null;
    props.players = props.players.map((p) => ({ ...p, conditions: p.conditions ?? [], position: p.position ?? null }));
    if (props.activeEncounter) {
      props.activeEncounter.enemies = props.activeEncounter.enemies.map((e) => ({
        ...e,
        conditions: e.conditions ?? [],
        position: e.position ?? null,
      }));
      if (!props.activeEncounter.roundPhase) props.activeEncounter.roundPhase = 'jugadores';
      if (props.activeEncounter.turnClaim === undefined) props.activeEncounter.turnClaim = null;
      if (!props.activeEncounter.actedThisRound) props.activeEncounter.actedThisRound = [];
    }
    return new Game(id, props);
  }

  static create(input: CreateGameInput, id: string = crypto.randomUUID()): Game {
    if (input.maxPlayers < 1 || input.maxPlayers > 4) {
      throw new DomainError('El número de jugadores debe estar entre 1 y 4');
    }
    return new Game(id, {
      ...input,
      status: 'configuracion',
      players: [],
      activeEncounter: null,
      narrativeLog: [],
      captainUserId: null,
      board: {
        rows: input.board?.rows ?? DEFAULT_BOARD_SIZE,
        cols: input.board?.cols ?? DEFAULT_BOARD_SIZE,
        imageUrl: null,
        combatPoint: null,
        zones: [],
      },
    });
  }

  /** Aplica un mapa del catálogo (docs BattleMap) — resetea el punto de combate porque las dimensiones pueden cambiar. */
  setBattleMap(map: { rows: number; cols: number; imageUrl: string; zones?: MapZone[] }): void {
    this.props.board = {
      rows: map.rows,
      cols: map.cols,
      imageUrl: map.imageUrl,
      combatPoint: null,
      zones: map.zones ?? [],
    };
  }

  /**
   * Quita el mapa aplicado y vuelve a la cuadrícula plana por defecto (mismo
   * estado que al crear la partida). Para cuando la narración cambia de
   * localización y no hay ningún mapa del catálogo que encaje todavía — sin
   * esto, la UI se queda mostrando la imagen de la escena anterior aunque ya
   * no tenga nada que ver con lo que se está narrando.
   */
  clearBattleMap(): void {
    this.props.board = {
      rows: DEFAULT_BOARD_SIZE,
      cols: DEFAULT_BOARD_SIZE,
      imageUrl: null,
      combatPoint: null,
      zones: [],
    };
  }

  appendNarrativeEntry(entry: NarrativeEntry): void {
    this.props.narrativeLog.push(entry);
  }

  setCombatPoint(point: { row: number; col: number }): void {
    const { rows, cols } = this.props.board;
    if (point.row < 0 || point.row >= rows || point.col < 0 || point.col >= cols) {
      throw new DomainError('El punto de combate cae fuera del tablero');
    }
    this.props.board.combatPoint = point;
  }

  addPlayer(player: Omit<Player, 'conditions' | 'position'> & { conditions?: string[] }): void {
    if (this.props.status !== 'configuracion') {
      throw new DomainError('La partida ya ha empezado');
    }
    if (this.props.players.length >= this.props.maxPlayers) {
      throw new DomainError('La partida está completa');
    }
    if (this.props.players.some((p) => p.userId === player.userId)) {
      throw new DomainError('Ya estás en esta partida');
    }
    this.props.players.push({ ...player, conditions: player.conditions ?? [], position: null });
  }

  /** Solo el host puede lanzar la partida (docs/10-autenticacion-y-lobby.md). */
  launch(requestingUserId: string): void {
    if (requestingUserId !== this.props.hostUserId) {
      throw new DomainError('Solo el host puede iniciar la partida');
    }
    if (this.props.status !== 'configuracion') {
      throw new DomainError('La partida ya ha empezado');
    }
    if (this.props.players.length < MIN_PLAYERS_TO_LAUNCH) {
      throw new DomainError(`Se necesita al menos ${MIN_PLAYERS_TO_LAUNCH} jugador`);
    }
    this.props.status = 'en_curso';
    // Sin capitán todavía no hay quien pueda hablar con el DM fuera de
    // combate (ver sendPlayerAction/assignCaptain) — el host es el capitán
    // por defecto, el propio host puede reasignarlo luego con assignCaptain.
    if (!this.props.captainUserId) {
      this.props.captainUserId = this.props.hostUserId;
    }
  }

  /**
   * Ya no calcula iniciativa entre jugadores (antes 1d20+destreza): el orden
   * entre jugadores no importa en la práctica de mesa, solo que no se pisen
   * — eso lo resuelve el candado de turno (claimTurn/releaseTurnAfterAction).
   * Los enemigos los resuelve el DM-IA libremente con resolve_attack, sin
   * orden fijo tampoco.
   */
  startEncounter(input: {
    enemies: (Omit<EncounterEnemy, 'conditions' | 'position'> & { conditions?: string[] })[];
  }): void {
    if (this.props.status !== 'en_curso') {
      throw new DomainError('La partida no está en curso');
    }
    if (this.props.activeEncounter) {
      throw new DomainError('Ya hay un combate activo');
    }
    this.props.activeEncounter = {
      enemies: input.enemies.map((enemy) => ({ ...enemy, conditions: enemy.conditions ?? [], position: null })),
      log: [],
      roundPhase: 'jugadores',
      turnClaim: null,
      actedThisRound: [],
    };
  }

  /**
   * Un jugador reclama el turno durante la fase de jugadores de una ronda de
   * combate — candado simple para que no dos jugadores actúen a la vez desde
   * sus móviles. Reclamar dos veces el mismo jugador es idempotente (retry-safe).
   */
  claimTurn(characterId: string): void {
    const encounter = this.requireActiveEncounter();
    if (encounter.roundPhase !== 'jugadores') {
      throw new DomainError('No es la fase de jugadores de esta ronda');
    }
    if (!this.props.players.some((p) => p.characterId === characterId)) {
      throw new DomainError('Ese personaje no es un jugador de esta partida');
    }
    if (encounter.actedThisRound.includes(characterId)) {
      throw new DomainError('Ese jugador ya ha actuado en esta ronda');
    }
    if (encounter.turnClaim && encounter.turnClaim !== characterId) {
      throw new DomainError('Otro jugador ya tiene el turno reclamado');
    }
    encounter.turnClaim = characterId;
  }

  /**
   * Se llama tras enviar la acción del jugador al DM (SendPlayerActionUseCase):
   * libera el candado, lo marca como actuado, y si ya actuaron todos los
   * jugadores vivos, pasa la fase a 'enemigos' para que el DM-IA la resuelva.
   */
  releaseTurnAfterAction(characterId: string): void {
    const encounter = this.requireActiveEncounter();
    if (encounter.turnClaim !== characterId) {
      throw new DomainError('Ese jugador no tiene el turno reclamado');
    }
    encounter.turnClaim = null;
    if (!encounter.actedThisRound.includes(characterId)) {
      encounter.actedThisRound.push(characterId);
    }
    const aliveIds = this.props.players.filter((p) => p.currentHp > 0).map((p) => p.characterId);
    if (aliveIds.every((id) => encounter.actedThisRound.includes(id))) {
      encounter.roundPhase = 'enemigos';
    }
  }

  /** Llamado por el DM-IA (tool advance_to_player_round) tras resolver la fase de enemigos. */
  reopenPlayerRound(): void {
    const encounter = this.requireActiveEncounter();
    encounter.roundPhase = 'jugadores';
    encounter.turnClaim = null;
    encounter.actedThisRound = [];
  }

  private requireActiveEncounter(): ActiveEncounter {
    if (!this.props.activeEncounter) {
      throw new DomainError('No hay combate activo');
    }
    return this.props.activeEncounter;
  }

  /**
   * Designa/reasigna quién es el capitán del grupo. Puede hacerlo el host
   * (típicamente desde la sala de espera en ui-web, antes de lanzar la
   * partida) o el capitán actual (típicamente en plena partida desde su
   * propio móvil, para pasarle el testigo a otro jugador sin depender del
   * host — normalmente el host ni siquiera es jugador, así que exigir
   * siempre que sea el host habría dejado sin forma de cambiar de capitán
   * una vez la partida está en curso).
   */
  assignCaptain(requestingUserId: string, targetUserId: string): void {
    const isHost = requestingUserId === this.props.hostUserId;
    const isCurrentCaptain = requestingUserId === this.props.captainUserId;
    if (!isHost && !isCurrentCaptain) {
      throw new DomainError('Solo el host o el capitán actual pueden reasignar el capitán');
    }
    if (!this.props.players.some((p) => p.userId === targetUserId)) {
      throw new DomainError('Ese usuario no es un jugador de esta partida');
    }
    this.props.captainUserId = targetUserId;
  }

  /** Usado por ResolveAttackUseCase (docs/03) — busca tanto en jugadores como en enemigos del combate activo. */
  applyDamageToParticipant(participantId: string, damage: number): void {
    const player = this.props.players.find((p) => p.characterId === participantId);
    if (player) {
      player.currentHp = Math.max(0, player.currentHp - damage);
      return;
    }

    const enemy = this.props.activeEncounter?.enemies.find((e) => e.instanceId === participantId);
    if (enemy) {
      enemy.currentHp = Math.max(0, enemy.currentHp - damage);
      return;
    }

    throw new DomainError('Participante no encontrado en la partida');
  }

  /** Devuelve las condiciones activas de un jugador o enemigo — [] si no tiene ninguna. */
  getConditions(participantId: string): string[] {
    return [...this.findParticipant(participantId).conditions];
  }

  /** El DM-IA aplica una condición (ej. "frightened") a un participante — sin duplicar si ya la tiene. */
  applyCondition(participantId: string, conditionIndex: string): void {
    const participant = this.findParticipant(participantId);
    if (!participant.conditions.includes(conditionIndex)) {
      participant.conditions.push(conditionIndex);
    }
  }

  removeCondition(participantId: string, conditionIndex: string): void {
    const participant = this.findParticipant(participantId);
    participant.conditions = participant.conditions.filter((c) => c !== conditionIndex);
  }

  /**
   * El DM-IA coloca a un jugador o enemigo en una celda del tablero. Valida límites del tablero
   * siempre; si el mapa aplicado tiene zonas catalogadas (board.zones), valida además que la celda
   * caiga dentro de alguna — si no tiene zonas catalogadas todavía, no se restringe (ver isCellInsideZones).
   */
  placeParticipant(participantId: string, position: BoardPosition): void {
    const participant = this.findParticipant(participantId);
    const { rows, cols, zones } = this.props.board;
    if (position.row < 0 || position.row >= rows || position.col < 0 || position.col >= cols) {
      throw new DomainError('La posición cae fuera del tablero');
    }
    if (!isCellInsideZones(zones, position.row, position.col)) {
      throw new DomainError('La posición cae fuera de las zonas válidas del mapa');
    }
    participant.position = position;
  }

  private findParticipant(participantId: string): Player | EncounterEnemy {
    const player = this.props.players.find((p) => p.characterId === participantId);
    if (player) {
      return player;
    }
    const enemy = this.props.activeEncounter?.enemies.find((e) => e.instanceId === participantId);
    if (enemy) {
      return enemy;
    }
    throw new DomainError('Participante no encontrado en la partida');
  }

  toSnapshot(): GameProps {
    return {
      ...this.props,
      players: this.props.players.map((p) => ({
        ...p,
        conditions: [...(p.conditions ?? [])],
        position: p.position ? { ...p.position } : null,
      })),
      board: {
        ...this.props.board,
        combatPoint: this.props.board.combatPoint ? { ...this.props.board.combatPoint } : null,
        zones: (this.props.board.zones ?? []).map((z) => ({ ...z, cells: z.cells.map((c) => ({ ...c })) })),
      },
      narrativeLog: [...(this.props.narrativeLog ?? [])],
      activeEncounter: this.props.activeEncounter
        ? {
            ...this.props.activeEncounter,
            enemies: this.props.activeEncounter.enemies.map((e) => ({
              ...e,
              conditions: [...(e.conditions ?? [])],
              position: e.position ? { ...e.position } : null,
            })),
            log: [...this.props.activeEncounter.log],
            actedThisRound: [...this.props.activeEncounter.actedThisRound],
          }
        : null,
    };
  }
}
