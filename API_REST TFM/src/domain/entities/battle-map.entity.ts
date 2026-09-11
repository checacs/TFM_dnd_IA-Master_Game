import { DomainError } from '../errors/domain-error';

/** Rango rectangular de celdas (filas/columnas inclusive) que pertenece a una sala/zona del mapa. */
export interface MapZoneCells {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

/** Sala o zona con nombre dentro de un mapa multisala — usada para validar dónde puede colocarse un participante. */
export interface MapZone {
  name: string;
  cells: MapZoneCells[];
}

/**
 * Paso físico de este mapa a otro del catálogo (escalera, trampilla, túnel...).
 * CASO REAL: desde el sótano de la taberna el DM-IA inventó una "puerta de
 * hierro" y aplicó una fortaleza enorme que no tenía nada que ver; con las
 * conexiones declaradas, el DM sabe a dónde lleva cada salida real.
 */
export interface MapConnection {
  /** mapId del catálogo al que lleva este paso. */
  mapId: string;
  /** Por dónde se pasa, en lenguaje narrativo (ej. "la trampilla candada del Almacén del Sótano 2"). */
  via: string;
}

export interface BattleMapProps {
  name: string;
  description: string;
  tags: string[];
  rows: number;
  cols: number;
  /** Ruta servida como estático (ver assets/maps/), no una URL externa. */
  imageUrl: string;
  /** Salas/zonas válidas del mapa. Vacío en mapas antiguos sin catalogar todavía — ver isCellInsideZones. */
  zones: MapZone[];
  /** Pasos a otros mapas del catálogo. [] si el mapa no declara ninguno. */
  connections: MapConnection[];
  /**
   * true si las ÚNICAS salidas del mapa son sus connections (un sótano sin
   * puerta a la calle): entonces set_battle_map/start_combat rechazan cualquier
   * otro mapa. false (por defecto) en sitios con salida al exterior, desde
   * donde el grupo puede viajar a cualquier parte.
   */
  closedExits: boolean;
}

/** Input al crear un mapa — zones/connections/closedExits son opcionales (mapas antiguos del catálogo). */
export type CreateBattleMapInput = Omit<BattleMapProps, 'zones' | 'connections' | 'closedExits'> & {
  zones?: MapZone[];
  connections?: MapConnection[];
  closedExits?: boolean;
};

/**
 * Una celda es válida si el mapa no tiene zonas catalogadas todavía (compatibilidad hacia atrás,
 * ver comentario de zones más arriba), o si cae dentro de alguna de las zonas definidas.
 */
export function isCellInsideZones(zones: MapZone[], row: number, col: number): boolean {
  if (zones.length === 0) {
    return true;
  }
  return zones.some((zone) => isCellInsideZone(zone, row, col));
}

/** Busca una zona por nombre exacto, ignorando mayusculas/minusculas y espacios sobrantes. */
export function findZoneByName(zones: MapZone[], zoneName: string): MapZone | undefined {
  const normalized = zoneName.trim().toLowerCase();
  return zones.find((zone) => zone.name.trim().toLowerCase() === normalized);
}

/**
 * A diferencia de isCellInsideZones (que acepta la celda si cae en CUALQUIER zona), esto valida
 * una zona concreta -- necesario porque zonas vecinas comparten a veces el mismo rango de filas o
 * columnas y solo difieren en el otro eje, así que "está dentro de alguna zona" no basta para
 * detectar que el DM-IA narró una sala pero coloco al participante en la de al lado.
 */
export function isCellInsideZone(zone: MapZone, row: number, col: number): boolean {
  return zone.cells.some((c) => row >= c.rowStart && row <= c.rowEnd && col >= c.colStart && col <= c.colEnd);
}

/**
 * Catálogo maestro de mapas de combate — mismo patrón que Enemy: imágenes ya
 * generadas de antemano (no en tiempo real) y reutilizables entre partidas.
 * El DM-IA elige una por etiquetas (SearchMapsUseCase), nunca inventa una.
 */
export class BattleMap {
  private constructor(
    public readonly id: string,
    private readonly props: BattleMapProps,
  ) {}

  static create(props: CreateBattleMapInput, id: string = crypto.randomUUID()): BattleMap {
    return new BattleMap(id, {
      ...props,
      zones: props.zones ?? [],
      connections: props.connections ?? [],
      closedExits: props.closedExits ?? false,
    });
  }

  /** Si desde este mapa se puede pasar directamente a `mapId` (quedarse en el mismo siempre vale). */
  canLeadTo(mapId: string): boolean {
    return mapId === this.id || !this.props.closedExits || this.props.connections.some((c) => c.mapId === mapId);
  }

  assertCanLeadTo(mapId: string): void {
    if (this.canLeadTo(mapId)) {
      return;
    }
    const exits = this.props.connections.map((c) => `${c.mapId} (por ${c.via})`).join(', ');
    throw new DomainError(
        `El mapa "${mapId}" no está conectado con "${this.props.name}" (${this.id}): desde aquí solo se puede ` +
        `ir a ${exits}. Elige uno de esos mapIds y adapta tu narración a esa salida real -- no inventes ` +
        'puertas, pasadizos ni escaleras que el mapa actual no tiene.',
    );
  }

  toSnapshot(): BattleMapProps {
    return {
      ...this.props,
      tags: [...this.props.tags],
      zones: this.props.zones.map((z) => ({ ...z, cells: z.cells.map((c) => ({ ...c })) })),
      connections: this.props.connections.map((c) => ({ ...c })),
    };
  }
}
