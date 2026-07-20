import { Injectable, Inject } from '@nestjs/common';
import { MagicItemRepository, MAGIC_ITEM_REPOSITORY, MagicItemSearchCriteria } from '../../domain/ports/magic-item.repository.port';

export interface MagicItemSearchResult {
  id: string;
  name: string;
  rarity: string;
}

@Injectable()
export class SearchMagicItemsUseCase {
  constructor(@Inject(MAGIC_ITEM_REPOSITORY) private readonly items: MagicItemRepository) {}

  async execute(criteria: MagicItemSearchCriteria): Promise<MagicItemSearchResult[]> {
    const found = await this.items.search(criteria);
    return found.map((item) => {
      const snapshot = item.toSnapshot();
      return { id: item.id, name: snapshot.name, rarity: snapshot.rarity };
    });
  }
}
