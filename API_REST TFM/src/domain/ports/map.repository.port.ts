import { BattleMap } from '../entities/battle-map.entity';

export interface MapSearchCriteria {
  tags?: string[];
}

export interface MapRepository {
  findById(id: string): Promise<BattleMap | null>;
  search(criteria: MapSearchCriteria): Promise<BattleMap[]>;
}

export const MAP_REPOSITORY = Symbol('MapRepository');
