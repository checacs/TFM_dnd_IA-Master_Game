import { RulesReference, RulesReferenceProps } from '../../domain/entities/rules-reference.entity';

export type RulesReferenceDocumentShape = RulesReferenceProps & { _id: string };

export const RulesReferenceMapper = {
  toPersistence(ref: RulesReference): RulesReferenceDocumentShape {
    return { _id: ref.id, ...ref.toSnapshot() };
  },

  toDomain(doc: RulesReferenceDocumentShape): RulesReference {
    const { _id, ...props } = doc;
    return RulesReference.create(props, _id);
  },
};
