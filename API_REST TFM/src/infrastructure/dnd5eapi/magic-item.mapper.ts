import { MagicItem, MagicItemProps } from '../../domain/entities/magic-item.entity';

export type MagicItemDocumentShape = MagicItemProps & { _id: string };

export const MagicItemMapper = {
  toPersistence(item: MagicItem): MagicItemDocumentShape {
    return { _id: item.id, ...item.toSnapshot() };
  },

  toDomain(doc: MagicItemDocumentShape): MagicItem {
    const { _id, ...props } = doc;
    return MagicItem.create(props, _id);
  },
};
