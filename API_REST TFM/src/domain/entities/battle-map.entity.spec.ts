import { BattleMap, findZoneByName, isCellInsideZone, isCellInsideZones } from './battle-map.entity';

function buildMap(overrides: Partial<Parameters<typeof BattleMap.create>[0]> = {}) {
  return BattleMap.create({
    name: 'Taberna del jabalí',
    description: 'Sala principal de una taberna, con mesas y una chimenea.',
    tags: ['interior', 'taberna', 'social'],
    rows: 10,
    cols: 14,
    imageUrl: '/maps/taberna-jabali.png',
    ...overrides,
  });
}

describe('BattleMap', () => {
  it('expone sus datos a través de toSnapshot', () => {
    const map = buildMap();
    const snapshot = map.toSnapshot();

    expect(snapshot.name).toBe('Taberna del jabalí');
    expect(snapshot.rows).toBe(10);
    expect(snapshot.cols).toBe(14);
    expect(snapshot.imageUrl).toBe('/maps/taberna-jabali.png');
    expect(snapshot.tags).toEqual(['interior', 'taberna', 'social']);
  });

  it('toSnapshot devuelve una copia, no la referencia interna de tags', () => {
    const map = buildMap();
    const snapshot = map.toSnapshot();
    snapshot.tags.push('otra-etiqueta');

    expect(map.toSnapshot().tags).toEqual(['interior', 'taberna', 'social']);
  });

  describe('zones', () => {
    it('zones esta vacio por defecto si no se indica al crear el mapa', () => {
      const map = buildMap();
      expect(map.toSnapshot().zones).toEqual([]);
    });

    it('expone las zonas indicadas al crear el mapa', () => {
      const map = buildMap({
        zones: [{ name: 'Sala principal', cells: [{ rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 5 }] }],
      });

      expect(map.toSnapshot().zones).toEqual([
        { name: 'Sala principal', cells: [{ rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 5 }] },
      ]);
    });

    it('toSnapshot devuelve una copia de zones, no la referencia interna', () => {
      const map = buildMap({
        zones: [{ name: 'Sala principal', cells: [{ rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 5 }] }],
      });
      const snapshot = map.toSnapshot();
      snapshot.zones.push({ name: 'Intrusa', cells: [] });

      expect(map.toSnapshot().zones).toHaveLength(1);
    });
  });

  describe('isCellInsideZones', () => {
    it('devuelve true si no hay zonas definidas (mapa sin zonas, compatibilidad hacia atras)', () => {
      expect(isCellInsideZones([], 0, 0)).toBe(true);
    });

    it('devuelve true si la celda cae dentro de alguna zona', () => {
      const zones = [{ name: 'Sala', cells: [{ rowStart: 2, rowEnd: 5, colStart: 1, colEnd: 3 }] }];
      expect(isCellInsideZones(zones, 3, 2)).toBe(true);
    });

    it('devuelve true en los bordes exactos de la zona', () => {
      const zones = [{ name: 'Sala', cells: [{ rowStart: 2, rowEnd: 5, colStart: 1, colEnd: 3 }] }];
      expect(isCellInsideZones(zones, 2, 1)).toBe(true);
      expect(isCellInsideZones(zones, 5, 3)).toBe(true);
    });

    it('devuelve false si la celda cae fuera de todas las zonas', () => {
      const zones = [{ name: 'Sala', cells: [{ rowStart: 2, rowEnd: 5, colStart: 1, colEnd: 3 }] }];
      expect(isCellInsideZones(zones, 0, 0)).toBe(false);
    });
  });

  describe('findZoneByName', () => {
    const zones = [
      { name: 'Coto de Caza de los Trasgos', cells: [{ rowStart: 20, rowEnd: 28, colStart: 0, colEnd: 9 }] },
      { name: 'Viejo Roble Resonante', cells: [{ rowStart: 20, rowEnd: 28, colStart: 9, colEnd: 17 }] },
    ];

    it('encuentra la zona por nombre exacto', () => {
      expect(findZoneByName(zones, 'Viejo Roble Resonante')).toBe(zones[1]);
    });

    it('ignora mayusculas/minusculas y espacios sobrantes', () => {
      expect(findZoneByName(zones, '  viejo roble resonante  ')).toBe(zones[1]);
    });

    it('devuelve undefined si ninguna zona coincide', () => {
      expect(findZoneByName(zones, 'Zona inventada')).toBeUndefined();
    });
  });

  describe('isCellInsideZone', () => {
    const zone = { name: 'Viejo Roble Resonante', cells: [{ rowStart: 20, rowEnd: 28, colStart: 9, colEnd: 17 }] };

    it('devuelve true si la celda cae dentro de la zona dada', () => {
      expect(isCellInsideZone(zone, 24, 12)).toBe(true);
    });

    it('devuelve true en los bordes exactos', () => {
      expect(isCellInsideZone(zone, 20, 9)).toBe(true);
      expect(isCellInsideZone(zone, 28, 17)).toBe(true);
    });

    it('devuelve false si la celda cae en el rango de otra zona (mismo rango de filas, columnas distintas)', () => {
      // Este es exactamente el bug real detectado: "Coto de Caza de los Trasgos" (cols 0-9)
      // y "Viejo Roble Resonante" (cols 9-17) comparten filas 20-28 y son faciles de confundir.
      expect(isCellInsideZone(zone, 24, 3)).toBe(false);
    });
  });
});
