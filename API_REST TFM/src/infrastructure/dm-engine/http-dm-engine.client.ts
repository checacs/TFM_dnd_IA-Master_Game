import { Injectable } from '@nestjs/common';
import { DmEngineClient, DmEngineChatMessage, DmEngineResult } from '../../domain/ports/dm-engine.port';

/**
 * Llama al endpoint /turn del servicio dm-engine (proyecto hermano). No se
 * puede probar en vivo sin dm-engine + DeepSeek reales corriendo — validado
 * en cuanto a tipado, la llamada real la confirmas en tu máquina.
 */

/**
 * Sin timeout, un dm-engine colgado (DeepSeek lento, MCP caído, etc.) dejaba
 * este fetch sin resolver ni rechazar nunca: la mutación de React Query en
 * ui-web se quedaba en isPending para siempre y el chat mostraba "El DM esta
 * pensando..." sin fin, con el botón de enviar deshabilitado.
 *
 * 90s se quedaba corto en producción: un servicio Render free-tier "dormido"
 * (dm-engine, o la propia API llamando a un dm-engine igual de dormido) puede
 * tardar más de eso solo en arrancar, antes de procesar nada. Si este timeout
 * salta, SendMessageUseCase ya sabe convertirlo en un mensaje de fallback
 * legible en vez de dejar el turno sin ninguna respuesta.
 */
const DM_ENGINE_TIMEOUT_MS = 90_000;

/**
 * Se detectó en partidas reales que, tras un rato sin usarse, el primer turno
 * fallaba con el mensaje de fallback ("el DM-IA no ha podido responder")
 * mientras dm-engine terminaba de arrancar en Render (cold start del plan
 * gratuito) -- y que reintentar el MISMO turno unos segundos después (el
 * jugador reescribiendo su acción) casi siempre funcionaba a la primera,
 * porque para entonces el contenedor ya estaba despierto. Antes había que
 * darse cuenta del error y volver a escribir la acción a mano. Ahora se
 * reintenta UNA vez automáticamente aquí mismo, sin que el jugador tenga que
 * hacer nada, y solo se propaga el error (-> mensaje de fallback de
 * SendMessageUseCase) si el segundo intento también falla.
 *
 * El reintento solo se dispara ante fallos "de arranque" (timeout o fetch
 * que ni siquiera consigue conectar, p.ej. ECONNREFUSED mientras el
 * contenedor todavía no escucha en el puerto) -- nunca ante una respuesta
 * HTTP de error (4xx/5xx), porque eso significa que dm-engine SÍ ha
 * respondido (pudo haber mutado la partida antes de fallar) y reintentar a
 * ciegas podría duplicar esa mutación.
 */
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3_000;

@Injectable()
export class HttpDmEngineClient implements DmEngineClient {
  constructor(private readonly baseUrl: string) {}

  async sendTurn(gameId: string, messages: DmEngineChatMessage[]): Promise<DmEngineResult> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.doRequest(gameId, messages);
      } catch (error) {
        const isLastAttempt = attempt === MAX_ATTEMPTS;
        if (error instanceof StartupFailure && !isLastAttempt) {
          console.warn(
            `[HttpDmEngineClient] intento ${attempt}/${MAX_ATTEMPTS} falló (${error.cause.message}); ` +
              `reintentando en ${RETRY_DELAY_MS}ms por si dm-engine solo estaba arrancando...`,
          );
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw error instanceof StartupFailure ? error.cause : error;
      }
    }

    // Inalcanzable (el bucle de arriba siempre retorna o lanza) -- solo para
    // que TypeScript vea que la función siempre termina en un valor o throw.
    throw new Error('dm-engine: fallo desconocido');
  }

  private async doRequest(gameId: string, messages: DmEngineChatMessage[]): Promise<DmEngineResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, messages }),
        signal: AbortSignal.timeout(DM_ENGINE_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new StartupFailure(new Error(`dm-engine no respondió en ${DM_ENGINE_TIMEOUT_MS}ms`));
      }
      // fetch rechaza (sin respuesta HTTP alguna) cuando ni siquiera consigue
      // conectar -- típico de un contenedor que todavía no escucha en el
      // puerto durante el arranque. Un error CON respuesta (status 4xx/5xx)
      // no pasa por aquí, cae más abajo en el `if (!response.ok)`.
      throw new StartupFailure(error instanceof Error ? error : new Error(String(error)));
    }

    if (!response.ok) {
      // 503 es la señal explícita de dm-engine (ver NoMutationYetError en su
      // dm-turn.ts) de que el fallo ocurrió ANTES de llamar a ninguna tool en
      // este turno -- nada se mutó todavía, así que SÍ es seguro reintentar.
      // Se detectó en partida real que un fallo transitorio de DeepSeek en la
      // primera llamada del turno (DeepSeekChatClient usa maxRetries: 0 a
      // propósito) se convertía antes en un 500 indistinguible de "ya mutó
      // algo", y por diseño nunca se reintentaba -- el jugador tenía que
      // reescribir su acción a mano. Cualquier OTRO estado (incluido un 500
      // genérico) sigue sin reintentarse, exactamente como antes.
      if (response.status === 503) {
        throw new StartupFailure(new Error(`dm-engine señaló un fallo reintentable (503) antes de mutar estado`));
      }
      throw new Error(`dm-engine respondió con estado ${response.status}`);
    }

    return response.json() as Promise<DmEngineResult>;
  }
}

/** Marca internamente un fallo "de arranque" (candidato a reintento) frente a uno de aplicación. */
class StartupFailure extends Error {
  constructor(public readonly cause: Error) {
    super(cause.message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
