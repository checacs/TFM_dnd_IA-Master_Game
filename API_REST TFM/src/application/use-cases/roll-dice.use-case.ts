import { Injectable, Inject } from '@nestjs/common';
import { DiceRoller, DICE_ROLLER } from '../../domain/ports/dice-roller.port';

export interface RollDiceInput {
  notation: string;
}

export interface RollDiceResult {
  notation: string;
  result: number;
}

/**
 * Tirada ad-hoc solicitada por el DM-IA fuera de un ataque estructurado
 * (ej. una tirada de salvación narrativa). Sigue pasando por el puerto
 * DiceRoller — nunca se asume un resultado.
 */
@Injectable()
export class RollDiceUseCase {
  constructor(@Inject(DICE_ROLLER) private readonly diceRoller: DiceRoller) {}

  execute(input: RollDiceInput): RollDiceResult {
    return { notation: input.notation, result: this.diceRoller.roll(input.notation) };
  }
}
