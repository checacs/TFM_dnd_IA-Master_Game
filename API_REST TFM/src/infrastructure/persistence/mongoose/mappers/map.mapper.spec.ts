import { BattleMap } from '../../../../domain/entities/battle-map.entity';
import { MapMapper } from './map.mapper';

describe('MapMapper', () => {
  it('convierte de dominio a persistencia y de vuelta sin perder datos', () => {
    const map = BattleMap.create({
      name: 'Taberna del jabalí',
      description: 'Sala principal con mesas y chimenea.',
      tags: ['interior', 'taberna'],
      rows: 10,
      cols: 14,
      imageUrl: '/maps/taberna-jabali.png',
    });

    const persisted = MapMapper.toPersistence(map);
    const recovered = MapMapper.toDomain(persisted);

    expect(recovered.id).toBe(map.id);
    expect(recovered.toSnapshot()).toEqual(map.toSnapshot());
  });

  it('conserva las conexiones y closedExits, y rellena valores por defecto en documentos antiguos', () => {
    const map = BattleMap.create({
      name: 'Sótano', description: 'Sótano.', tags: ['sotano'], rows: 30, cols: 20, imageUrl: '/maps/s.png',
      connections: [{ mapId: 'cueva-rio', via: 'la trampilla' }], closedExits: true,
    }, 'sotanoTaberna');
    expect(MapMapper.toDomain(MapMapper.toPersistence(map)).toSnapshot()).toEqual(map.toSnapshot());

    // Documento guardado antes de existir estos campos.
    const legacy = MapMapper.toDomain({
      _id: 'viejo', name: 'Viejo', description: '', tags: [], rows: 5, cols: 5, imageUrl: '/maps/v.png', zones: [],
    } as unknown as Parameters<typeof MapMapper.toDomain>[0]);
    expect(legacy.toSnapshot().connections).toEqual([]);
    expect(legacy.toSnapshot().closedExits).toBe(false);
  });
});

