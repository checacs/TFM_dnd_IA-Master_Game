import { Injectable } from '@nestjs/common';
import { Shuffler } from '../../domain/ports/shuffler.port';

/**
 * Implementación real del puerto Shuffler (mismo patrón que RandomDiceRoller):
 * es la única pieza de este flujo que usa Math.random — el dominio y la
 * aplicación nunca generan aleatoriedad por su cuenta. Fisher-Yates estándar,
 * no muta el array de entrada.
 */
@Injectable()
export class RandomShuffler implements Shuffler {
  shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
