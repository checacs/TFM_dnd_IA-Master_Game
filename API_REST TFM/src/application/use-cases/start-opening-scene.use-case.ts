import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DmEngineResult } from '../../domain/ports/dm-engine.port';
import { DomainError } from '../../domain/errors/domain-error';
import { SendMessageUseCase } from './send-message.use-case';

export interface StartOpeningSceneInput {
  gameId: string;
  requestingUserId: string;
}

/** Mensaje fijo con el que se pide al DM-IA la escena inicial (antes lo mandaba ui-web tal cual). */
export const OPENING_SCENE_PROMPT = 'La partida ha comenzado. Describe la escena inicial.';

/**
 * Arranque de la escena inicial de una partida recién lanzada (POST
 * /games/:id/message, lo dispara ui-web al entrar en una partida en curso sin
 * historia todavía).
 *
 * Antes ese endpoint reenviaba a dm-engine un historial arbitrario enviado
 * por el cliente, sin comprobar quién llamaba: cualquier usuario logueado
 * podía hablar con el DM de cualquier partida (saltándose las reglas de
 * capitán/turno y el estado 'finalizada') e incluso colar turnos 'assistant'
 * inventados para manipular al DM. Ahora el endpoint solo sirve para su único
 * uso legítimo, y el mensaje lo construye el servidor.
 */
@Injectable()
export class StartOpeningSceneUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    private readonly sendMessage: SendMessageUseCase,
  ) {}

  async execute(input: StartOpeningSceneInput): Promise<DmEngineResult> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }
    const snapshot = game.toSnapshot();

    const isHost = snapshot.hostUserId === input.requestingUserId;
    const isPlayer = snapshot.players.some((p) => p.userId === input.requestingUserId);
    if (!isHost && !isPlayer) {
      throw new DomainError('No participas en esta partida');
    }
    if (snapshot.status !== 'en_curso') {
      throw new DomainError('La partida no está en curso');
    }
    if (snapshot.narrativeLog.length > 0) {
      throw new DomainError('La escena inicial de esta partida ya se ha narrado');
    }

    // Si dos pantallas de ui-web lo disparan a la vez, la segunda la rechaza
    // Game.startDmTurn (dentro de SendMessageUseCase) antes de anotar nada.
    return this.sendMessage.execute({
      gameId: input.gameId,
      messages: [{ role: 'user', content: OPENING_SCENE_PROMPT }],
    });
  }
}
