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
 *   (Game.claimTurn). El turno YA NO se libera automáticamente aquí al
 *   terminar el intercambio — antes se llamaba a
 *   Game.releaseTurnAfterAction incondicionalmente tras cada mensaje, lo
 *   que en partidas de 1 jugador bloqueaba para siempre al único jugador en
 *   cuanto el DM respondía con una simple pregunta aclaratoria ("¿la
 *   empuñas a una o dos manos?") sin haber resuelto nada todavía: el
 *   candado quedaba liberado, actedThisRound ya lo incluía y roundPhase
 *   pasaba a 'enemigos' con un único jugador vivo, sin ninguna forma de
 *   volver a reclamar turno. Ahora es el DM-IA quien decide, vía la tool
 *   MCP end_player_turn (ver EndPlayerTurnUseCase), cuándo ha resuelto de
 *   verdad la acción del jugador — el turnClaim se mantiene entre mensajes
 *   sucesivos del mismo jugador hasta entonces.
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

    // Ya no se libera aquí el turno tras el intercambio: eso ahora lo decide
    // el propio DM-IA llamando a la tool end_player_turn cuando haya resuelto
    // de verdad la acción (ver EndPlayerTurnUseCase y el comentario de clase
    // de más arriba). SendMessageUseCase puede seguir ejecutando tools MCP
    // que muten la partida (daño, condiciones, colocación...) con normalidad;
    // simplemente ninguna de ellas es "cerrar el turno de este jugador" salvo
    // que sea end_player_turn.
    return this.sendMessage.execute({ gameId: input.gameId, messages: history });
  }
}
