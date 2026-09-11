/**
 * Genera el código corto que identifica públicamente a una partida nueva
 * (el que el host comparte con el resto de jugadores para que se unan, ver
 * CreateGameUseCase) — antes se usaba directamente el id largo interno
 * (UUID) y era incómodo de compartir/teclear a mano.
 */
export interface GameCodeGenerator {
  generate(): string;
}

export const GAME_CODE_GENERATOR = Symbol('GameCodeGenerator');
