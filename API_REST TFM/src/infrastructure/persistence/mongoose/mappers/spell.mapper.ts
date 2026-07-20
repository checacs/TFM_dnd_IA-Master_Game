import { Spell, SpellProps } from '../../../../domain/entities/spell.entity';

export type SpellDocumentShape = SpellProps & { _id: string };

export const SpellMapper = {
  toPersistence(spell: Spell): SpellDocumentShape {
    return { _id: spell.id, ...spell.toSnapshot() };
  },

  toDomain(doc: SpellDocumentShape): Spell {
    const { _id, ...props } = doc;
    return Spell.create(props, _id);
  },
};
