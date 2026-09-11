export interface ToolCall {
  id: string;
  /**
   * Obligatorio al reenviar el mensaje del asistente en la siguiente llamada
   * — si se omite, DeepSeek rechaza la petición con
   * "missing field `type`" (fallo real detectado en pruebas).
   */
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description?: string; parameters: unknown };
}

export interface ChatCompletionResult {
  message: ChatMessage;
}

/** Abstrae la API de chat con function calling (DeepSeek, compatible con OpenAI). */
export interface ChatClient {
  createCompletion(params: { messages: ChatMessage[]; tools: ToolDefinition[] }): Promise<ChatCompletionResult>;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: unknown;
}

/** Abstrae el cliente MCP conectado al servidor de la API. */
export interface ToolCaller {
  listTools(): Promise<McpToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}