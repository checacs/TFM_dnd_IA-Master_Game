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
 * 45s se quedaba corto en producción: un servicio Render free-tier "dormido"
 * (dm-engine, o la propia API llamando a un dm-engine igual de dormido) puede
 * tardar más de eso solo en arrancar, antes de procesar nada. Si este timeout
 * salta, SendMessageUseCase ya sabe convertirlo en un mensaje de fallback
 * legible en vez de dejar el turno sin ninguna respuesta.
 */
const DM_ENGINE_TIMEOUT_MS = 90_000;

@Injectable()
export class HttpDmEngineClient implements DmEngineClient {
  constructor(private readonly baseUrl: string) {}

  async sendTurn(gameId: string, messages: DmEngineChatMessage[]): Promise<DmEngineResult> {
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
        throw new Error(`dm-engine no respondió en ${DM_ENGINE_TIMEOUT_MS}ms`);
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error(`dm-engine respondió con estado ${response.status}`);
    }

    return response.json() as Promise<DmEngineResult>;
  }
}
