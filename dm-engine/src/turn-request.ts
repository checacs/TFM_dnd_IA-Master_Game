import { ChatMessage } from './ports';

/**
 * Tope de mensajes por petición a /turn. La API ya manda solo una ventana
 * reciente del historial (MAX_DM_HISTORY_MESSAGES = 60 en SendMessageUseCase);
 * esto es la red de seguridad del lado de dm-engine.
 */
export const MAX_TURN_MESSAGES = 200;

export type TurnRequest = { gameId: string; messages: ChatMessage[] };
export type ParseResult = { ok: true; value: TurnRequest } | { ok: false; error: string };

/**
 * Valida el cuerpo de POST /turn. Antes se usaba tal cual (`req.body as ...`):
 * un cuerpo sin messages reventaba con un 500 genérico, y se aceptaban
 * mensajes 'system'/'tool' inyectados desde fuera -- con los que se podían
 * reescribir las reglas del DM. Solo se admite historial de jugadores y DM.
 */
export function parseTurnRequest(body: unknown): ParseResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Cuerpo JSON requerido' };
  }
  const { gameId, messages } = body as { gameId?: unknown; messages?: unknown };
  if (typeof gameId !== 'string' || gameId.length === 0) {
    return { ok: false, error: 'gameId (string) requerido' };
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'messages (array no vacío) requerido' };
  }
  if (messages.length > MAX_TURN_MESSAGES) {
    return { ok: false, error: `Demasiados mensajes (máximo ${MAX_TURN_MESSAGES})` };
  }
  const parsed: ChatMessage[] = [];
  for (const message of messages) {
    const { role, content } = (message ?? {}) as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      return { ok: false, error: 'Cada mensaje debe ser { role: "user" | "assistant", content: string }' };
    }
    parsed.push({ role, content });
  }
  return { ok: true, value: { gameId, messages: parsed } };
}
