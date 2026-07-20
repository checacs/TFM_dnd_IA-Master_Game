import { DiceRoller } from '../domain/ports/dice-roller.port';

/**
 * Tira 1d20 aplicando ventaja/desventaja. Regla real de 5e: si se dan ambas
 * a la vez, se cancelan entre sí y es una tirada normal — no "doble cancelación".
 */
export function rollD20WithAdvantage(diceRoller: DiceRoller, hasAdvantage: boolean, hasDisadvantage: boolean): number {
  if (hasAdvantage === hasDisadvantage) {
    return diceRoller.rollD20();
  }
  const first = diceRoller.rollD20();
  const second = diceRoller.rollD20();
  return hasAdvantage ? Math.max(first, second) : Math.min(first, second);
}
