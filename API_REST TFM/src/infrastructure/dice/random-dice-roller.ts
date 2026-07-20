import { Injectable } from '@nestjs/common';
import { DiceRoller } from '../../domain/ports/dice-roller.port';

const DICE_NOTATION = /^(\d+)d(\d+)(?:\+(\d+))?$/;

/**
 * Implementación real del puerto DiceRoller (docs/03-arquitectura-clean-api-nestjs.md).
 * Es la única pieza de todo el proyecto que usa Math.random — el dominio y la
 * aplicación nunca generan aleatoriedad por su cuenta.
 */
@Injectable()
export class RandomDiceRoller implements DiceRoller {
  rollD20(): number {
    return this.rollDie(20);
  }

  roll(notation: string): number {
    const match = DICE_NOTATION.exec(notation.trim());
    if (!match) {
      throw new Error(`Notación de dado inválida: "${notation}"`);
    }
    const [, countStr, sidesStr, modifierStr] = match;
    const count = Number(countStr);
    const sides = Number(sidesStr);
    const modifier = modifierStr ? Number(modifierStr) : 0;

    let total = 0;
    for (let i = 0; i < count; i++) {
      total += this.rollDie(sides);
    }
    return total + modifier;
  }

  private rollDie(sides: number): number {
    return Math.floor(Math.random() * sides) + 1;
  }
}
