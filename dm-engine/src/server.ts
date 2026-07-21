import 'dotenv/config';
import express from 'express';
import { DeepSeekChatClient } from './deepseek-chat-client';
import { McpToolCaller } from './mcp-tool-caller';
import { runDmTurn, NoMutationYetError } from './dm-turn';
import { ChatMessage } from './ports';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL;

if (!DEEPSEEK_API_KEY) {
  throw new Error('Falta la variable de entorno DEEPSEEK_API_KEY (revisa tu .env)');
}
if (!DEEPSEEK_MODEL) {
  throw new Error(
    'Falta la variable de entorno DEEPSEEK_MODEL. Comprueba el id vigente en api-docs.deepseek.com — cambia con frecuencia.',
  );
}
if (!MCP_SERVER_URL) {
  throw new Error('Falta la variable de entorno MCP_SERVER_URL (ej. http://localhost:3000/mcp)');
}

const chatClient = new DeepSeekChatClient(DEEPSEEK_API_KEY, DEEPSEEK_MODEL);
const toolCaller = new McpToolCaller(MCP_SERVER_URL);

const app = express();
app.use(express.json());

app.post('/turn', async (req, res) => {
  try {
    const { gameId, messages } = req.body as { gameId: string; messages: ChatMessage[] };
    const result = await runDmTurn(chatClient, toolCaller, messages, gameId);
    res.json(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error procesando el turno del DM:', error);
    if (error instanceof NoMutationYetError) {
      // 503 (distinto del 500 genérico): le dice a HttpDmEngineClient (lado
      // API) que este fallo ocurrió ANTES de llamar a ninguna tool -- nada se
      // mutó todavía, así que reintentar automáticamente es seguro. Ver el
      // comentario de NoMutationYetError en dm-turn.ts.
      res.status(503).json({ error: 'dm-engine: fallo antes de mutar nada, reintentable', retryable: true });
      return;
    }
    res.status(500).json({ error: 'Error interno procesando el turno' });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`dm-engine escuchando en http://localhost:${PORT}`);
});
