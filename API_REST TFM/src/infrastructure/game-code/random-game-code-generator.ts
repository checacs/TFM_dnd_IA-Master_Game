import { GameCodeGenerator } from '../../domain/ports/game-code-generator.port';

// Alfabeto sin 0/O, 1/I/L -- un jugador va a teclear este código a mano en
// el móvil/tablet para unirse a la partida, así que se evitan los
// caracteres que se confunden fácilmente entre sí.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 10;

export class RandomGameCodeGenerator implements GameCodeGenerator {
  generate(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return code;
  }
}
