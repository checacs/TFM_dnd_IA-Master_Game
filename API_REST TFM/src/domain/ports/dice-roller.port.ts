export interface DiceRoller {
  rollD20(): number;
  /** Notación de dado, ej. "1d6+2" */
  roll(notation: string): number;
}

export const DICE_ROLLER = Symbol('DiceRoller');
