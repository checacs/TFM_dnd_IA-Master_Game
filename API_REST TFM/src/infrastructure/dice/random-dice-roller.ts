import { Injectable } from '@nestjs/common';
import { DiceRoller } from '../../domain/ports/dice-roller.port';
import { DomainError } from '../../domain/errors/domain-error';

// Espacios opcionales alrededor de 'd' y del modificador -- dnd5eapi.co
// devuelve algunos hechizos con espacios (ej. Magic Missile: "3d4 + 3"),
// aunque el mapper ya los normaliza en el punto de entrada (ver
// spell-mapper.ts). Se tolera aquí también como segunda red de seguridad,
// y se admite modificador negativo ('-'), no solo positivo.
const DICE_NOTATION = /^(\d{1,12})\s*d\s*(\d{1,12})\s*(?:([+-])\s*(\d{1,12}))?$/i;

/**
 * Límites de cordura: sin ellos, "999999999999d6" (vía la tool MCP roll_dice,
 * resolve_attack o la tirada del jugador) bloqueaba el event loop de toda la
 * API en un bucle síncrono de ~10^12 iteraciones. Ninguna tirada de D&D 5e
 * niveles 1-5 se acerca a estos topes.
 */
export const MAX_DICE_COUNT = 100;
export const MAX_DIE_SIDES = 1000;
export const MAX_DICE_MODIFIER = 1000;

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
      throw new DomainError(`Notación de dado inválida: "${notation}"`);
    }
    const [, countStr, sidesStr, signStr, magnitudeStr] = match;
    const count = Number(countStr);
    const sides = Number(sidesStr);
    const magnitude = magnitudeStr ? Number(magnitudeStr) : 0;
    const modifier = signStr === '-' ? -magnitude : magnitude;
    if (count < 1 || count > MAX_DICE_COUNT || sides < 1 || sides > MAX_DIE_SIDES || magnitude > MAX_DICE_MODIFIER) {
      throw new DomainError(
        `Notación de dado fuera de rango: "${notation}" (máximo ${MAX_DICE_COUNT} dados de hasta ${MAX_DIE_SIDES} caras, modificador ±${MAX_DICE_MODIFIER})`,
      );
    }

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
