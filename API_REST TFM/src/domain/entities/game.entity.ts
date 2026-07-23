import { DomainError } from '../errors/domain-error';
import { CharacterClass } from './character.entity';
import { MapZone, findZoneByName, isCellInsideZone, isCellInsideZones } from './battle-map.entity';

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
 * que cualquiera actúe en el orden que quiera. turnClaims YA NO es un candado
 * exclusivo (antes un string|null: solo un jugador a la vez podía tenerlo, y
 * si el DM-IA se dirigía a un jugador distinto del que lo tenía reclamado sin
 * haber liberado su turno con end_player_turn, ese otro jugador se quedaba
 * bloqueado sin poder ni reclamar turno ni tirar dados -- un punto muerto
 * real detectado en partida real cuando el DM resolvía la acción de un
 * jugador y en el mismo mensaje le pedía la tirada a otro). Ahora cada
 * personaje puede reclamar y actuar de forma independiente dentro de la
 * misma ronda: el único bloqueo real es no poder actuar dos veces en la
 * misma ronda (actedThisRound) -- el candado por partida de dm-engine (ver
 * server.ts) ya serializa los turnos de la IA, así que no hay riesgo de que
 * dos acciones se pisen aunque se reclamen "a la vez".
 */
export interface ActiveEncounter {
  enemies: EncounterEnemy[];
  log: string[];
  roundPhase: RoundPhase;
  /** characterIds que han reclamado turno y aún no lo han cerrado con end_player_turn. */
  turnClaims: string[];
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
  /**
   * mapId (catálogo BattleMap) de cada mapa que se ha aplicado alguna vez en esta
   * partida, en orden — para que el DM-IA pueda consultarlo vía get_game_state y
   * evitar reelegir siempre el mismo escenario en campañas largas. No se registra
   * nada si setBattleMap se llama sin mapId (compatibilidad hacia atrás), y no se
   * duplica si se reaplica el mismo mapa dos veces seguidas.
   */
  mapHistory: string[];
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
    if (!props.mapHistory) props.mapHistory = [];
    props.players = props.players.map((p) => ({ ...p, conditions: p.conditions ?? [], position: p.position ?? null }));
    if (props.activeEncounter) {
      props.activeEncounter.enemies = props.activeEncounter.enemies.map((e) => ({
        ...e,
        conditions: e.conditions ?? [],
        position: e.position ?? null,
      }));
      if (!props.activeEncounter.roundPhase) props.activeEncounter.roundPhase = 'jugadores';
      // Migración desde el shape anterior (turnClaim: string | null, candado
      // exclusivo) a turnClaims: string[] (ver comentario de ActiveEncounter
      // más arriba) -- partidas ya persistidas con el campo viejo no deben
      // perder el turno que ya tuvieran reclamado al cargar.
      const legacyTurnClaim = (props.activeEncounter as unknown as { turnClaim?: string | null }).turnClaim;
      if (!props.activeEncounter.turnClaims) {
        props.activeEncounter.turnClaims = legacyTurnClaim ? [legacyTurnClaim] : [];
      }
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
      mapHistory: [],
      board: {
        rows: input.board?.rows ?? DEFAULT_BOARD_SIZE,
        cols: input.board?.cols ?? DEFAULT_BOARD_SIZE,
        imageUrl: null,
        combatPoint: null,
        zones: [],
      },
    });
  }

  /**
   * Aplica un mapa del catálogo (docs BattleMap) — resetea el punto de combate porque las
   * dimensiones pueden cambiar. Si se indica mapId, se registra en mapHistory (sin duplicar
   * si es el mismo que el último aplicado) para que el DM-IA pueda consultar qué mapas ya ha
   * usado esta partida y variar en vez de repetir siempre el mismo escenario.
   */
  setBattleMap(map: { rows: number; cols: number; imageUrl: string; zones?: MapZone[]; mapId?: string }): void {
    this.props.board = {
      rows: map.rows,
      cols: map.cols,
      imageUrl: map.imageUrl,
      combatPoint: null,
      zones: map.zones ?? [],
    };
    if (map.mapId && this.props.mapHistory[this.props.mapHistory.length - 1] !== map.mapId) {
      this.props.mapHistory.push(map.mapId);
    }
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

    // Sin capitán no hay quien pueda hablar con el DM-IA fuera de combate
    // (SendPlayerActionUseCase exige ser jugador Y capitán a la vez). El host
    // NO tiene por qué ser jugador de esta partida -- es un rol aparte (ver
    // assignCaptain) -- así que asumirlo como capitán por defecto a ciegas
    // podía lanzar una partida con un capitán "fantasma": nadie (ni el host,
    // que no es jugador; ni ningún jugador real, cuyo userId no coincide)
    // podía entonces hablar nunca con el DM fuera de combate, dejando la
    // partida inservible desde el minuto uno sin ningún error visible. Ahora:
    // si ya se asignó un capitán a mano (assignCaptain, típicamente desde la
    // sala de espera), se respeta tal cual; si no, el host solo puede asumirlo
    // por defecto si TAMBIÉN es jugador de la partida -- si no lo es, se
    // bloquea el lanzamiento hasta que se asigne uno de verdad.
    if (!this.props.captainUserId) {
      const hostIsPlayer = this.props.players.some((p) => p.userId === this.props.hostUserId);
      if (!hostIsPlayer) {
        throw new DomainError(
          'No se puede iniciar la partida sin un capitán asignado: el host no es jugador de esta partida, así ' +
              'que no puede asumir el rol por defecto. Asigna un capitán con assignCaptain antes de lanzar.',
        );
      }
      this.props.captainUserId = this.props.hostUserId;
    }

    this.props.status = 'en_curso';
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
      turnClaims: [],
      actedThisRound: [],
    };
  }

  /**
   * Un jugador reclama su turno durante la fase de jugadores de una ronda de
   * combate. YA NO es exclusivo -- varios jugadores pueden tener el turno
   * reclamado a la vez, cada uno el suyo, sin bloquearse entre ellos (ver
   * comentario de ActiveEncounter más arriba). Reclamar dos veces el mismo
   * jugador es idempotente (retry-safe).
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
    if (!encounter.turnClaims.includes(characterId)) {
      encounter.turnClaims.push(characterId);
    }
  }

  /**
   * Se llama tras enviar la acción del jugador al DM (SendPlayerActionUseCase):
   * libera SU candado (el de este personaje, no el de los demás -- ya no es
   * exclusivo), lo marca como actuado, y si ya actuaron todos los jugadores
   * vivos, pasa la fase a 'enemigos' para que el DM-IA la resuelva.
   */
  releaseTurnAfterAction(characterId: string): void {
    const encounter = this.requireActiveEncounter();
    if (!encounter.turnClaims.includes(characterId)) {
      throw new DomainError('Ese jugador no tiene el turno reclamado');
    }
    encounter.turnClaims = encounter.turnClaims.filter((id) => id !== characterId);
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
    encounter.turnClaims = [];
    encounter.actedThisRound = [];
  }

  /**
   * Cierra el combate activo (tool MCP end_combat) -- se comprobó en partida
   * real que, al no existir NINGÚN método para esto, un combate ya ganado
   * (todos los enemigos a 0 HP) se quedaba anclado para siempre en la
   * partida: el panel "Combate" y el marcador del enemigo derrotado seguían
   * mostrándose en el tablero indefinidamente, incluso varias escenas después
   * de que el jugador siguiera su camino. Antes incluso startEncounter()
   * lanzaba error si ya había un combate activo, así que ni un combate nuevo
   * lo purgaba -- era un callejón sin salida real. El DM-IA debe llamar a
   * esto cuando el combate termina de verdad (todos los enemigos derrotados,
   * el grupo huye, o se negocia una tregua), no solo narrarlo.
   */
  endEncounter(): void {
    this.requireActiveEncounter();
    this.props.activeEncounter = null;
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
   *
   * Si se indica zoneName (el DM-IA debería pasarlo siempre que coloque a alguien en una sala con
   * nombre), la validación es más estricta: la celda tiene que caer DENTRO de esa zona exacta, no de
   * cualquier zona del mapa. Esto existe porque se detectó en partida real que el DM-IA narraba una
   * zona ("junto al Viejo Roble Resonante") y llamaba a place_participant con una celda de la zona
   * vecina ("Coto de Caza de los Trasgos") — ambas válidas para isCellInsideZones (están en el mapa),
   * pero inconsistentes con lo narrado. Sin zoneName se mantiene el comportamiento antiguo.
   */
  placeParticipant(participantId: string, position: BoardPosition, zoneName?: string): void {
    const participant = this.findParticipant(participantId);
    const { rows, cols, zones } = this.props.board;
    if (position.row < 0 || position.row >= rows || position.col < 0 || position.col >= cols) {
      throw new DomainError('La posición cae fuera del tablero');
    }
    if (zoneName) {
      const zone = findZoneByName(zones, zoneName);
      if (!zone) {
        // Se listan los nombres reales para que el DM-IA (que lee este error
        // como resultado de la tool) pueda autocorregirse en un solo intento
        // en vez de probar nombres inventados a ciegas.
        const available = zones.map((z) => `"${z.name}"`).join(', ') || '(el mapa actual no tiene zonas)';
        throw new DomainError(
          `No existe ninguna zona llamada "${zoneName}" en el mapa actual. Zonas disponibles: ${available}`,
        );
      }
      if (!isCellInsideZone(zone, position.row, position.col)) {
        // Igual que arriba: sin los rangos reales de la zona en el mensaje,
        // el DM-IA reintentaba con otras celdas al azar (se comprobó en
        // producción: (0,15) y (1,15) para una zona que va de la fila 14 a la
        // 17), quemando iteraciones del turno. Con los rangos puede elegir
        // una celda válida al primer reintento.
        const ranges = zone.cells
          .map((c) => `filas ${c.rowStart}-${c.rowEnd}, columnas ${c.colStart}-${c.colEnd}`)
          .join(' / ');
        throw new DomainError(
          `La celda (${position.row}, ${position.col}) no está dentro de la zona "${zoneName}" (que ocupa: ${ranges})`,
        );
      }
    } else if (!isCellInsideZones(zones, position.row, position.col)) {
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
      mapHistory: [...(this.props.mapHistory ?? [])],
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
