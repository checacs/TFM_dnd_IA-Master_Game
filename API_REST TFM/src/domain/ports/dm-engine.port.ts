export interface DmEngineChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DmEngineResult {
  narrative: string;
  events: unknown[];
}

/**
 * Error que significa "dm-engine SÍ recibió y procesó (al menos en parte) el
 * turno, pero terminó en error" -- a diferencia de un fallo de red/cold-start
 * donde la petición pudo no llegar nunca. La distinción importa para los
 * REINTENTOS: un turno que dm-engine llegó a procesar puede haber mutado la
 * partida de verdad (mapa aplicado, combate iniciado...) antes de fallar, y
 * reintentarlo entero ejecuta OTRO turno completo sobre esas mutaciones --
 * se comprobó en producción que eso duplica escenas y combates (cada llamada
 * al LLM es no determinista). Quien capture este error debe rendirse y
 * mostrar el fallback, nunca reenviar el turno automáticamente.
 */
export class DmEngineRespondedError extends Error {}

/**
 * Abstrae la llamada al servicio dm-engine (proyecto hermano, no vive en
 * este repo). La API no sabe nada de DeepSeek ni de MCP-como-cliente — solo
 * habla con este puerto, igual que habla con GameRepository.
 */
export interface DmEngineClient {
  sendTurn(gameId: string, messages: DmEngineChatMessage[]): Promise<DmEngineResult>;
}

export const DM_ENGINE_CLIENT = Symbol('DmEngineClient');
