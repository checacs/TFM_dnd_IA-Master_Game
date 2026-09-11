import { Game, GameProps } from '../../../../domain/entities/game.entity';

export type GameDocumentShape = GameProps & { _id: string };

/**
 * Traduce entre la entidad de dominio Game y su forma en Mongo. Usa
 * Game.reconstitute (no Game.create) porque una partida recuperada de la
 * base de datos ya puede tener jugadores y un combate activo — reconstitute
 * no revalida las reglas de creación, solo rehidrata el estado tal cual está.
 */
export const GameMapper = {
  toPersistence(game: Game): GameDocumentShape {
    return { _id: game.id, ...game.toSnapshot() };
  },

  toDomain(doc: GameDocumentShape): Game {
    const { _id, ...props } = doc;
    return Game.reconstitute(_id, props);
  },
};
