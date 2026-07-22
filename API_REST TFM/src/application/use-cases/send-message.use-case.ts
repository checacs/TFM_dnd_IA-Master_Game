import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DmEngineClient, DM_ENGINE_CLIENT, DmEngineChatMessage, DmEngineResult } from '../../domain/ports/dm-engine.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface SendMessageInput {
  gameId: string;
  messages: DmEngineChatMessage[];
}

/**
 * HttpDmEngineClient ya reintenta UNA vez internamente ante fallos "de
 * arranque" (cold start / timeout) o un 503 explícito (NoMutationYetError:
 * dm-engine falló antes de llamar a ninguna tool ese turno). Aun así, se
 * siguió viendo el mensaje de fallback en el primer turno de una partida
 * nueva: un cold start "doble" (esta misma API y dm-engine dormidos a la
 * vez) puede tardar más que ese presupuesto interno. En vez de obligar al
 * jugador a darse cuenta del error y reescribir su acción a mano, esta capa
 * reintenta el turno COMPLETO (mismo gameId, mismos messages -- el jugador
 * no repite nada) unas veces más antes de rendirse y guardar el mensaje de
 * fallback. No hay timeout en el cliente HTTP del móvil/ui-web para esta
 * llamada, así que alargar la espera aquí es seguro: el jugador solo ve el
 * indicador de "pensando" un poco más, en vez de un error que le obliga a
 * actuar.
 */
const MAX_SEND_ATTEMPTS = 3;
const SEND_RETRY_DELAY_MS = 5_000;

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

    let result: DmEngineResult | null = null;
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      try {
        result = await this.dmEngine.sendTurn(input.gameId, input.messages);
        break;
      } catch (error) {
        // dm-engine puede fallar por un cold-start de Render, un timeout o un
        // corte de red. Antes esto dejaba el turno del jugador sin ninguna
        // respuesta ni error visible: el mensaje del jugador quedaba guardado
        // (arriba) pero el chat se congelaba para siempre sin que apareciera
        // nada más.
        const reason = error instanceof Error ? error.message : String(error);
        const isLastAttempt = attempt === MAX_SEND_ATTEMPTS;
        console.error(
          `[SendMessageUseCase] dm-engine falló (intento ${attempt}/${MAX_SEND_ATTEMPTS}) para la partida ` +
            `${input.gameId}: ${reason}`,
        );
        if (!isLastAttempt) {
          await sleep(SEND_RETRY_DELAY_MS);
        }
      }
    }

    if (!result) {
      // Se agotaron todos los reintentos: en vez de reventar el turno entero,
      // se guarda un mensaje de fallback legible para que el jugador sepa que
      // puede reintentar.
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
