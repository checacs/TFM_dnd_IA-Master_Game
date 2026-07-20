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
});
