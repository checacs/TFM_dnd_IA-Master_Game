import { BattleMap, BattleMapProps } from '../../../../domain/entities/battle-map.entity';

export type MapDocumentShape = BattleMapProps & { _id: string };

export const MapMapper = {
  toPersistence(map: BattleMap): MapDocumentShape {
    return { _id: map.id, ...map.toSnapshot() };
  },

  toDomain(doc: MapDocumentShape): BattleMap {
    const { _id, ...props } = doc;
    return BattleMap.create(props, _id);
  },
};
