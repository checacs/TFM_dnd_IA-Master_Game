import { Injectable } from '@nestjs/common';
import { MapRepository, MapSearchCriteria } from '../../../domain/ports/map.repository.port';
import { BattleMap } from '../../../domain/entities/battle-map.entity';

@Injectable()
export class InMemoryMapRepository implements MapRepository {
  private readonly maps = new Map<string, BattleMap>();

  async findById(id: string): Promise<BattleMap | null> {
    return this.maps.get(id) ?? null;
  }

  async search(criteria: MapSearchCriteria): Promise<BattleMap[]> {
    return Array.from(this.maps.values()).filter((map) => {
      const snapshot = map.toSnapshot();
      return !criteria.tags?.length || criteria.tags.some((tag) => snapshot.tags.includes(tag));
    });
  }

  async save(map: BattleMap): Promise<void> {
    this.maps.set(map.id, map);
  }
}
