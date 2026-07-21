import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DiceRoller, DICE_ROLLER } from '../../domain/ports/dice-roller.port';
import { DmEngineChatMessage } from '../../domain/ports/dm-engine.port';
import { DomainError } from '../../domain/errors/domain-error';
import { SendMessageUseCase } from './send-message.use-case';

export interface PlayerRollInput {
  gameId: string;
  requestingUserId: string;
  characterId: string;
  notation?: string;
}

export interface PlayerRollResult {
  notation: string;
  result: number;
  narrative: string;
  events: unknown[];
}

/**
 * Botón "Tirar Dados" del móvil. A diferencia de RollDiceUseCase (que usa
 * el DM-IA para tiradas ad-hoc y NO toca la partida), esta tirada la pide un
 * jugador y se añade al narrativeLog como un mensaje más -- así aparece en
 * el chat de ui-web (que renderiza game.narrativeLog) sin que nadie tenga
 * que ir a mirar el móvil para saber qué ha salido.
 *
 * Rediseño "no que tire por mi la IA" (ver ResolveAttackUseCase / playerD20
 * en resolve-attack.use-case.ts): antes, tras describir su ataque en texto,
 * el DM lo resolvía con un d20 interno invisible sin que el jugador llegara
 * a pulsar ningún botón -- se perdía la sensación de agencia. Ahora el flujo
 * es de dos turnos: el jugador describe la acción, el DM responde "¡Tira los
 * dados!" sin resolver nada todavía, y esta tirada es la que de verdad cuenta.
 * Por eso esta tirada YA NO se limita a anotar el número en el chat: delega
 * en SendMessageUseCase (misma lógica que SendPlayerActionUseCase) para
 * disparar inmediatamente el siguiente turno del DM-IA con ese resultado ya
 * incluido en el historial -- así puede leerlo y llamar a
 * resolve_attack(playerD20=N) sin que el jugador tenga que escribir nada más
 * tras pulsar el botón.
 *
 * Al disparar de verdad un turno del DM (no solo anotar un mensaje), aplica
 * las mismas reglas de gating que SendPlayerActionUseCase: en combate, solo
 * quien tiene el turno reclamado puede tirar; fuera de combate, solo el
 * capitán del grupo -- si no, cualquier jugador podría forzar el turno del
 * DM fuera de su turno con solo pulsar "Tirar Dados".
 */
@Injectable()
export class PlayerRollUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DICE_ROLLER) private readonly diceRoller: DiceRoller,
    private readonly sendMessage: SendMessageUseCase,
  ) {}

  async execute(input: PlayerRollInput): Promise<PlayerRollResult> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const snapshot = game.toSnapshot();
    const player = snapshot.players.find((p) => p.characterId === input.characterId);
    if (!player || player.userId !== input.requestingUserId) {
      throw new DomainError('Ese personaje no te pertenece en esta partida');
    }

    if (snapshot.activeEncounter) {
      if (snapshot.activeEncounter.turnClaim !== input.characterId) {
        throw new DomainError('No tienes el turno reclamado en este combate');
      }
    } else if (snapshot.captainUserId !== input.requestingUserId) {
      throw new DomainError('Solo el capitán puede tirar dados fuera de combate');
    }

    const notation = input.notation ?? '1d20';
    const result = this.diceRoller.roll(notation);
    // Nombre en negrita Markdown (**Nombre**) para distinguir de un vistazo
    // quién tiró qué en el chat -- ui-web/ChatPanel ya sabe parsear negrita.
    const rollContent = `🎲 **${player.name}** tira ${notation}: **${result}**`;

    // No se guarda aquí directamente: se construye el historial completo y se
    // delega en SendMessageUseCase, que es quien persiste el mensaje de la
    // tirada (como último 'user') y el turno del DM-IA -- igual que hace
    // SendPlayerActionUseCase con el texto libre. Duplicar ese guardado aquí
    // dejaría el mensaje de la tirada anotado dos veces en el chat.
    const history: DmEngineChatMessage[] = snapshot.narrativeLog.map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));
    history.push({ role: 'user', content: rollContent });

    const dmResult = await this.sendMessage.execute({ gameId: input.gameId, messages: history });

    return { notation, result, narrative: dmResult.narrative, events: dmResult.events };
  }
}
