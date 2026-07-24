import 'dotenv/config';
import express from 'express';
import { DeepSeekChatClient } from './deepseek-chat-client';
import { McpToolCaller } from './mcp-tool-caller';
import { runDmTurn, NoMutationYetError, DmTurnResult } from './dm-turn';
import { ChatMessage } from './ports';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL;
// Nueva a propósito, con valor por defecto: antes esta URL iba fija a
// 'https://api.deepseek.com' dentro de DeepSeekChatClient -- para poder
// cambiar de proveedor (Kimi K2/K3, Qwen, GLM, OpenAI...) sin tocar código,
// ahora se lee de aquí. El default mantiene el comportamiento de siempre
// (DeepSeek) si esta variable no se define -- así un despliegue ya
// existente en Render que no la tenga configurada sigue funcionando igual.
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
const MCP_SERVER_URL = process.env.MCP_SERVER_URL;

if (!DEEPSEEK_API_KEY) {
  throw new Error('Falta la variable de entorno DEEPSEEK_API_KEY (revisa tu .env)');
}
if (!DEEPSEEK_MODEL) {
  throw new Error(
    'Falta la variable de entorno DEEPSEEK_MODEL. Comprueba el id vigente en api-docs.deepseek.com (o la ' +
    'documentación del proveedor que estés usando) -- cambia con frecuencia.',
  );
}
if (!MCP_SERVER_URL) {
  throw new Error('Falta la variable de entorno MCP_SERVER_URL (ej. http://localhost:3000/mcp)');
}

const chatClient = new DeepSeekChatClient(DEEPSEEK_API_KEY, DEEPSEEK_MODEL, DEEPSEEK_BASE_URL);
const toolCaller = new McpToolCaller(MCP_SERVER_URL);

const app = express();
app.use(express.json());

/**
 * Un timeout en el cliente (HttpDmEngineClient / SendMessageUseCase) NO
 * cancela el trabajo aquí: dm-engine puede seguir corriendo un turno mucho
 * después de que el cliente se haya rendido y reintente. Se detectó en
 * partida real que esto duplicaba la ejecución de un turno completo -- dos
 * llamadas independientes a start_combat/set_battle_map con resultados
 * distintos (cada llamada al LLM es no determinista), y la que "perdía la
 * carrera" (su respuesta nunca llegaba al cliente, que ya había cerrado la
 * conexión) dejaba sus mutaciones huérfanas en la partida para siempre: un
 * combate con 2 cocodrilos en un mapa que el jugador jamás vio resucitó
 * varios turnos después, secuestrando una escena totalmente distinta.
 *
 * Este mapa evita que dos ejecuciones de runDmTurn muten la MISMA partida a
 * la vez: si llega una petición /turn para un gameId que ya tiene un turno
 * en curso, se reutiliza esa MISMA promesa en vez de arrancar una segunda
 * ejecución en paralelo -- sin importar cuántas veces se reintente, en
 * ningún nivel, solo puede haber un turno mutando una partida dada. (No hace
 * falta invalidar por timeout propio: runDmTurn ya hereda los timeouts
 * internos de DeepSeekChatClient/McpToolCaller, así que toda promesa aquí
 * se resuelve o rechaza en un tiempo acotado por diseño.)
 */
const turnsInFlight = new Map<string, Promise<DmTurnResult>>();

app.post('/turn', async (req, res) => {
  const { gameId, messages } = req.body as { gameId: string; messages: ChatMessage[] };
  try {
    let turnPromise = turnsInFlight.get(gameId);
    if (turnPromise) {
      console.warn(
        `[dm-engine] Ya hay un turno en curso para la partida ${gameId} -- reutilizando esa ejecución en ` +
          'vez de arrancar una segunda en paralelo (probable reintento de un cliente tras un timeout).',
      );
    } else {
      turnPromise = runDmTurn(chatClient, toolCaller, messages, gameId);
      turnsInFlight.set(gameId, turnPromise);
      turnPromise
          .finally(() => {
            // Defensivo: solo borra la entrada si sigue siendo ESTA promesa (evita
            // que un finally tardío borre la de una ejecución más nueva).
            if (turnsInFlight.get(gameId) === turnPromise) {
              turnsInFlight.delete(gameId);
            }
          })
          // CRÍTICO: .finally() devuelve una promesa NUEVA que hereda el
          // rechazo de turnPromise -- y esa promesa nueva no la espera nadie.
          // Sin este catch, cualquier turno que falle (se comprobó en
          // producción con "Se superó el límite de N iteraciones") generaba
          // un unhandledRejection que MATABA EL PROCESO ENTERO de dm-engine
          // (triggerUncaughtException), tirando el servicio para todas las
          // partidas hasta que Render lo reiniciaba en frío. El error real
          // del turno ya se gestiona en el await turnPromise de abajo.
          .catch(() => undefined);
    }

    const result = await turnPromise;
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

// Red de seguridad global: un rechazo de promesa sin gestionar NUNCA debe
// tirar el proceso entero (Node lo mata por defecto) -- un solo turno roto de
// una partida no puede dejar sin DM a todas las demás. Se registra con el
// máximo detalle para poder cazar el origen, pero el proceso sigue vivo.
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[dm-engine] unhandledRejection (proceso sigue vivo):', reason);
});
process.on('uncaughtException', (error) => {
  // eslint-disable-next-line no-console
  console.error('[dm-engine] uncaughtException (proceso sigue vivo):', error);
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`dm-engine escuchando en http://localhost:${PORT}`);
});
