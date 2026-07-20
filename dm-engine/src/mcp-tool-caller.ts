import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolCaller, McpToolInfo } from './ports';

/**
 * Sin esto, un servidor MCP colgado (o el servidor stateless de la API
 * devolviendo una respuesta que nunca cierra el stream) dejaba estas
 * promesas sin resolver ni rechazar nunca, colgando runDmTurn entero y,
 * con él, el chat de ui-web ("El DM esta pensando..." para siempre).
 */
const MCP_CALL_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
        () => reject(new Error(`Tiempo de espera agotado (${MCP_CALL_TIMEOUT_MS}ms) esperando "${label}" del servidor MCP`)),
        MCP_CALL_TIMEOUT_MS,
    );
    promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
  });
}

/**
 * Cliente MCP real, conectado al servidor de la API (docs/04-servidor-mcp.md).
 * No se puede probar en vivo sin la API + Mongo corriendo — validado en
 * cuanto al tipado contra el SDK instalado, la conexión real la confirmas
 * en tu máquina.
 */
export class McpToolCaller implements ToolCaller {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly serverUrl: string) {}

  private async getClient(): Promise<Client> {
    if (this.client) {
      return this.client;
    }
    if (!this.connecting) {
      const client = new Client({ name: 'dnd-dm-engine', version: '1.0.0' });
      this.connecting = withTimeout(
          client.connect(new StreamableHTTPClientTransport(new URL(this.serverUrl))),
          'connect',
      )
          .then(() => {
            this.client = client;
            return client;
          })
          .catch((error) => {
            // Si la conexión falla o se cuelga, no dejamos una promesa
            // "congelada" cacheada: el siguiente turno debe poder reintentar.
            this.connecting = null;
            throw error;
          });
    }
    return this.connecting;
  }

  /** Si una llamada falla (timeout, socket roto, etc.), se descarta el cliente cacheado para forzar reconexión en el próximo turno. */
  private async withClient<T>(label: string, fn: (client: Client) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      return await withTimeout(fn(client), label);
    } catch (error) {
      this.client = null;
      this.connecting = null;
      throw error;
    }
  }

  async listTools(): Promise<McpToolInfo[]> {
    const { tools } = await this.withClient('listTools', (client) => client.listTools());
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    // Sin este log era imposible reconstruir, tras el hecho, si el modelo
    // realmente había llamado a una tool (p.ej. set_battle_map) o solo lo
    // había narrado — quedó como hueco de diagnóstico anotado explícitamente
    // la primera vez que el mapa no se aplicó pese a que la narración sonaba
    // como si sí se hubiera fijado.
    console.log(`[dm-engine] -> ${name}`, JSON.stringify(args));

    const result = await this.withClient(`callTool:${name}`, (client) => client.callTool({ name, arguments: args }));

    const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
      (block) => block.type === 'text',
    );
    if (!textBlock?.text) {
      console.log(`[dm-engine] <- ${name}: sin contenido de texto`);
      return null;
    }

    if (result.isError) {
      // El SDK convierte una excepción del handler (ej. DomainError "Partida
      // no encontrada") en un resultado con isError:true y texto plano, no JSON.
      console.error(`[dm-engine] <- ${name} ERROR: ${textBlock.text}`);
      throw new Error(`La tool "${name}" devolvió un error: ${textBlock.text}`);
    }

    console.log(`[dm-engine] <- ${name} OK: ${textBlock.text}`);

    try {
      return JSON.parse(textBlock.text);
    } catch {
      // Defensa adicional: si por lo que sea el texto no es JSON, no reventamos el turno entero.
      return { raw: textBlock.text };
    }
  }
}
