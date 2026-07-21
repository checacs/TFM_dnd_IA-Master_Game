import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DiceRoller, DICE_ROLLER } from '../../domain/ports/dice-roller.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface PlayerRollInput {
  gameId: string;
  requestingUserId: string;
  characterId: string;
  notation?: string;
}

export interface PlayerRollResult {
  notation: string;
  result: number;
}

/**
 * Botón "Tirar Dados" del móvil. A diferencia de RollDiceUseCase (que usa
 * el DM-IA para tiradas ad-hoc y NO toca la partida), esta tirada la pide un
 * jugador y se añade al narrativeLog como un mensaje más -- así aparece en
 * el chat de ui-web (que renderiza game.narrativeLog) sin que nadie tenga
 * que ir a mirar el móvil para saber qué ha salido.
 */
@Injectable()
export class PlayerRollUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DICE_ROLLER) private readonly diceRoller: DiceRoller,
  ) {}

  async execute(input: PlayerRollInput): Promise<PlayerRollResult> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const player = game
      .toSnapshot()
      .players.find((p) => p.characterId === input.characterId);
    if (!player || player.userId !== input.requestingUserId) {
      throw new DomainError('Ese personaje no te pertenece en esta partida');
    }

    const notation = input.notation ?? '1d20';
    const result = this.diceRoller.roll(notation);

    game.appendNarrativeEntry({
      role: 'user',
      // El nombre en negrita (**Nombre**) para distinguir de un vistazo quién
      // tiró qué -- ui-web/ChatPanel ya sabe parsear **negrita** Markdown.
      content: `🎲 **${player.name}** tira ${notation}: **${result}**`,
    });
    await this.games.save(game);

    return { notation, result };
  }
}
