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
}

/** Input al crear un mapa — zones es opcional porque muchos mapas del catálogo aún no la tienen catalogada. */
export type CreateBattleMapInput = Omit<BattleMapProps, 'zones'> & { zones?: MapZone[] };

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
    return new BattleMap(id, { ...props, zones: props.zones ?? [] });
  }

  toSnapshot(): BattleMapProps {
    return {
      ...this.props,
      tags: [...this.props.tags],
      zones: this.props.zones.map((z) => ({ ...z, cells: z.cells.map((c) => ({ ...c })) })),
    };
  }
}
