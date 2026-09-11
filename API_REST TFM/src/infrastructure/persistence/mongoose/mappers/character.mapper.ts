import { Character, CharacterProps } from '../../../../domain/entities/character.entity';

export type CharacterDocumentShape = CharacterProps & { _id: string };

/**
 * Traduce entre la entidad de dominio Character y la forma que tiene en Mongo.
 * El dominio nunca ve un ObjectId directamente — por eso el _id de Mongo se
 * fija aquí al mismo string que ya usa Character.id (ver character.schema.ts).
 */
export const CharacterMapper = {
  toPersistence(character: Character): CharacterDocumentShape {
    return { _id: character.id, ...character.toSnapshot() };
  },

  toDomain(doc: CharacterDocumentShape): Character {
    const { _id, ...props } = doc;
    return Character.create(props, _id);
  },
};
