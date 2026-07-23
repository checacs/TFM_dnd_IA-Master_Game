import { Injectable } from '@nestjs/common';
import { DiceRoller } from '../../domain/ports/dice-roller.port';

// Espacios opcionales alrededor de 'd' y del modificador -- dnd5eapi.co
// devuelve algunos hechizos con espacios (ej. Magic Missile: "3d4 + 3"),
// aunque el mapper ya los normaliza en el punto de entrada (ver
// spell-mapper.ts). Se tolera aquí también como segunda red de seguridad,
// y se admite modificador negativo ('-'), no solo positivo.
const DICE_NOTATION = /^(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?$/i;

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
    const [, countStr, sidesStr, signStr, magnitudeStr] = match;
    const count = Number(countStr);
    const sides = Number(sidesStr);
    const magnitude = magnitudeStr ? Number(magnitudeStr) : 0;
    const modifier = signStr === '-' ? -magnitude : magnitude;

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
