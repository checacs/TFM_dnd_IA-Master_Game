import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DmEngineClient, DM_ENGINE_CLIENT, DmEngineChatMessage, DmEngineResult } from '../../domain/ports/dm-engine.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface SendMessageInput {
  gameId: string;
  messages: DmEngineChatMessage[];
}

@Injectable()
export class SendMessageUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DM_ENGINE_CLIENT) private readonly dmEngine: DmEngineClient,
  ) {}

  async execute(input: SendMessageInput): Promise<DmEngineResult> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const lastUserMsg = input.messages.filter((m) => m.role === 'user').pop();
    if (lastUserMsg) {
      game.appendNarrativeEntry({ role: 'user', content: lastUserMsg.content });
      // Se guarda ya (antes de llamar al dm-engine) para que el mensaje del
      // jugador quede registrado aunque el turno del DM falle.
      await this.games.save(game);
    }

    let result: DmEngineResult;
    try {
      result = await this.dmEngine.sendTurn(input.gameId, input.messages);
    } catch (error) {
      // dm-engine puede fallar por un cold-start de Render, un timeout o un
      // corte de red. Antes esto dejaba el turno del jugador sin ninguna
      // respuesta ni error visible: el mensaje del jugador quedaba guardado
      // (arriba) pero el chat se congelaba para siempre sin que apareciera
      // nada más. En vez de reventar el turno entero, se guarda un mensaje de
      // fallback legible para que el jugador sepa que puede reintentar.
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[SendMessageUseCase] dm-engine falló para la partida ${input.gameId}: ${reason}`);
      result = {
        narrative:
          'El DM-IA no ha podido responder ahora mismo (puede que el servicio esté arrancando tras estar inactivo, o haya un problema de conexión). Vuelve a intentar tu acción en unos segundos.',
        events: [],
      };
    }

    // dmEngine.sendTurn ejecuta tools MCP (set_battle_map, place_participant,
    // grant_xp...) que escriben directamente en el repositorio durante el turno.
    // Si aquí siguiéramos usando la copia de `game` leída arriba (de antes del
    // turno), guardarla ahora sobrescribiría esos cambios y el tablero/posición
    // recién aplicados desaparecerían justo después de terminar el turno — hay
    // que releer el estado fresco antes de anexar la narrativa y guardar.
    const freshGame = await this.games.findById(input.gameId);
    if (!freshGame) {
      throw new DomainError('Partida no encontrada');
    }

    freshGame.appendNarrativeEntry({ role: 'assistant', content: result.narrative });
    await this.games.save(freshGame);

    return result;
  }
}
