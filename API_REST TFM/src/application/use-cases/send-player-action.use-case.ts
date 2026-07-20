import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DmEngineChatMessage, DmEngineResult } from '../../domain/ports/dm-engine.port';
import { DomainError } from '../../domain/errors/domain-error';
import { SendMessageUseCase } from './send-message.use-case';

export interface SendPlayerActionInput {
  gameId: string;
  requestingUserId: string;
  characterId: string;
  content: string;
}

/**
 * Equivalente a "responder al chat del DM" desde el móvil, con las reglas
 * de gating del nuevo modelo de turnos:
 * - En combate: solo puede escribir quien tiene el turno reclamado
 *   (Game.claimTurn) — y al terminar, se libera automáticamente
 *   (Game.releaseTurnAfterAction), sin que el jugador tenga que hacer nada más.
 * - Fuera de combate: solo puede escribir el capitán (Game.captainUserId) —
 *   evita que varios jugadores narren a la vez fuera de pelea.
 * Reconstruye el historial desde narrativeLog y delega el turno del DM en
 * SendMessageUseCase (misma lógica que ya usa ui-web), no la duplica.
 */
@Injectable()
export class SendPlayerActionUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    private readonly sendMessage: SendMessageUseCase,
  ) {}

  async execute(input: SendPlayerActionInput): Promise<DmEngineResult> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const snapshot = game.toSnapshot();
    const owns = snapshot.players.some(
      (p) => p.userId === input.requestingUserId && p.characterId === input.characterId,
    );
    if (!owns) {
      throw new DomainError('Ese personaje no te pertenece en esta partida');
    }

    if (snapshot.activeEncounter) {
      if (snapshot.activeEncounter.turnClaim !== input.characterId) {
        throw new DomainError('No tienes el turno reclamado en este combate');
      }
    } else if (snapshot.captainUserId !== input.requestingUserId) {
      throw new DomainError('Solo el capitán puede hablar con el DM fuera de combate');
    }

    const history: DmEngineChatMessage[] = snapshot.narrativeLog.map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));
    history.push({ role: 'user', content: input.content });

    const result = await this.sendMessage.execute({ gameId: input.gameId, messages: history });

    if (snapshot.activeEncounter) {
      // Releer el estado fresco: el turno del DM (SendMessageUseCase) pudo
      // haber ejecutado tools MCP que mutaron la partida (daño, condiciones,
      // fin del combate...) — no partir de la copia `game` anterior al turno.
      const freshGame = await this.games.findById(input.gameId);
      if (freshGame && freshGame.toSnapshot().activeEncounter) {
        freshGame.releaseTurnAfterAction(input.characterId);
        await this.games.save(freshGame);
      }
    }

    return result;
  }
}
