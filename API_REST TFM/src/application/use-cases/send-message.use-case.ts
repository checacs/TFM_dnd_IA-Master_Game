import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DmEngineClient, DM_ENGINE_CLIENT, DmEngineChatMessage, DmEngineResult, DmEngineRespondedError } from '../../domain/ports/dm-engine.port';
import { DomainError } from '../../domain/errors/domain-error';
import { withGameLock } from '../../domain/services/game-lock';

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

/**
 * Ventana de historial que se manda a dm-engine en cada turno. Antes se
 * enviaba el narrativeLog ENTERO: dm-engine acepta cuerpos JSON acotados, así
 * que en partidas largas /turn acababa respondiendo 413 en todos los turnos
 * (y el mensaje de fallback que se guardaba agrandaba aún más el log). El
 * estado real de la partida no depende de este historial -- el DM-IA lo lee
 * con get_game_state -- así que basta con el contexto narrativo reciente.
 */
export const MAX_DM_HISTORY_MESSAGES = 60;

@Injectable()
export class SendMessageUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DM_ENGINE_CLIENT) private readonly dmEngine: DmEngineClient,
  ) {}

  /**
   * CANDADOS: este método NUNCA debe envolverse entero en withGameLock (ni
   * aquí ni en el controller). Se detectó en producción un deadlock circular:
   * el controller envolvía todo execute() -- turno del DM incluido -- en
   * withGameLock(gameId), y las tools MCP que ese mismo turno invoca
   * (set_battle_map, place_participant, resolve_attack...) también piden ese
   * MISMO candado en mcp.server.ts. La tool quedaba encolada detrás del turno
   * que la estaba esperando, y solo el timeout de 15s del cliente MCP rompía
   * el círculo: "set_battle_map: Tiempo de espera agotado (15000ms)" tres
   * veces seguidas en un turno real, +45s de espera, el mapa apareciendo
   * tarde (las llamadas encoladas se ejecutaban al soltarse el candado, ya
   * acabado el turno) y el DM narrando escenas inventadas al creer que el
   * sistema de mapas estaba roto. En su lugar, el candado se coge SOLO en
   * las dos secciones críticas de lectura-modificación-escritura de este use
   * case (guardar el mensaje del jugador antes del turno, y guardar la
   * narrativa después), dejando el turno del DM fuera: las tools MCP ya se
   * serializan individualmente entre sí y contra los endpoints REST
   * (claim-turn, etc.) con sus propios withGameLock. Dos turnos simultáneos
   * de la misma partida se rechazan en Game.startDmTurn (dentro de la primera
   * sección crítica), antes de anotar nada ni llamar a dm-engine.
   */
  async execute(input: SendMessageInput): Promise<DmEngineResult> {
    await withGameLock(input.gameId, async () => {
      const game = await this.games.findById(input.gameId);
      if (!game) {
        throw new DomainError('Partida no encontrada');
      }

      // Primero startDmTurn (puede lanzar si ya hay un turno en curso): así un
      // turno rechazado no deja su mensaje anotado en el chat.
      game.startDmTurn();
      const lastUserMsg = input.messages.filter((m) => m.role === 'user').pop();
      if (lastUserMsg) {
        game.appendNarrativeEntry({ role: 'user', content: lastUserMsg.content });
      }
      // Señala el arranque del turno (Game.startDmTurn) ANTES de llamar a
      // dm-engine, para que ui-web -- que ya no dispara ella misma las
      // acciones de partida (llegan del móvil vía SendPlayerActionUseCase /
      // PlayerRollUseCase, que delegan aquí) -- pueda enterarse sondeando
      // GET /games/:id y mostrar el overlay "el Master está pensando"
      // mientras dura la respuesta (20-40s) -- ver la llamada a startDmTurn de arriba.
      // Se guarda ya (antes de llamar al dm-engine) para que el mensaje del
      // jugador y el flag de turno en marcha queden registrados aunque el
      // turno del DM falle.
      await this.games.save(game);
    });

    const recentMessages = recentHistoryWindow(input.messages);
    let result: DmEngineResult | null = null;
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      try {
        result = await this.dmEngine.sendTurn(input.gameId, recentMessages);
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
        // Si dm-engine SÍ procesó el turno antes de fallar
        // (DmEngineRespondedError: respondió con un 4xx/5xx real, no un fallo
        // de conexión), pudo haber mutado la partida (mapa aplicado, combate
        // iniciado...) -- reintentar reenvía el turno ENTERO y cada reintento
        // ejecuta otro turno completo del LLM sobre esas mutaciones,
        // duplicando escenas y combates (visto en producción). Rendirse ya y
        // pasar al mensaje de fallback.
        if (error instanceof DmEngineRespondedError) {
          break;
        }
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
    // que releer el estado fresco antes de anexar la narrativa y guardar. La
    // relectura+guardado van dentro de withGameLock para que una mutación
    // concurrente que siga en vuelo al terminar el turno (ej. un claim-turn
    // del móvil serializado con su propio candado) no sea pisada por este
    // save ni al revés (lost update) -- ver el comentario de candados arriba.
    const finalResult = result;
    try {
      return await withGameLock(input.gameId, async () => {
        const freshGame = await this.games.findById(input.gameId);
        if (!freshGame) {
          throw new DomainError('Partida no encontrada');
        }

        freshGame.appendNarrativeEntry({ role: 'assistant', content: finalResult.narrative });
        // Cierra el turno señalado al principio -- siempre, tanto si dm-engine
        // respondió con éxito como si se agotaron los reintentos y se guardó el
        // mensaje de fallback. Sin esto, un fallo dejaría el overlay de
        // ui-web "pensando" colgado para siempre.
        freshGame.endDmTurn();
        await this.games.save(freshGame);

        return finalResult;
      });
    } catch (error) {
      // Si el guardado final falla, al menos se intenta cerrar el turno: ahora
      // dmTurnInProgress también BLOQUEA nuevas acciones (Game.startDmTurn), no
      // solo pinta el overlay, así que no puede quedarse a true.
      await this.closeDmTurnBestEffort(input.gameId);
      throw error;
    }
  }

  private async closeDmTurnBestEffort(gameId: string): Promise<void> {
    try {
      await withGameLock(gameId, async () => {
        const game = await this.games.findById(gameId);
        if (game) {
          game.endDmTurn();
          await this.games.save(game);
        }
      });
    } catch (error) {
      console.error(`[SendMessageUseCase] no se pudo cerrar el turno del DM de la partida ${gameId}:`, error);
    }
  }
}

/**
 * Últimos MAX_DM_HISTORY_MESSAGES mensajes, sin empezar nunca por uno del DM:
 * algunos modelos compatibles con OpenAI rechazan un historial cuyo primer
 * mensaje (tras el system) es del asistente.
 */
function recentHistoryWindow(messages: DmEngineChatMessage[]): DmEngineChatMessage[] {
  const window = messages.slice(-MAX_DM_HISTORY_MESSAGES);
  const firstUser = window.findIndex((m) => m.role === 'user');
  return firstUser > 0 ? window.slice(firstUser) : window;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
