import { Injectable, Inject } from '@nestjs/common';
import { DiceRoller, DICE_ROLLER } from '../../domain/ports/dice-roller.port';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';

export interface RollDiceInput {
  gameId: string;
  notation: string;
  /** Para qué es la tirada (ej. "Intento de fuga del Dust Mephit", "Prueba de Sigilo") -- se muestra tal cual en el chat. */
  reason: string;
}

export interface RollDiceResult {
  notation: string;
  result: number;
}

/**
 * Tirada ad-hoc solicitada por el DM-IA fuera de un ataque estructurado
 * (ej. una tirada de salvación narrativa, un intento de fuga de un enemigo,
 * una prueba de habilidad). Sigue pasando por el puerto DiceRoller — nunca
 * se asume un resultado.
 *
 * Se detectó en partida real que estas tiradas eran completamente invisibles
 * para el jugador: a diferencia de resolve_attack (que ya deja un mensaje
 * garantizado con el desglose del ataque) o del botón "Tirar Dados" del móvil
 * (PlayerRollUseCase), roll_dice solo devolvía el resultado al propio DM-IA,
 * nunca al chat -- un enemigo podía "tirar para huir" y el jugador solo veía
 * el desenlace narrado, sin ningún rastro de que hubiera habido una tirada de
 * por medio ni de qué la motivaba. Ahora, igual que start-combat/end-combat/
 * grant-xp, se deja un mensaje de sistema garantizado en el narrativeLog con
 * el motivo (reason, obligatorio) y el resultado real.
 */
@Injectable()
export class RollDiceUseCase {
  constructor(
    @Inject(DICE_ROLLER) private readonly diceRoller: DiceRoller,
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
  ) {}

  async execute(input: RollDiceInput): Promise<RollDiceResult> {
    const result = this.diceRoller.roll(input.notation);

    const game = await this.games.findById(input.gameId);
    if (game) {
      game.appendNarrativeEntry({
        role: 'assistant',
        content: `🎲 *(${input.reason})* — ${input.notation}: **${result}**`,
      });
      await this.games.save(game);
    }
    // Si la partida no aparece, no se pierde el resultado ya calculado (el
    // DM-IA lo necesita para seguir narrando de verdad): solo se pierde el
    // aviso en el chat, nunca la propia tirada.

    return { notation: input.notation, result };
  }
}
