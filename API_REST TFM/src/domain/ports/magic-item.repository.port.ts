import { MagicItem } from '../entities/magic-item.entity';

export interface MagicItemSearchCriteria {
  rarity?: string;
}

export interface MagicItemRepository {
  findById(id: string): Promise<MagicItem | null>;
  search(criteria: MagicItemSearchCriteria): Promise<MagicItem[]>;
}

export const MAGIC_ITEM_REPOSITORY = Symbol('MagicItemRepository');
