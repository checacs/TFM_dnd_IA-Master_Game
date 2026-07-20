import OpenAI from 'openai';
import { ChatClient, ChatMessage, ToolDefinition, ChatCompletionResult } from './ports';

/**
 * DeepSeek es compatible con la API de OpenAI (docs/05-motor-ia-dm-deepseek.md)
 * — se reutiliza el paquete `openai` apuntando a su base URL, en vez de un
 * SDK propio. No se puede llamar en vivo desde este entorno (sin red hacia
 * api.deepseek.com); el tipado sí está verificado contra el paquete instalado.
 */

/**
 * Sin esto, un colgado de la red hacia DeepSeek dejaba la promesa de
 * createCompletion sin resolver ni rechazar nunca, y con ella runDmTurn,
 * el fetch de la API y la mutación de React Query en ui-web — el chat se
 * quedaba en "El DM esta pensando..." para siempre con el botón deshabilitado.
 */
const DEEPSEEK_TIMEOUT_MS = 30_000;

export class DeepSeekChatClient implements ChatClient {
  private readonly client: OpenAI;

  constructor(
      apiKey: string,
      private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', timeout: DEEPSEEK_TIMEOUT_MS, maxRetries: 0 });
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