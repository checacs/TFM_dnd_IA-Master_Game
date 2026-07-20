export interface DmEngineChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DmEngineResult {
  narrative: string;
  events: unknown[];
}

/**
 * Abstrae la llamada al servicio dm-engine (proyecto hermano, no vive en
 * este repo). La API no sabe nada de DeepSeek ni de MCP-como-cliente — solo
 * habla con este puerto, igual que habla con GameRepository.
 */
export interface DmEngineClient {
  sendTurn(gameId: string, messages: DmEngineChatMessage[]): Promise<DmEngineResult>;
}

export const DM_ENGINE_CLIENT = Symbol('DmEngineClient');
