import OpenAI from 'openai';
import { ChatClient, ChatMessage, ToolDefinition, ChatCompletionResult } from './ports';

/**
 * DeepSeek es compatible con la API de OpenAI (docs/05-motor-ia-dm-deepseek.md)
 * — se reutiliza el paquete `openai` apuntando a su base URL, en vez de un
 * SDK propio. No se puede llamar en vivo desde este entorno (sin red hacia
 * api.deepseek.com); el tipado sí está verificado contra el paquete instalado.
 *
 * baseUrl ahora es un parámetro explícito (antes iba fijo a
 * 'https://api.deepseek.com') porque cualquier proveedor compatible con la
 * API de OpenAI/function-calling (Kimi K2/K3 de Moonshot en
 * api.moonshot.ai/v1, Qwen vía DashScope, GLM, o el propio OpenAI) puede
 * pasar por esta misma clase sin más cambios de código -- solo cambia la
 * URL, la key y el nombre del modelo (ver DEEPSEEK_BASE_URL en server.ts).
 * El nombre de la clase se mantiene como DeepSeekChatClient para no romper
 * las referencias existentes, pero deja de ser específico de DeepSeek.
 */

/**
 * Sin esto, un colgado de la red hacia el proveedor dejaba la promesa de
 * createCompletion sin resolver ni rechazar nunca, y con ella runDmTurn,
 * el fetch de la API y la mutación de React Query en ui-web — el chat se
 * quedaba en "El DM esta pensando..." para siempre con el botón deshabilitado.
 */
const CHAT_CLIENT_TIMEOUT_MS = 30_000;

export class DeepSeekChatClient implements ChatClient {
  private readonly client: OpenAI;

  constructor(
      apiKey: string,
      private readonly model: string,
      baseUrl: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl, timeout: CHAT_CLIENT_TIMEOUT_MS, maxRetries: 0 });
  }

  async createCompletion(params: { messages: ChatMessage[]; tools: ToolDefinition[] }): Promise<ChatCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      // El formato de mensajes/tools de nuestros puertos ya sigue la
      // convención OpenAI-compatible que espera DeepSeek.
      messages: params.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      tools: params.tools as OpenAI.Chat.ChatCompletionTool[],
    });

    const choice = response.choices[0];
    return {
      message: {
        role: 'assistant',
        content: choice.message.content,
        tool_calls: choice.message.tool_calls
            ?.filter((toolCall) => toolCall.type === 'function')
            .map((toolCall) => ({
              id: toolCall.id,
              type: 'function' as const,
              function: {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
              },
            })),
      },
    };
  }
}