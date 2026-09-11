import { ChatClient, ChatCompletionResult, ChatMessage, ToolCaller, McpToolInfo, ToolDefinition } from './ports';
import { runDmTurn, NoMutationYetError } from './dm-turn';

class FakeChatClient implements ChatClient {
  private i = 0;
  public readonly receivedCalls: { messages: ChatMessage[]; tools: ToolDefinition[] }[] = [];
  constructor(private readonly responses: ChatCompletionResult[]) {}
  async createCompletion(params: { messages: ChatMessage[]; tools: ToolDefinition[] }): Promise<ChatCompletionResult> {
    this.receivedCalls.push(params);
    const response = this.responses[this.i];
    this.i = Math.min(this.i + 1, this.responses.length - 1);
    return response;
  }
}

/**
 * Historial largo (>10 mensajes, más allá de VILLAGE_START_MAX_MESSAGES) sin
 * ninguna mención a taberna/tablón/primera persona, terminando en el mensaje
 * real que se quiere probar. Se descubrió escribiendo los tests de
 * staleEncounterConflictNudge que un array de UN solo mensaje hace que
 * messages.length === 1 y dispara SIEMPRE gameStartNudge ("primerísimo turno
 * de la partida") antes que cualquier otro aviso, dominando el bucle de
 * correcciones por completo -- cualquier test de un aviso que no sea el de
 * arranque necesita simular que la partida ya lleva un rato en marcha.
 */
function ongoingGameHistory(lastPlayerMessage: string): ChatMessage[] {
  const filler: ChatMessage[] = [];
  for (let i = 0; i < 12; i++) {
    filler.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `Mensaje de relleno ${i} sin pistas de arranque.` });
  }
  return [...filler, { role: 'user', content: lastPlayerMessage }];
}

/**
 * Simula fallos de chatClient.createCompletion en pasos concretos -- para
 * probar que runDmTurn distingue un fallo ANTES de llamar a cualquier tool
 * (NoMutationYetError, seguro reintentar) de un fallo DESPUÉS de que alguna
 * tool ya se ejecutó (error normal, nada garantiza que sea seguro reintentar).
 */
class ThrowingChatClient implements ChatClient {
  private i = 0;
  constructor(private readonly steps: (ChatCompletionResult | Error)[]) {}
  async createCompletion(): Promise<ChatCompletionResult> {
    const step = this.steps[Math.min(this.i, this.steps.length - 1)];
    this.i += 1;
    if (step instanceof Error) throw step;
    return step;
  }
}

class FakeToolCaller implements ToolCaller {
  public readonly calls: { name: string; args: Record<string, unknown> }[] = [];
  constructor(
    private readonly tools: McpToolInfo[] = [],
    private readonly results: Record<string, unknown> = {},
    private readonly errors: Record<string, string> = {},
  ) {}
  async listTools(): Promise<McpToolInfo[]> {
    return this.tools;
  }
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ name, args });
    if (this.errors[name]) {
      throw new Error(this.errors[name]);
    }
    return this.results[name] ?? {};
  }
}

describe('runDmTurn', () => {
  it('incluye el gameId en el system prompt que recibe el modelo', async () => {
    const chatClient = new FakeChatClient([{ message: { role: 'assistant', content: 'Miras alrededor.' } }]);
    const toolCaller = new FakeToolCaller();

    await runDmTurn(chatClient, toolCaller, [{ role: 'user', content: 'Miro alrededor' }], 'game-123');

    const systemMessage = chatClient.receivedCalls[0].messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('game-123');
  });

  it('si el modelo no pide ninguna tool, devuelve la narrativa directamente sin llamar a ninguna tool', async () => {
    const chatClient = new FakeChatClient([
      { message: { role: 'assistant', content: 'La posada está en silencio.' } },
    ]);
    const toolCaller = new FakeToolCaller();

    const result = await runDmTurn(chatClient, toolCaller, [{ role: 'user', content: 'Miro alrededor' }], 'game-1');

    expect(result.narrative).toBe('La posada está en silencio.');
    expect(result.events).toEqual([]);
    // get_game_state se llama siempre al final del turno (resolveStaleDefeatedEncounter,
    // el seguro de combate huérfano que se ejecuta incondicionalmente) -- no es una
    // tool que el modelo haya pedido.
    expect(toolCaller.calls).toEqual([{ name: 'get_game_state', args: { gameId: 'game-1' } }]);
  });

  it('ejecuta la tool pedida, genera su evento, y continúa hasta la respuesta final', async () => {
    const chatClient = new FakeChatClient([
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-1', type: 'function' as const, function: { name: 'roll_dice', arguments: '{"notation":"1d20"}' } }],
        },
      },
      { message: { role: 'assistant', content: 'Sacas un 14 en la tirada.' } },
    ]);
    const toolCaller = new FakeToolCaller([], { roll_dice: { notation: '1d20', result: 14 } });

    const result = await runDmTurn(
      chatClient,
      toolCaller,
      [{ role: 'user', content: 'Tiro para percibir' }],
      'game-1',
    );

    // + get_game_state: seguro de combate huérfano incondicional al final del turno.
    expect(toolCaller.calls).toEqual([
      { name: 'roll_dice', args: { notation: '1d20' } },
      { name: 'get_game_state', args: { gameId: 'game-1' } },
    ]);
    expect(result.events).toEqual([{ type: 'tirada_realizada', payload: { notation: '1d20', result: 14 } }]);
    expect(result.narrative).toBe('Sacas un 14 en la tirada.');
  });

  it('las tools de solo consulta no generan evento aunque sí se ejecutan', async () => {
    const chatClient = new FakeChatClient([
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-1', type: 'function' as const, function: { name: 'get_game_state', arguments: '{"gameId":"g1"}' } }],
        },
      },
      { message: { role: 'assistant', content: 'Estás en la taberna.' } },
    ]);
    const toolCaller = new FakeToolCaller([], { get_game_state: { name: 'La torre olvidada' } });

    const result = await runDmTurn(chatClient, toolCaller, [], 'game-1');

    // 1 explícita del modelo + 1 automática del seguro de combate huérfano al final del turno.
    expect(toolCaller.calls).toHaveLength(2);
    expect(result.events).toEqual([]);
  });

  it(
      'ya NO lanza un error si se supera el límite de iteraciones de tool-calling -- corta el acceso a más tools ' +
      'y cierra el turno con una narrativa mínima en vez de reventarlo (antes esto podía matar el proceso entero ' +
      'de dm-engine, ver el comentario del límite en runDmTurn)',
      async () => {
        const infiniteToolCall = {
          message: {
            role: 'assistant' as const,
            content: null,
            tool_calls: [{ id: 'call-x', type: 'function' as const, function: { name: 'roll_dice', arguments: '{"notation":"1d20"}' } }],
          },
        };
        const chatClient = new FakeChatClient([infiniteToolCall]); // siempre pide otra tool, nunca termina
        const toolCaller = new FakeToolCaller([], { roll_dice: { result: 1 } });

        const result = await runDmTurn(chatClient, toolCaller, [], 'game-1');

        expect(result.narrative).toBe('La escena queda preparada ante vosotros. ¿Qué hacéis?');
        expect(toolCaller.calls.filter((c) => c.name === 'roll_dice')).toHaveLength(16); // MAX_TOOL_CALL_ITERATIONS
      },
  );

  it('si una tool falla, el error se pasa al modelo como resultado de la tool en vez de reventar el turno', async () => {
    const chatClient = new FakeChatClient([
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-1', type: 'function' as const, function: { name: 'set_battle_map', arguments: '{"gameId":"g1","mapId":"ruinas-bosque"}' } }],
        },
      },
      { message: { role: 'assistant', content: 'Sigo narrando pese al fallo.' } },
    ]);
    const toolCaller = new FakeToolCaller([], {}, { set_battle_map: 'mapa no encontrado' });

    const result = await runDmTurn(chatClient, toolCaller, [], 'game-1');

    expect(result.narrative).toBe('Sigo narrando pese al fallo.');
    // el mensaje 'tool' enviado de vuelta al modelo debe contener el error, no reventar
    const toolMessage = chatClient.receivedCalls[1].messages.find((m) => m.role === 'tool');
    expect(toolMessage?.content).toContain('mapa no encontrado');
    // una tool que falla no debe generar un evento falso de éxito
    expect(result.events).toEqual([]);
  });

  it('si explora mapas (describe_map) pero no llega a llamar a set_battle_map, se le pide explícitamente antes de aceptar la narrativa final', async () => {
    const chatClient = new FakeChatClient([
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-1', type: 'function' as const, function: { name: 'describe_map', arguments: '{"mapId":"ruinas-bosque"}' } }],
        },
      },
      { message: { role: 'assistant', content: 'Narración sin haber fijado el mapa.' } },
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-2', type: 'function' as const, function: { name: 'set_battle_map', arguments: '{"gameId":"g1","mapId":"ruinas-bosque"}' } }],
        },
      },
      { message: { role: 'assistant', content: 'Ahora sí, con el mapa fijado.' } },
    ]);
    const toolCaller = new FakeToolCaller([], {
      describe_map: { name: 'Las Ruinas del Claro del Bosque' },
      set_battle_map: { applied: true },
    });

    const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

    // + get_game_state: seguro de combate huérfano incondicional al final del turno.
    expect(toolCaller.calls.map((c) => c.name)).toEqual(['describe_map', 'set_battle_map', 'get_game_state']);
    expect(result.events).toEqual([{ type: 'mapa_aplicado', payload: { applied: true } }]);
    expect(result.narrative).toBe('Ahora sí, con el mapa fijado.');

    // la tercera llamada al modelo (tras la narrativa incompleta) debe incluir un aviso correctivo
    const correctionCall = chatClient.receivedCalls[2];
    const lastMessage = correctionCall.messages[correctionCall.messages.length - 1];
    expect(lastMessage.content).toMatch(/set_battle_map/);
  });

  it('si explora mapas y no encuentra ninguno que encaje, llamar a clear_battle_map resuelve el turno sin avisos', async () => {
    const chatClient = new FakeChatClient([
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-1', type: 'function' as const, function: { name: 'get_battle_maps', arguments: '{"tags":["almacen"]}' } }],
        },
      },
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-2', type: 'function' as const, function: { name: 'clear_battle_map', arguments: '{"gameId":"g1"}' } }],
        },
      },
      { message: { role: 'assistant', content: 'Salís de la taberna y entráis en un almacén en penumbra.' } },
    ]);
    const toolCaller = new FakeToolCaller([], { get_battle_maps: [], clear_battle_map: { cleared: true } });

    const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

    expect(toolCaller.calls.map((c) => c.name)).toEqual(['get_battle_maps', 'clear_battle_map', 'get_game_state']);
    expect(result.events).toEqual([{ type: 'mapa_limpiado', payload: { cleared: true } }]);
    expect(result.narrative).toBe('Salís de la taberna y entráis en un almacén en penumbra.');
    expect(chatClient.receivedCalls).toHaveLength(3); // sin ronda de corrección extra
  });

  it('si aplica un mapa pero no coloca a ningún participante, se le pide colocar participantes antes de narrar', async () => {
    const chatClient = new FakeChatClient([
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-1', type: 'function' as const, function: { name: 'set_battle_map', arguments: '{"gameId":"g1","mapId":"ruinas-bosque"}' } }],
        },
      },
      { message: { role: 'assistant', content: 'Narración sin colocar a nadie.' } },
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-2', type: 'function' as const, function: { name: 'place_participant', arguments: '{"gameId":"g1","participantId":"char-1","row":2,"col":3}' } }],
        },
      },
      { message: { role: 'assistant', content: 'Ahora sí, con todos colocados.' } },
    ]);
    const toolCaller = new FakeToolCaller([], {
      set_battle_map: { applied: true },
      place_participant: { placed: true },
    });

    const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

    expect(toolCaller.calls.map((c) => c.name)).toEqual(['set_battle_map', 'place_participant', 'get_game_state']);
    expect(result.narrative).toBe('Ahora sí, con todos colocados.');
    const correctionCall = chatClient.receivedCalls[2];
    const lastMessage = correctionCall.messages[correctionCall.messages.length - 1];
    expect(lastMessage.content).toMatch(/place_participant/);
  });

  it('si inicia combate pero no coloca a todos los enemigos devueltos por start_combat, se le pide colocarlos antes de narrar', async () => {
    const chatClient = new FakeChatClient([
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-1', type: 'function' as const, function: { name: 'start_combat', arguments: '{"gameId":"g1","enemyIds":["goblin"]}' } }],
        },
      },
      { message: { role: 'assistant', content: 'Narración sin colocar enemigos.' } },
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call-2', type: 'function' as const, function: { name: 'place_participant', arguments: '{"gameId":"g1","participantId":"enemy-inst-1","row":5,"col":5}' } },
            { id: 'call-3', type: 'function' as const, function: { name: 'place_participant', arguments: '{"gameId":"g1","participantId":"enemy-inst-2","row":5,"col":6}' } },
          ],
        },
      },
      { message: { role: 'assistant', content: 'Ahora sí, con los enemigos colocados.' } },
    ]);
    const toolCaller = new FakeToolCaller([], {
      start_combat: {
        started: true,
        enemies: [
          { instanceId: 'enemy-inst-1', name: 'Goblin' },
          { instanceId: 'enemy-inst-2', name: 'Goblin' },
        ],
      },
      place_participant: { placed: true },
    });

    const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

    expect(result.narrative).toBe('Ahora sí, con los enemigos colocados.');
    const correctionCall = chatClient.receivedCalls[2];
    const lastMessage = correctionCall.messages[correctionCall.messages.length - 1];
    expect(lastMessage.content).toMatch(/enemy-inst-1/);
    expect(lastMessage.content).toMatch(/enemy-inst-2/);
  });

  it('si coloca a todos los enemigos del combate en el mismo turno, no se dispara ningún aviso de colocación', async () => {
    // start_combat y place_participant llegan en la MISMA respuesta del modelo
    // (un único mensaje con dos tool_calls, procesados en orden dentro del bucle
    // for): así se simula que el modelo resuelve todo antes de narrar, sin
    // necesitar una ronda de ida-y-vuelta adicional solo para colocar al enemigo.
    const chatClient = new FakeChatClient([
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call-1', type: 'function' as const, function: { name: 'start_combat', arguments: '{"gameId":"g1","enemyIds":["goblin"]}' } },
            { id: 'call-2', type: 'function' as const, function: { name: 'place_participant', arguments: '{"gameId":"g1","participantId":"enemy-inst-1","row":5,"col":5}' } },
          ],
        },
      },
      { message: { role: 'assistant', content: 'Todo colocado desde el principio.' } },
    ]);
    const toolCaller = new FakeToolCaller([], {
      start_combat: { started: true, enemies: [{ instanceId: 'enemy-inst-1', name: 'Goblin' }] },
      place_participant: { placed: true },
    });

    const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

    expect(result.narrative).toBe('Todo colocado desde el principio.');
    expect(chatClient.receivedCalls).toHaveLength(2); // sin ronda de corrección extra
  });

  it(
      'si resuelve ataques de enemigos pero no llama a advance_to_player_round, se le pide antes de narrar -- el ' +
      'aviso comprueba el estado REAL de la partida (roundPhase) antes de dispararse',
      async () => {
        // El aviso ahora solo se dispara si get_game_state confirma que la fase REAL
        // sigue en 'enemigos' (ver el comentario de needsTurnChecks en protocolNudge) --
        // este fake simula esa fase real: 'enemigos' hasta que el modelo llama a
        // advance_to_player_round, y 'jugadores' después (evita que el seguro
        // anti-atasco del final del turno vuelva a dispararse de más sobre un estado
        // que ya se corrigió).
        class EnemyPhaseToolCaller implements ToolCaller {
          public readonly calls: { name: string; args: Record<string, unknown> }[] = [];
          private advanced = false;
          async listTools(): Promise<McpToolInfo[]> { return []; }
          async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
            this.calls.push({ name, args });
            if (name === 'resolve_attack') return { hit: true, damage: 3 };
            if (name === 'advance_to_player_round') {
              this.advanced = true;
              return { advanced: true };
            }
            if (name === 'get_game_state') {
              return { activeEncounter: { roundPhase: this.advanced ? 'jugadores' : 'enemigos', enemies: [] } };
            }
            return {};
          }
        }

        const chatClient = new FakeChatClient([
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'call-1', type: 'function' as const, function: { name: 'resolve_attack', arguments: '{"gameId":"g1","targetId":"char-1","attackerModifier":2,"targetArmorClass":13,"damageDice":"1d6"}' } }],
            },
          },
          { message: { role: 'assistant', content: 'El goblin te golpea (sin reabrir la ronda).' } },
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'call-2', type: 'function' as const, function: { name: 'advance_to_player_round', arguments: '{"gameId":"g1"}' } }],
            },
          },
          { message: { role: 'assistant', content: 'Ronda de jugadores reabierta.' } },
        ]);
        const toolCaller = new EnemyPhaseToolCaller();

        const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

        expect(toolCaller.calls.map((c) => c.name)).toEqual([
          'resolve_attack', 'get_game_state', 'advance_to_player_round', 'get_game_state',
        ]);
        expect(result.narrative).toBe('Ronda de jugadores reabierta.');
        const correctionCall = chatClient.receivedCalls[2];
        const lastMessage = correctionCall.messages[correctionCall.messages.length - 1];
        expect(lastMessage.content).toMatch(/advance_to_player_round/);
      },
  );

  it('si resuelve ataques y reabre la ronda en el mismo turno, no se dispara ningún aviso', async () => {
    const chatClient = new FakeChatClient([
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call-1', type: 'function' as const, function: { name: 'resolve_attack', arguments: '{"gameId":"g1","targetId":"char-1","attackerModifier":2,"targetArmorClass":13,"damageDice":"1d6"}' } },
            { id: 'call-2', type: 'function' as const, function: { name: 'advance_to_player_round', arguments: '{"gameId":"g1"}' } },
          ],
        },
      },
      { message: { role: 'assistant', content: 'Todo resuelto y ronda reabierta de una vez.' } },
    ]);
    const toolCaller = new FakeToolCaller([], {
      resolve_attack: { hit: true, damage: 3 },
      advance_to_player_round: { advanced: true },
    });

    const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

    expect(result.narrative).toBe('Todo resuelto y ronda reabierta de una vez.');
    expect(chatClient.receivedCalls).toHaveLength(2); // sin ronda de corrección extra
  });

  it(
      'corrige hasta MAX_CORRECTION_ATTEMPTS (2) veces el mismo problema: si el modelo insiste en no llamar a ' +
      'set_battle_map, se acepta su narrativa sin bucle infinito',
      async () => {
        const chatClient = new FakeChatClient([
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'call-1', type: 'function' as const, function: { name: 'describe_map', arguments: '{"mapId":"ruinas-bosque"}' } }],
            },
          },
          { message: { role: 'assistant', content: 'Narración sin mapa (primer intento).' } },
          { message: { role: 'assistant', content: 'Narración sin mapa (tras el aviso, insiste).' } },
        ]);
        const toolCaller = new FakeToolCaller([], { describe_map: { name: 'mapa' } });

        const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

        expect(result.narrative).toBe('Narración sin mapa (tras el aviso, insiste).');
        // 1 (tool_calls) + 1 (1er intento) + 2 correcciones del MISMO aviso (MAX_CORRECTION_ATTEMPTS)
        // -- no una quinta llamada de corrección adicional.
        expect(chatClient.receivedCalls).toHaveLength(4);
      },
  );

  it('si el turno no toca mapas para nada, no se generan avisos ni iteraciones extra', async () => {
    const chatClient = new FakeChatClient([
      { message: { role: 'assistant', content: 'Miras alrededor, todo en calma.' } },
    ]);
    const toolCaller = new FakeToolCaller();

    // Historial vacío (no de 1 solo mensaje): con exactamente 1 mensaje,
    // gameStartNudge trata el turno como "el primerísimo de la partida" y
    // dispara su propio aviso (taberna/tablón), dominando el turno y rompiendo
    // el propósito de este test (verificar que NO se genera ningún aviso).
    const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

    expect(result.narrative).toBe('Miras alrededor, todo en calma.');
    expect(chatClient.receivedCalls).toHaveLength(1);
  });

  it(
      'si la narración suena a que el grupo cambió de localización (sale de un sitio y entra/baja a otro) ' +
      'pero no se llamó a NINGUNA tool de mapa, se avisa antes de aceptar la narrativa -- caso real detectado ' +
      'en partida: el DM narró salir de una taberna y bajar a una cripta sin tocar get_battle_maps/' +
      'set_battle_map/clear_battle_map, y el tablero se quedó con la imagen de la taberna',
      async () => {
        const chatClient = new FakeChatClient([
          {
            message: {
              role: 'assistant',
              content:
                'Sales de la taberna al aire frío de la noche. Bajas con cuidado, contando los peldaños: doce, ' +
                'quince, veinte. El pasillo se abre a una sala cuadrada.',
            },
          },
          { message: { role: 'assistant', content: 'Tras revisar el mapa de la cripta, continúa la escena.' } },
        ]);
        const toolCaller = new FakeToolCaller([], { get_battle_maps: [], clear_battle_map: { cleared: true } });

        const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

        expect(result.narrative).toBe('Tras revisar el mapa de la cripta, continúa la escena.');
        expect(chatClient.receivedCalls).toHaveLength(2);
        const correctionCall = chatClient.receivedCalls[1];
        const lastMessage = correctionCall.messages[correctionCall.messages.length - 1];
        expect(lastMessage.content).toMatch(/tool de mapa/);
      },
  );

  it(
      'si la narración menciona salir/entrar pero el DM SÍ resolvió el mapa en ese mismo turno, no se ' +
      'dispara el aviso de cambio de localización (evita falsos positivos sobre trabajo ya hecho)',
      async () => {
        const chatClient = new FakeChatClient([
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'get_battle_maps', arguments: '{"tags":["cripta"]}' } }],
            },
          },
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'c2', type: 'function' as const, function: { name: 'clear_battle_map', arguments: '{"gameId":"g1"}' } }],
            },
          },
          { message: { role: 'assistant', content: 'Sales de la taberna y desciendes a la cripta oscura.' } },
        ]);
        const toolCaller = new FakeToolCaller([], { get_battle_maps: [], clear_battle_map: { cleared: true } });

        const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

        expect(result.narrative).toBe('Sales de la taberna y desciendes a la cripta oscura.');
        expect(chatClient.receivedCalls).toHaveLength(3); // sin ronda de corrección extra
      },
  );

  it(
      'si resuelve un ataque contra un enemigo y llama a grant_xp como si lo hubiera matado, pero get_game_state ' +
      'dice que ese enemigo sigue con HP real > 0, se avisa antes de aceptar la narrativa de victoria -- caso real ' +
      'detectado en partida: un Brown Bear con 34 HP recibió solo 9 de daño acumulado (25 HP reales restantes) y ' +
      'el DM narró su muerte y otorgó 200 XP como si el combate hubiera terminado',
      async () => {
        const chatClient = new FakeChatClient([
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'c1', type: 'function' as const, function: { name: 'resolve_attack', arguments: '{"gameId":"g1","targetId":"bear-1","attackerModifier":0,"targetArmorClass":11,"damageDice":"1d4","playerD20":11}' } },
                { id: 'c2', type: 'function' as const, function: { name: 'grant_xp', arguments: '{"characterId":"char-1","amount":200}' } },
              ],
            },
          },
          { message: { role: 'assistant', content: 'Has vencido al oso. El cadáver yace a tus pies.' } },
          { message: { role: 'assistant', content: 'El oso sigue en pie, malherido, y ataca de nuevo.' } },
        ]);
        const toolCaller = new FakeToolCaller([], {
          resolve_attack: { hit: true, attackRoll: 11, damage: 4 },
          grant_xp: { levelUp: false },
          get_game_state: {
            activeEncounter: { enemies: [{ instanceId: 'bear-1', name: 'Brown Bear', currentHp: 25 }] },
          },
        });

        const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

        expect(result.narrative).toBe('El oso sigue en pie, malherido, y ataca de nuevo.');
        // El modelo insiste en el mismo problema más allá de MAX_CORRECTION_ATTEMPTS
        // (checkCombatStateNudge se reevalúa -- y vuelve a llamar a get_game_state --
        // en cada intento), y al final del turno el seguro de combate huérfano hace
        // una comprobación más (el oso sigue vivo, así que no cierra nada).
        expect(toolCaller.calls.map((c) => c.name)).toEqual([
          'resolve_attack', 'grant_xp', 'get_game_state', 'get_game_state', 'get_game_state', 'get_game_state', 'get_game_state',
        ]);
        // receivedCalls[0] = tool_calls iniciales; [1] = tras ejecutarlas, todavía sin
        // corrección (el modelo ya declaró la victoria prematura, pero el aviso se
        // evalúa DESPUÉS de recibir esa respuesta); [2] = ya con el aviso correctivo.
        const correctionCall = chatClient.receivedCalls[2];
        const lastMessage = correctionCall.messages[correctionCall.messages.length - 1];
        expect(lastMessage.content).toMatch(/Brown Bear/);
        expect(lastMessage.content).toMatch(/25/);
      },
  );

  it(
      'si resuelve un ataque que SÍ deja al enemigo con currentHp real en 0, llama a grant_xp Y a end_combat, ' +
      'no se dispara ningún aviso',
      async () => {
        const chatClient = new FakeChatClient([
          {
            message: {
              role: 'assistant',
              content: null,
              // Se incluyen advance_to_player_round y end_combat en la misma respuesta
              // para que no se dispare ningún otro aviso (ni el de "ronda no reabierta"
              // ni el nuevo de "combate no cerrado") aparte del que está bajo prueba.
              tool_calls: [
                { id: 'c1', type: 'function' as const, function: { name: 'resolve_attack', arguments: '{"gameId":"g1","targetId":"goblin-1","attackerModifier":2,"targetArmorClass":13,"damageDice":"1d6"}' } },
                { id: 'c2', type: 'function' as const, function: { name: 'grant_xp', arguments: '{"characterId":"char-1","amount":50}' } },
                { id: 'c3', type: 'function' as const, function: { name: 'advance_to_player_round', arguments: '{"gameId":"g1"}' } },
                { id: 'c4', type: 'function' as const, function: { name: 'end_combat', arguments: '{"gameId":"g1"}' } },
              ],
            },
          },
          { message: { role: 'assistant', content: 'El goblin cae muerto. Has ganado 50 XP.' } },
        ]);
        const toolCaller = new FakeToolCaller([], {
          resolve_attack: { hit: true, damage: 7 },
          grant_xp: { levelUp: false },
          advance_to_player_round: { advanced: true },
          end_combat: { combatEnded: true },
          get_game_state: {
            activeEncounter: { enemies: [{ instanceId: 'goblin-1', name: 'Goblin', currentHp: 0 }] },
          },
        });

        const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

        expect(result.narrative).toBe('El goblin cae muerto. Has ganado 50 XP.');
        // 2 llamadas SIN corrección: la que trae los tool_calls (ya dada) + la que
        // trae la narrativa final tras procesarlos. Una corrección real añadiría una 3ª.
        expect(chatClient.receivedCalls).toHaveLength(2);
      },
  );

  it(
      'en un combate con varios enemigos, si mata a uno (HP real 0) y otro enemigo distinto sigue vivo pero NO fue ' +
      'atacado este turno, no se dispara ningún aviso de victoria prematura (evita falsos positivos sobre un ' +
      'enemigo que sigue en pie legítimamente) -- tampoco se pide cerrar el combate porque no TODOS están derrotados',
      async () => {
        const chatClient = new FakeChatClient([
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'c1', type: 'function' as const, function: { name: 'resolve_attack', arguments: '{"gameId":"g1","targetId":"goblin-1","attackerModifier":2,"targetArmorClass":13,"damageDice":"1d6"}' } },
                { id: 'c2', type: 'function' as const, function: { name: 'grant_xp', arguments: '{"characterId":"char-1","amount":50}' } },
                { id: 'c3', type: 'function' as const, function: { name: 'advance_to_player_round', arguments: '{"gameId":"g1"}' } },
              ],
            },
          },
          { message: { role: 'assistant', content: 'El goblin cae muerto, pero su compañero sigue en pie.' } },
        ]);
        const toolCaller = new FakeToolCaller([], {
          resolve_attack: { hit: true, damage: 7 },
          grant_xp: { levelUp: false },
          advance_to_player_round: { advanced: true },
          get_game_state: {
            activeEncounter: {
              enemies: [
                { instanceId: 'goblin-1', name: 'Goblin', currentHp: 0 },
                { instanceId: 'goblin-2', name: 'Goblin', currentHp: 7 },
              ],
            },
          },
        });

        const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

        expect(result.narrative).toBe('El goblin cae muerto, pero su compañero sigue en pie.');
        expect(chatClient.receivedCalls).toHaveLength(2); // sin ronda de corrección extra
      },
  );

  it(
      'si TODOS los enemigos del combate están a 0 HP real pero no se llamó a end_combat, el seguro determinista ' +
      'de última instancia lo cierra directamente por código (sin pedírselo al modelo, ya no hace falta una ronda ' +
      'extra de corrección) -- caso real detectado en partida: el panel "Combate" y el marcador del Brown Bear ' +
      'derrotado se quedaban en el tablero indefinidamente, varias escenas después de acabar el combate',
      async () => {
        const chatClient = new FakeChatClient([
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'c1', type: 'function' as const, function: { name: 'resolve_attack', arguments: '{"gameId":"g1","targetId":"bear-1","attackerModifier":0,"targetArmorClass":11,"damageDice":"1d4","playerD20":19}' } },
                { id: 'c2', type: 'function' as const, function: { name: 'grant_xp', arguments: '{"characterId":"char-1","amount":200}' } },
                { id: 'c3', type: 'function' as const, function: { name: 'advance_to_player_round', arguments: '{"gameId":"g1"}' } },
              ],
            },
          },
          { message: { role: 'assistant', content: 'El oso cae muerto. Has ganado 200 XP.' } },
        ]);
        const toolCaller = new FakeToolCaller([], {
          resolve_attack: { hit: true, damage: 25 },
          grant_xp: { levelUp: false },
          advance_to_player_round: { advanced: true },
          end_combat: { combatEnded: true },
          get_game_state: {
            activeEncounter: { enemies: [{ instanceId: 'bear-1', name: 'Brown Bear', currentHp: 0 }] },
          },
        });

        const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

        // La narrativa del modelo se acepta tal cual -- cerrar el combate fantasma
        // es limpieza de estado por código (resolveStaleDefeatedEncounter), no algo
        // que el modelo tenga que volver a narrar.
        expect(result.narrative).toBe('El oso cae muerto. Has ganado 200 XP.');
        // 4 get_game_state antes de end_combat: checkCombatStateNudge (victoria
        // prematura, no aplica -- HP real ya es 0), protocolNudge/needsTurnChecks
        // (resolvedPlayerAttack sin end_player_turn), resolveMissingEndPlayerTurn
        // (mismo motivo) y el chequeo anti-atasco de fase de enemigos al final del
        // turno -- ninguno de los cuatro dispara nada (el mock no tiene
        // turnClaims/roundPhase pendientes), solo comprueban el estado real.
        expect(toolCaller.calls.map((c) => c.name)).toEqual([
          'resolve_attack', 'grant_xp', 'advance_to_player_round',
          'get_game_state', 'get_game_state', 'get_game_state', 'get_game_state',
          'end_combat',
        ]);
        expect(result.events).toEqual([
          { type: 'ataque_resuelto', payload: { hit: true, damage: 25 } },
          { type: 'xp_otorgada', payload: { levelUp: false } },
          { type: 'ronda_reabierta', payload: { advanced: true } },
          { type: 'combate_terminado', payload: {} },
        ]);
        // Sin ronda de corrección extra: el modelo acierta a la primera y cerrar
        // el combate no necesita pedirle nada más.
        expect(chatClient.receivedCalls).toHaveLength(2);
      },
  );

  it(
      'si se llama a grant_xp sin haber resuelto ningún ataque este turno (ej. XP por completar una misión), no ' +
      'se dispara ningún aviso de victoria prematura (checkCombatStateNudge exige que se haya atacado a algún ' +
      'enemigo este turno)',
      async () => {
        const chatClient = new FakeChatClient([
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'grant_xp', arguments: '{"characterId":"char-1","amount":100}' } }],
            },
          },
          { message: { role: 'assistant', content: 'Habéis completado la misión. Ganáis 100 XP.' } },
        ]);
        const toolCaller = new FakeToolCaller([], { grant_xp: { levelUp: false } });

        const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

        expect(result.narrative).toBe('Habéis completado la misión. Ganáis 100 XP.');
        // get_game_state SÍ se llama, pero solo por el seguro de combate huérfano
        // incondicional al final del turno -- no por ningún aviso relacionado con grant_xp.
        expect(toolCaller.calls.map((c) => c.name)).toEqual(['grant_xp', 'get_game_state']);
      },
  );

  describe('NoMutationYetError -- distinguir fallos de DeepSeek según si ya se llamó a alguna tool', () => {
    it('si la PRIMERA llamada a createCompletion falla (antes de cualquier tool), lanza NoMutationYetError', async () => {
      const chatClient = new ThrowingChatClient([new Error('DeepSeek: 429 rate limited')]);
      const toolCaller = new FakeToolCaller();

      await expect(
        runDmTurn(chatClient, toolCaller, [{ role: 'user', content: 'Atacar' }], 'g1'),
      ).rejects.toBeInstanceOf(NoMutationYetError);
      expect(toolCaller.calls).toHaveLength(0);
    });

    it('si createCompletion falla DESPUÉS de haber llamado a alguna tool, lanza el error tal cual (no NoMutationYetError)', async () => {
      const chatClient = new ThrowingChatClient([
        {
          message: {
            role: 'assistant', content: null,
            tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'roll_dice', arguments: '{"notation":"1d20"}' } }],
          },
        },
        new Error('DeepSeek: 500 fallo transitorio'),
      ]);
      const toolCaller = new FakeToolCaller([], { roll_dice: { result: 14 } });

      await expect(
        runDmTurn(chatClient, toolCaller, [{ role: 'user', content: 'Tiro para percibir' }], 'g1'),
      ).rejects.toThrow('DeepSeek: 500 fallo transitorio');
      // Confirma que NO es un NoMutationYetError (ya se había llamado a roll_dice):
      try {
        await runDmTurn(
          new ThrowingChatClient([
            {
              message: {
                role: 'assistant', content: null,
                tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'roll_dice', arguments: '{"notation":"1d20"}' } }],
              },
            },
            new Error('DeepSeek: 500 fallo transitorio'),
          ]),
          new FakeToolCaller([], { roll_dice: { result: 14 } }),
          [{ role: 'user', content: 'Tiro para percibir' }],
          'g1',
        );
        throw new Error('debería haber lanzado');
      } catch (err) {
        expect(err).not.toBeInstanceOf(NoMutationYetError);
      }
    });
  });

  describe('combate resuelto por texto libre sin NINGUNA tool real (bug real: "Atacar" -> 3 goblins muertos sin start_combat/resolve_attack/cast_spell)', () => {
    it('si la narrativa da por muerto a alguien pero no se llamó a ninguna tool de combate, se corrige', async () => {
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: 'Lanzas un misil mágico. El goblin cae muerto al instante.' } },
        { message: { role: 'assistant', content: '¡Tira los dados! (corregido: sin resolve_attack todavía)' } },
      ]);
      const toolCaller = new FakeToolCaller();

      // Historial vacío (no de 1 solo mensaje): con exactamente 1 mensaje,
      // gameStartNudge domina el turno con su propio aviso de arranque
      // (taberna/tablón) antes de que este aviso llegue siquiera a evaluarse.
      const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

      expect(result.narrative).toBe('¡Tira los dados! (corregido: sin resolve_attack todavía)');
      expect(chatClient.receivedCalls).toHaveLength(2);
      const correctionMessages = chatClient.receivedCalls[1].messages;
      const correctionMessage = correctionMessages[correctionMessages.length - 1];
      expect(correctionMessage?.content).toMatch(/start_combat|resolve_attack|cast_spell/);
    });

    it('si SÍ se llamó a una tool de combate real (start_combat) y se colocó a su enemigo, no se corrige aunque la narrativa mencione una muerte', async () => {
      const chatClient = new FakeChatClient([
        {
          message: {
            role: 'assistant', content: null,
            tool_calls: [
              { id: 'c1', type: 'function' as const, function: { name: 'start_combat', arguments: '{"gameId":"g1","enemyIds":["enemy-1"]}' } },
              { id: 'c2', type: 'function' as const, function: { name: 'place_participant', arguments: '{"gameId":"g1","participantId":"enc-1-a","row":0,"col":0}' } },
            ],
          },
        },
        { message: { role: 'assistant', content: 'El combate empieza. Un goblin cae muerto en la primera embestida.' } },
      ]);
      const toolCaller = new FakeToolCaller([], {
        start_combat: { enemies: [{ instanceId: 'enc-1-a' }] },
        place_participant: { placed: true },
      });

      // Historial vacío por el mismo motivo que en el test anterior (evitar gameStartNudge).
      const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

      expect(result.narrative).toBe('El combate empieza. Un goblin cae muerto en la primera embestida.');
      expect(chatClient.receivedCalls).toHaveLength(2); // 1 con el tool_call + 1 con la narrativa final, SIN corrección
    });
  });

  describe(
      'start_combat rechazado por un combate huérfano ya activo (bug real: DM narra un Cocodrilo Gigante en el ' +
      'Túmulo del Héroe Caído, pero el tablero cambia de golpe a 2 cocodrilos normales en otro mapa nunca narrado)',
      () => {
        /** start_combat falla la primera vez (combate huérfano ya activo) y
         * tiene éxito a partir de la segunda (tras cerrarlo con end_combat). */
        class OrphanEncounterToolCaller implements ToolCaller {
          public readonly calls: { name: string; args: Record<string, unknown> }[] = [];
          private startCombatAttempts = 0;
          async listTools(): Promise<McpToolInfo[]> { return []; }
          async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
            this.calls.push({ name, args });
            if (name === 'start_combat') {
              this.startCombatAttempts += 1;
              if (this.startCombatAttempts === 1) {
                throw new Error('Ya hay un combate activo');
              }
              return { enemies: [{ instanceId: 'giant-croc-1' }] };
            }
            if (name === 'end_combat') return { combatEnded: true };
            if (name === 'place_participant') return { placed: true };
            return {};
          }
        }

        it('si start_combat falla con "Ya hay un combate activo", se fuerza a cerrar el huérfano con end_combat y arrancar de nuevo con los enemigos reales', async () => {
          const chatClient = new FakeChatClient([
            {
              message: {
                role: 'assistant', content: null,
                tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'start_combat', arguments: '{"gameId":"g1","enemyIds":["giant-crocodile"]}' } }],
              },
            },
            { message: { role: 'assistant', content: 'El sistema dice que ya hay un combate activo con otros enemigos.' } },
            {
              message: {
                role: 'assistant', content: null,
                tool_calls: [
                  { id: 'c2', type: 'function' as const, function: { name: 'end_combat', arguments: '{"gameId":"g1"}' } },
                  { id: 'c3', type: 'function' as const, function: { name: 'start_combat', arguments: '{"gameId":"g1","enemyIds":["giant-crocodile"]}' } },
                  { id: 'c4', type: 'function' as const, function: { name: 'place_participant', arguments: '{"gameId":"g1","participantId":"giant-croc-1","row":0,"col":0}' } },
                ],
              },
            },
            { message: { role: 'assistant', content: 'Cerráis el combate fantasma. El Cocodrilo Gigante os ataca de verdad.' } },
          ]);
          const toolCaller = new OrphanEncounterToolCaller();

          // NOTA: se usa un historial largo (>1 mensaje, más allá de
          // VILLAGE_START_MAX_MESSAGES) a propósito -- con un solo mensaje,
          // messages.length sería 1 y gameStartNudge ("primerísimo turno de
          // la partida") se disparaba SIEMPRE antes que este aviso, dominando
          // por completo el bucle de correcciones y haciendo que este test en
          // realidad nunca ejercitara staleEncounterConflictNudge.
          const messages = ongoingGameHistory('Nos preparamos para luchar');
          const result = await runDmTurn(chatClient, toolCaller, messages, 'g1');

          expect(result.narrative).toBe('Cerráis el combate fantasma. El Cocodrilo Gigante os ataca de verdad.');
          // 'get_game_state' se cuela antes de end_combat: antes de asumir que
          // es un huérfano, el aviso comprueba el estado real de la partida
          // (ver staleEncounterConflictNudge) -- aquí devuelve {} (sin
          // activeEncounter), así que no coincide con nada y se sigue tratando
          // como huérfano, igual que antes.
          const callNames = toolCaller.calls.map((c) => c.name);
          expect(callNames.indexOf('get_game_state')).toBeLessThan(callNames.indexOf('end_combat'));
          expect(callNames).toEqual(expect.arrayContaining(['start_combat', 'end_combat', 'start_combat', 'place_participant']));
          const correctionCall = chatClient.receivedCalls.find((c) => {
            const last = c.messages[c.messages.length - 1];
            return typeof last.content === 'string' && /end_combat/.test(last.content) && /combate activo/i.test(last.content);
          });
          expect(correctionCall).toBeDefined();
        });

        it('si el combate ya activo tiene EXACTAMENTE los mismos enemigos que se intentó pasar a start_combat, no se cierra ni se reinicia (bug real: Giant Boar ya en combate, el DM vuelve a llamar a start_combat solo para fijar el mapa)', async () => {
          class SameEncounterToolCaller implements ToolCaller {
            public readonly calls: { name: string; args: Record<string, unknown> }[] = [];
            async listTools(): Promise<McpToolInfo[]> { return []; }
            async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
              this.calls.push({ name, args });
              if (name === 'start_combat') {
                throw new Error('Ya hay un combate activo');
              }
              if (name === 'get_game_state') {
                return { activeEncounter: { enemies: [{ instanceId: 'giant-boar-1', enemyRefId: 'giant-boar', currentHp: 42 }] } };
              }
              if (name === 'set_battle_map') return { applied: true };
              return {};
            }
          }
          const chatClient = new FakeChatClient([
            {
              message: {
                role: 'assistant', content: null,
                tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'start_combat', arguments: '{"gameId":"g1","enemyIds":["giant-boar"],"mapId":"pantano-rey"}' } }],
              },
            },
            {
              message: {
                role: 'assistant', content: null,
                tool_calls: [{ id: 'c2', type: 'function' as const, function: { name: 'set_battle_map', arguments: '{"gameId":"g1","mapId":"pantano-rey"}' } }],
              },
            },
            { message: { role: 'assistant', content: 'El combate sigue en curso contra el Giant Boar, ahora en el pantano.' } },
          ]);
          const toolCaller = new SameEncounterToolCaller();

          // Mismo motivo que en el test del huérfano real: historial largo
          // para que gameStartNudge no domine el bucle de correcciones.
          const messages = ongoingGameHistory('Si, lo lanzo');
          const result = await runDmTurn(chatClient, toolCaller, messages, 'g1');

          expect(result.narrative).toBe('El combate sigue en curso contra el Giant Boar, ahora en el pantano.');
          // NUNCA debe llamarse a end_combat: el combate no es huérfano, es el mismo.
          expect(toolCaller.calls.some((c) => c.name === 'end_combat')).toBe(false);
          expect(toolCaller.calls.map((c) => c.name)).toEqual(expect.arrayContaining(['start_combat', 'get_game_state', 'set_battle_map']));
          const correctionCall = chatClient.receivedCalls.find((c) => {
            const last = c.messages[c.messages.length - 1];
            return typeof last.content === 'string' && /mismo combate|no.*cierres|set_battle_map/i.test(last.content);
          });
          expect(correctionCall).toBeDefined();
        });

        it('si start_combat falla por otro motivo distinto (no "ya hay un combate activo"), no se dispara este aviso específico', async () => {
          const chatClient = new FakeChatClient([
            {
              message: {
                role: 'assistant', content: null,
                tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'start_combat', arguments: '{"gameId":"g1","enemyIds":["enemigo-inexistente"]}' } }],
              },
            },
            { message: { role: 'assistant', content: 'Sigo narrando pese al fallo, sin combate real.' } },
          ]);
          const toolCaller = new FakeToolCaller([], {}, { start_combat: 'Enemigo enemigo-inexistente no encontrado en el catálogo' });

          // Historial vacío para evitar que gameStartNudge domine el turno (ver
          // los otros dos tests de este mismo describe block).
          const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

          // Este texto no menciona ninguna muerte/derrota, así que tampoco debería
          // disparar combatWithoutToolsNudge -- ningún aviso en absoluto.
          expect(result.narrative).toBe('Sigo narrando pese al fallo, sin combate real.');
          expect(chatClient.receivedCalls).toHaveLength(2);
        });
      },
  );

  describe('resultados de combate inventados por el modelo', () => {
    // CASO REAL (partida prueba2): tras "**Tablet:** 🎲 tira 1d20: **16**" el
    // DM escribió él mismo "⚔️ Tablet ataca a Zombie con su gran espada
    // (1d20+5): 16 vs CA 8 → impacta. Daño: 13" SIN llamar a resolve_attack:
    // el Zombie siguió con 22 HP, nadie cerró el turno de Tablet y la ronda
    // no pasó nunca a la fase de enemigos (el Zombie "se quedaba ahí").
    const fakeLine = '⚔️ **Tablet** ataca a **Zombie** con su gran espada (1d20+5): **16** vs CA 8 → **impacta**. ' +
        'Daño: **13** — **Zombie** sigue en pie.\n\nEl acero se hunde en el hombro del Zombie.';

    function corrections(chatClient: FakeChatClient): string[] {
      return chatClient.receivedCalls
          .map((c) => c.messages[c.messages.length - 1])
          .filter((m) => m.role === 'system' && typeof m.content === 'string' && /^Nota interna de corrección/.test(m.content))
          .map((m) => m.content as string);
    }

    it('si el DM escribe una línea de tirada/daño sin llamar a resolve_attack, se le obliga a resolverla de verdad', async () => {
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: fakeLine } },
        {
          message: {
            role: 'assistant', content: null,
            tool_calls: [{
              id: 'c1', type: 'function' as const,
              function: { name: 'resolve_attack', arguments: '{"gameId":"g1","targetId":"z1","attackerName":"Tablet","attackerModifier":5,"targetArmorClass":8,"damageDice":"2d6+3","playerD20":16}' },
            }],
          },
        },
        { message: { role: 'assistant', content: 'El acero se hunde en el hombro del Zombie.' } },
      ]);
      const toolCaller = new FakeToolCaller([], {
        resolve_attack: { hit: true, attackRoll: 21, damage: 9, targetRemainingHp: 13, targetDefeated: false },
      });

      const result = await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Tablet:** 🎲 tira 1d20: **16**'), 'g1');

      expect(corrections(chatClient).some((t) => /resolve_attack/.test(t) && /sistema/.test(t))).toBe(true);
      expect(toolCaller.calls.some((c) => c.name === 'resolve_attack')).toBe(true);
      expect(result.narrative).toBe('El acero se hunde en el hombro del Zombie.');
    });

    it('si pese a los avisos el DM sigue inventando la tirada, esa línea falsa no llega al chat', async () => {
      const chatClient = new FakeChatClient([{ message: { role: 'assistant', content: fakeLine } }]);
      const toolCaller = new FakeToolCaller();

      const result = await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Tablet:** 🎲 tira 1d20: **16**'), 'g1');

      expect(result.narrative).not.toMatch(/vs CA 8/);
      expect(result.narrative).not.toMatch(/Daño: \*\*13/);
      expect(result.narrative).toContain('El acero se hunde en el hombro del Zombie.');
    });

    it('una narración normal que menciona el daño de un golpe anterior no se toma por inventada', async () => {
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: 'El Zombie, aún tambaleándose por los 13 puntos de daño de antes, gruñe.' } },
      ]);
      const toolCaller = new FakeToolCaller();

      await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Tablet:** Miro al zombie'), 'g1');

      expect(corrections(chatClient).some((t) => /resolve_attack/.test(t) && /sistema/.test(t))).toBe(false);
    });
  });

  describe('fase de enemigos tras el último jugador', () => {
    // El aviso de "resuelve a los enemigos" solo saltaba si ESTE turno había
    // un ataque resuelto con resolve_attack. Si el último jugador en actuar
    // lanzaba un hechizo (cast_spell) y el DM cerraba su turno, la fase pasaba
    // a 'enemigos' sin aviso y el seguro anti-atasco reabría la ronda sin que
    // los enemigos llegasen a atacar.
    it('tras cerrar el turno del último jugador (con un hechizo), se le pide al DM resolver a los enemigos', async () => {
      const chatClient = new FakeChatClient([
        {
          message: {
            role: 'assistant', content: null,
            tool_calls: [
              { id: 'c1', type: 'function' as const, function: { name: 'cast_spell', arguments: '{"gameId":"g1","casterCharacterId":"char-1","spellId":"magic-missile","targetId":"rat-1"}' } },
              { id: 'c2', type: 'function' as const, function: { name: 'end_player_turn', arguments: '{"gameId":"g1","characterId":"char-1"}' } },
            ],
          },
        },
        { message: { role: 'assistant', content: 'Los proyectiles fulminan a la rata. El Zombie alza sus brazos para atacar.' } },
      ]);
      const toolCaller = new FakeToolCaller([], {
        cast_spell: { spellName: 'Magic Missile', damageDealt: 9, targetSavedThrow: null, targetRemainingHp: 0, targetDefeated: true },
        get_game_state: {
          players: [{ characterId: 'char-1', name: 'Movil' }],
          activeEncounter: { roundPhase: 'enemigos', turnClaims: [], enemies: [{ instanceId: 'z1', name: 'Zombie', currentHp: 22 }] },
          mapHistory: [],
        },
      });

      await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Movil:** Lanzo proyectil mágico a la rata'), 'g1');

      const correctionTexts = chatClient.receivedCalls
          .map((c) => c.messages[c.messages.length - 1])
          .filter((m) => m.role === 'system' && typeof m.content === 'string')
          .map((m) => m.content as string);
      expect(correctionTexts.some((t) => /fase de ENEMIGOS/.test(t))).toBe(true);
    });
  });

  describe('turnos de combate visibles (partida prueba2)', () => {
    /** get_game_state con estado: la fase cambia cuando se cierra la ronda o se reabre. */
    class CombatToolCaller extends FakeToolCaller {
      phase: 'jugadores' | 'enemigos';
      acted: string[];
      constructor(phase: 'jugadores' | 'enemigos', acted: string[]) {
        super();
        this.phase = phase;
        this.acted = acted;
      }
      async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        this.calls.push({ name, args });
        if (name === 'get_game_state') {
          return {
            players: [
              { characterId: 'char-1', name: 'Movil', currentHp: 14 },
              { characterId: 'char-2', name: 'Tablet', currentHp: 20 },
            ],
            mapHistory: [],
            activeEncounter: {
              roundPhase: this.phase, actedThisRound: this.acted, turnClaims: [],
              enemies: [{ instanceId: 'z1', name: 'Zombie', currentHp: 18 }],
            },
          };
        }
        if (name === 'end_player_turn') {
          this.acted = [...this.acted, String(args['characterId'])];
          if (this.acted.length >= 2) this.phase = 'enemigos';
          return { ended: true };
        }
        if (name === 'advance_to_player_round') {
          this.phase = 'jugadores';
          this.acted = [];
          return { advanced: true };
        }
        if (name === 'resolve_enemy_attack') {
          return { hit: false, attackRoll: 9, damage: 0, attackName: 'Golpe', targetRemainingHp: 20, targetDefeated: false };
        }
        if (name === 'resolve_attack') {
          return { hit: true, attackRoll: 18, damage: 4, targetRemainingHp: 18, targetDefeated: false };
        }
        return {};
      }
    }

    const movilAttack = {
      message: {
        role: 'assistant' as const, content: null,
        tool_calls: [
          { id: 'a1', type: 'function' as const, function: { name: 'resolve_attack', arguments: '{"gameId":"g1","targetId":"z1","attackerName":"Movil","attackerModifier":2,"targetArmorClass":8,"damageDice":"1d6","playerD20":16}' } },
          { id: 'a2', type: 'function' as const, function: { name: 'end_player_turn', arguments: '{"gameId":"g1","characterId":"char-1"}' } },
        ],
      },
    };

    function systemNotes(chatClient: FakeChatClient): string[] {
      return chatClient.receivedCalls
          .map((c) => c.messages[c.messages.length - 1])
          .filter((m) => m.role === 'system' && typeof m.content === 'string' && /^Nota interna de corrección/.test(m.content))
          .map((m) => m.content as string);
    }

    it('CASO REAL: si el DM narra un ataque del enemigo cuando aún le toca a otro jugador, se le corrige', async () => {
      const chatClient = new FakeChatClient([
        movilAttack,
        { message: { role: 'assistant', content: 'La vara de Movil golpea al Zombie en la sien. El Zombie se yergue de nuevo y lanza otro zarpazo torpe contra Tablet, chocando contra su guardia.' } },
        { message: { role: 'assistant', content: 'La vara de Movil golpea al Zombie en la sien. ¿Qué haces, Tablet?' } },
      ]);
      const toolCaller = new CombatToolCaller('jugadores', []);

      const result = await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Movil:** 🎲 tira 1d20: **16**'), 'g1');

      expect(systemNotes(chatClient).some((t) => /Zombie/.test(t) && /Tablet/.test(t) && /todav[ií]a/.test(t))).toBe(true);
      expect(result.narrative).toContain('¿Qué haces, Tablet?');
    });

    it('al cerrar el turno de un jugador, el chat dice a quién le toca si el DM no lo ha dicho', async () => {
      const chatClient = new FakeChatClient([
        movilAttack,
        { message: { role: 'assistant', content: 'La vara de Movil golpea al Zombie en la sien.' } },
      ]);
      const toolCaller = new CombatToolCaller('jugadores', []);

      const result = await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Movil:** 🎲 tira 1d20: **16**'), 'g1');

      expect(result.narrative).toMatch(/👉 \*\*Tablet\*\*, es tu turno\. ¿Qué haces\?$/);
    });

    it('no repite el aviso de turno si el DM ya le ha preguntado a ese jugador', async () => {
      const chatClient = new FakeChatClient([
        movilAttack,
        { message: { role: 'assistant', content: 'La vara de Movil golpea al Zombie. Tablet, ¿qué haces?' } },
      ]);
      const toolCaller = new CombatToolCaller('jugadores', []);

      const result = await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Movil:** 🎲 tira 1d20: **16**'), 'g1');

      expect(result.narrative).not.toContain('👉');
    });

    it('si la ronda acaba en la fase de enemigos sin resolverla, el sistema tira por cada enemigo vivo y reabre la ronda', async () => {
      const chatClient = new FakeChatClient([
        movilAttack,
        { message: { role: 'assistant', content: 'La vara de Movil golpea al Zombie en la sien.' } },
      ]);
      // Tablet ya actuó en esta ronda: al cerrar el turno de Movil, la fase pasa a 'enemigos'.
      const toolCaller = new CombatToolCaller('jugadores', ['char-2']);

      const result = await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Movil:** 🎲 tira 1d20: **16**'), 'g1');

      const names = toolCaller.calls.map((c) => c.name);
      const enemyAttack = toolCaller.calls.find((c) => c.name === 'resolve_enemy_attack');
      expect(enemyAttack?.args).toEqual(expect.objectContaining({ gameId: 'g1', enemyInstanceId: 'z1' }));
      expect(['char-1', 'char-2']).toContain(enemyAttack?.args['targetCharacterId']);
      expect(names.lastIndexOf('advance_to_player_round')).toBeGreaterThan(names.indexOf('resolve_enemy_attack'));
      expect(result.narrative).toMatch(/👉 \*\*Movil\*\* y \*\*Tablet\*\*, os toca\. ¿Qué hacéis\?$/);
      expect(result.events.some((e) => e.type === 'ataque_resuelto')).toBe(true);
    });
  });

  describe('tiradas de jugador sin resolver y turno equivocado (partida prueba2)', () => {
    class RoundToolCaller extends FakeToolCaller {
      phase: 'jugadores' | 'enemigos' = 'jugadores';
      constructor(public acted: string[], public claims: string[], private zombieHp = 13) {
        super();
      }
      async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        this.calls.push({ name, args });
        if (name === 'get_game_state') {
          return {
            players: [
              { characterId: 'char-1', name: 'Movil', currentHp: 14 },
              { characterId: 'char-2', name: 'Tablet', currentHp: 20 },
            ],
            mapHistory: [],
            activeEncounter: {
              roundPhase: this.phase, actedThisRound: this.acted, turnClaims: this.claims,
              enemies: [
                { instanceId: 'z1', name: 'Zombie', currentHp: this.zombieHp },
                { instanceId: 'r1', name: 'Rata Gigante', currentHp: 0 },
              ],
            },
          };
        }
        if (name === 'resolve_player_attack') {
          this.zombieHp -= 9;
          return { hit: true, attackRoll: 19, damage: 9, weaponName: 'Espadón', targetRemainingHp: this.zombieHp, targetDefeated: false };
        }
        if (name === 'end_player_turn') {
          const id = String(args['characterId']);
          this.claims = this.claims.filter((c) => c !== id);
          this.acted = [...this.acted, id];
          if (this.acted.length >= 2) this.phase = 'enemigos';
          return { ended: true };
        }
        if (name === 'resolve_enemy_attack') {
          return { hit: false, attackRoll: 7, damage: 0, attackName: 'Golpe', targetRemainingHp: 20, targetDefeated: false };
        }
        if (name === 'advance_to_player_round') {
          this.phase = 'jugadores';
          this.acted = [];
          return { advanced: true };
        }
        return {};
      }
    }

    const prose = { message: { role: 'assistant' as const, content: 'El filo de Tablet desciende en diagonal sobre el Zombie, abriéndole una brecha profunda. Es el turno de Movil. ¿Qué haces?' } };

    function notes(chatClient: FakeChatClient): string[] {
      return chatClient.receivedCalls
          .map((c) => c.messages[c.messages.length - 1])
          .filter((m) => m.role === 'system' && typeof m.content === 'string' && /^Nota interna de corrección/.test(m.content))
          .map((m) => m.content as string);
    }

    it('CASO REAL: si el DM narra la tirada del jugador sin resolverla, se le pide resolve_player_attack con esa tirada', async () => {
      const chatClient = new FakeChatClient([
        prose,
        {
          message: {
            role: 'assistant', content: null,
            tool_calls: [
              { id: 'p1', type: 'function' as const, function: { name: 'resolve_player_attack', arguments: '{"gameId":"g1","attackerCharacterId":"char-2","targetId":"z1","playerD20":14}' } },
              { id: 'p2', type: 'function' as const, function: { name: 'end_player_turn', arguments: '{"gameId":"g1","characterId":"char-2"}' } },
            ],
          },
        },
        { message: { role: 'assistant', content: 'El espadón de Tablet se hunde en el Zombie.' } },
      ]);
      const toolCaller = new RoundToolCaller([], ['char-2']);

      await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Tablet:** 🎲 tira 1d20: **14**'), 'g1');

      expect(notes(chatClient).some((t) => /resolve_player_attack/.test(t) && /playerD20=14/.test(t) && /Tablet/.test(t))).toBe(true);
      expect(toolCaller.calls.filter((c) => c.name === 'resolve_player_attack')).toHaveLength(1);
    });

    it('si el DM sigue sin resolverla, el sistema resuelve el ataque con la tirada del jugador y cierra su turno', async () => {
      const chatClient = new FakeChatClient([prose]);
      const toolCaller = new RoundToolCaller(['char-1'], ['char-2']);

      const result = await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Tablet:** 🎲 tira 1d20: **14**'), 'g1');

      const attack = toolCaller.calls.find((c) => c.name === 'resolve_player_attack');
      expect(attack?.args).toEqual({ gameId: 'g1', attackerCharacterId: 'char-2', targetId: 'z1', playerD20: 14 });
      expect(toolCaller.calls.some((c) => c.name === 'end_player_turn' && c.args['characterId'] === 'char-2')).toBe(true);
      // La narración inventada (y el "turno de Movil", que ya había actuado) se sustituye por una coherente con la tirada real.
      expect(result.narrative).not.toContain('brecha profunda');
      expect(result.narrative).toContain('**Tablet**');
      expect(result.narrative).toContain('**Zombie**');
      // Movil y Tablet ya han actuado: el Zombie ataca con su tirada y se abre una ronda nueva.
      expect(toolCaller.calls.some((c) => c.name === 'resolve_enemy_attack')).toBe(true);
      expect(result.narrative).toMatch(/👉 \*\*Movil\*\* y \*\*Tablet\*\*, os toca\. ¿Qué hacéis\?$/);
    });

    it('CASO REAL: si el DM le da el turno a quien ya actuó ("Tienes razón, el turno es de Movil"), se le corrige', async () => {
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: 'Tienes razón, el turno es de Movil.\n\nMovil, ¿qué haces?' } },
        { message: { role: 'assistant', content: 'Movil ya ha actuado esta ronda.\n\nTablet, ¿qué haces?' } },
      ]);
      const toolCaller = new RoundToolCaller(['char-1'], ['char-2']);

      const result = await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Tablet:** Es el turno de móvil, no el mío'), 'g1');

      expect(notes(chatClient).some((t) => /Movil/.test(t) && /ya ha actuado/.test(t) && /Tablet/.test(t))).toBe(true);
      expect(result.narrative).toBe('Movil ya ha actuado esta ronda.\n\nTablet, ¿qué haces?');
    });

    it('si pese al aviso sigue dando el turno a quien ya actuó, el chat aclara a quién le toca', async () => {
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: 'Tienes razón, el turno es de Movil.\n\nMovil, ¿qué haces?' } },
      ]);
      const toolCaller = new RoundToolCaller(['char-1'], ['char-2']);

      const result = await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Tablet:** Es el turno de móvil, no el mío'), 'g1');

      expect(result.narrative).toMatch(/👉 \*\*Tablet\*\*, es tu turno\. ¿Qué haces\?$/);
    });
  });

  describe('salidas reales entre mapas (connections)', () => {
    const sotanoConnections = [
      { mapId: 'tabernaMercenarios', via: 'la escalera de caracol que sube a la cocina de la taberna' },
      { mapId: 'cueva-rio', via: 'la trampilla candada del Almacén del Sótano 2, que baja por un túnel a las cuevas' },
      { mapId: 'cueva-rio-alt', via: 'la trampilla candada del Almacén del Sótano 2, que baja por un túnel a las cuevas' },
    ];
    const sotanoDescription = {
      mapId: 'sotanoTaberna',
      zones: [{ name: 'Almacén del Sótano 2', cells: [{ rowStart: 14, rowEnd: 27, colStart: 6, colEnd: 20 }] }],
      connections: sotanoConnections,
      closedExits: true,
    };

    function correctionTexts(chatClient: FakeChatClient): string[] {
      return chatClient.receivedCalls
          .map((c) => c.messages[c.messages.length - 1])
          .filter((m) => m.role === 'system' && typeof m.content === 'string' && /^Nota interna de corrección/.test(m.content))
          .map((m) => m.content as string);
    }

    // CASO REAL: desde el sótano el DM inventó una "puerta de hierro" y
    // acabó en la cripta. Ahora, si el jugador sale por una salida real del
    // mapa (la trampilla), el aviso nombra el mapId exacto al que lleva y,
    // si el modelo sigue sin aplicarlo, el propio código lo aplica.
    it('"Bajamos por la trampilla" desde el sótano: el aviso nombra las cuevas y el seguro aplica el mapa', async () => {
      const narration = { message: { role: 'assistant' as const, content: 'Bajáis por la trampilla y llegáis a una cueva húmeda donde corre un río.' } };
      const chatClient = new FakeChatClient([narration, narration, narration]);
      const toolCaller = new FakeToolCaller([], {
        get_game_state: { players: [{ characterId: 'char-1' }], mapHistory: ['tabernaMercenarios', 'sotanoTaberna'], activeEncounter: null },
        describe_map: sotanoDescription,
        set_battle_map: { applied: true },
      });

      await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Movil:** Abrimos la trampilla y bajamos por ella'), 'g1');

      expect(correctionTexts(chatClient).some((t) => /cueva-rio/.test(t) && /trampilla/.test(t))).toBe(true);
      const setCalls = toolCaller.calls.filter((c) => c.name === 'set_battle_map');
      expect(setCalls).toHaveLength(1);
      expect(['cueva-rio', 'cueva-rio-alt']).toContain(setCalls[0].args['mapId']);
    });

    it('si el DM solo busca mapas pero no aplica ninguno al bajar al sótano, también se le avisa con el mapId real', async () => {
      const chatClient = new FakeChatClient([
        {
          message: {
            role: 'assistant', content: null,
            tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'get_battle_maps', arguments: '{"tags":["sotano"]}' } }],
          },
        },
        { message: { role: 'assistant', content: 'Bajáis las escaleras hasta el sótano, lleno de barriles.' } },
        {
          message: {
            role: 'assistant', content: null,
            tool_calls: [{ id: 'c2', type: 'function' as const, function: { name: 'set_battle_map', arguments: '{"gameId":"g1","mapId":"sotanoTaberna"}' } }],
          },
        },
        { message: { role: 'assistant', content: 'Bajáis las escaleras hasta el sótano, lleno de barriles.' } },
      ]);
      const toolCaller = new FakeToolCaller([], {
        get_game_state: { players: [{ characterId: 'char-1' }], mapHistory: ['tabernaMercenarios'], activeEncounter: null },
        describe_map: {
          mapId: 'tabernaMercenarios', zones: [],
          connections: [{ mapId: 'sotanoTaberna', via: 'la escalera junto a la cocina que baja al sótano' }],
          closedExits: false,
        },
        get_battle_maps: [{ id: 'sotanoTaberna', name: 'Sótano de la Taberna', description: '' }],
        set_battle_map: { applied: true },
      });

      await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Movil:** Bajamos al sótano'), 'g1');

      expect(correctionTexts(chatClient).some((t) => /sotanoTaberna/.test(t))).toBe(true);
      expect(toolCaller.calls.filter((c) => c.name === 'set_battle_map').map((c) => c.args['mapId'])).toEqual(['sotanoTaberna']);
    });

    it('en pleno combate no se cambia el mapa por código aunque el jugador hable de la trampilla', async () => {
      const narration = { message: { role: 'assistant' as const, content: 'Intentáis bajar por la trampilla, pero el zombie os corta el paso.' } };
      const chatClient = new FakeChatClient([narration, narration, narration]);
      const toolCaller = new FakeToolCaller([], {
        get_game_state: {
          players: [{ characterId: 'char-1' }], mapHistory: ['sotanoTaberna'],
          activeEncounter: { enemies: [{ instanceId: 'z1', currentHp: 22 }], roundPhase: 'jugadores' },
        },
        describe_map: sotanoDescription,
      });

      await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Movil:** Bajamos por la trampilla'), 'g1');

      expect(toolCaller.calls.some((c) => c.name === 'set_battle_map')).toBe(false);
    });
  });

  describe('combate anunciado sin start_combat (partida prueba2 del molino)', () => {
    // CASO REAL: el DM narró "¡Goblins! ... ¡Empieza el combate! Movil, ¿qué
    // hace tu personaje?" sin llamar a start_combat: el tablero no mostró a
    // ningún enemigo hasta el turno siguiente, y entonces solo con UNO.
    it('si la narración da el combate por empezado y no hay combate activo, se le pide start_combat', async () => {
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: 'Del mecanismo caen tres criaturas: ¡Goblins! ¡Empieza el combate! Movil, ¿qué hace tu personaje?' } },
        {
          message: {
            role: 'assistant', content: null,
            tool_calls: [{ id: 's1', type: 'function' as const, function: { name: 'start_combat', arguments: '{"gameId":"g1","enemyIds":["goblin","goblin","goblin"]}' } }],
          },
        },
        { message: { role: 'assistant', content: 'Tres goblins caen del mecanismo. ¡Empieza el combate!' } },
      ]);
      const toolCaller = new FakeToolCaller([], {
        get_game_state: { players: [{ characterId: 'char-1', name: 'Movil' }], activeEncounter: null, mapHistory: [] },
        start_combat: { started: true, enemies: [{ instanceId: 'g-1' }, { instanceId: 'g-2' }, { instanceId: 'g-3' }] },
      });

      await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Movil:** Bajamos a la sala de molienda'), 'g1');

      const notes = chatClient.receivedCalls
          .map((c) => c.messages[c.messages.length - 1])
          .filter((m) => m.role === 'system' && typeof m.content === 'string' && /^Nota interna de corrección/.test(m.content))
          .map((m) => m.content as string);
      expect(notes.some((t) => /start_combat/.test(t) && /no hay ningún combate activo/.test(t))).toBe(true);
      expect(toolCaller.calls.some((c) => c.name === 'start_combat')).toBe(true);
    });

    it('no avisa si el combate ya estaba en marcha', async () => {
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: 'El goblin grita: ¡que empiece el combate de verdad! Movil, ¿qué haces?' } },
      ]);
      const toolCaller = new FakeToolCaller([], {
        get_game_state: {
          players: [{ characterId: 'char-1', name: 'Movil' }], mapHistory: [],
          activeEncounter: { roundPhase: 'jugadores', actedThisRound: [], turnClaims: [], enemies: [{ instanceId: 'g-1', name: 'Goblin', currentHp: 7 }] },
        },
      });

      await runDmTurn(chatClient, toolCaller, ongoingGameHistory('**Movil:** Miro al goblin'), 'g1');

      expect(chatClient.receivedCalls).toHaveLength(1);
    });
  });

  describe('encuentro desequilibrado', () => {
    // CASO REAL: 2 Ghouls + 1 Zombie contra dos personajes de nivel 1. Ahora
    // start_combat lo rechaza por presupuesto de XP; si el modelo se limita a
    // narrar el combate igualmente, el sistema le obliga a reintentar con
    // enemigos dentro del presupuesto.
    it('si start_combat rechaza el encuentro por demasiado duro, se pide reintentar con enemigos más débiles', async () => {
      const rejection = 'Encuentro demasiado duro para este grupo (2 personaje(s) de nivel 1, 1): sus enemigos suman ' +
          '450 XP y el máximo permitido es 200 (presupuesto de dificultad "alta" de la Guía del DM 2024).';
      const chatClient = new FakeChatClient([
        {
          message: {
            role: 'assistant', content: null,
            tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'start_combat', arguments: '{"gameId":"g1","enemyIds":["ghoul","ghoul","zombie"]}' } }],
          },
        },
        { message: { role: 'assistant', content: 'Los dos ghouls y el zombie se lanzan sobre vosotros.' } },
        {
          message: {
            role: 'assistant', content: null,
            tool_calls: [{ id: 'c2', type: 'function' as const, function: { name: 'start_combat', arguments: '{"gameId":"g1","enemyIds":["zombie"]}' } }],
          },
        },
        { message: { role: 'assistant', content: 'Un único zombie se tambalea hacia vosotros.' } },
      ]);
      const toolCaller = new FakeToolCaller([], {}, { start_combat: rejection });
      // El segundo start_combat (ya equilibrado) sí funciona.
      const originalCallTool = toolCaller.callTool.bind(toolCaller);
      let startCombatCalls = 0;
      toolCaller.callTool = async (name: string, args: Record<string, unknown>) => {
        if (name === 'start_combat') {
          startCombatCalls += 1;
          if (startCombatCalls > 1) {
            toolCaller.calls.push({ name, args });
            return { started: true, enemies: [{ instanceId: 'z1', name: 'Zombie' }] };
          }
        }
        return originalCallTool(name, args);
      };

      await runDmTurn(chatClient, toolCaller, [], 'g1');

      const correctionCall = chatClient.receivedCalls.find((c) => {
        const last = c.messages[c.messages.length - 1];
        return last.role === 'system' && typeof last.content === 'string' &&
            /^Nota interna de corrección/.test(last.content) && /demasiado duro/.test(last.content);
      });
      expect(correctionCall).toBeDefined();
      expect(startCombatCalls).toBe(2);
    });
  });

  describe('depuración', () => {
    // El seguro de arranque (resolveVillageStartFallback) solo miraba el mapa
    // aplicado EN ESTE TURNO: en el turno 3, "Pregunto al tabernero de la
    // taberna" (con la taberna ya aplicada en el turno 2) volvía a aplicar el
    // mapa, recolocaba a todos y sustituía la respuesta del modelo por la
    // frase fija "Entráis en la taberna...".
    it('el seguro de arranque no se dispara si la elección de arranque ya se resolvió en un turno anterior', async () => {
      const history: ChatMessage[] = [
        { role: 'user', content: 'La partida ha comenzado. Describe la escena inicial.' },
        { role: 'assistant', content: 'Estáis en el pueblo. ¿Taberna o tablón de anuncios?' },
        { role: 'user', content: 'Vamos a la taberna' },
        { role: 'assistant', content: 'Entráis en la taberna. ¿Qué hacéis?' },
        { role: 'user', content: 'Pregunto al tabernero de la taberna por rumores' },
      ];
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: 'El tabernero se inclina y susurra: "Dicen que en la mina..."' } },
      ]);
      const toolCaller = new FakeToolCaller([], {
        get_game_state: { players: [{ characterId: 'char-1' }], mapHistory: ['tabernaMercenarios'], activeEncounter: null },
      });

      const result = await runDmTurn(chatClient, toolCaller, history, 'g1');

      expect(toolCaller.calls.map((c) => c.name)).not.toContain('set_battle_map');
      expect(result.narrative).toContain('El tabernero se inclina');
    });

    // JSON.parse de los argumentos sin try/catch: unos argumentos truncados
    // (max_tokens) o inválidos reventaban el turno entero con un 500.
    it('unos argumentos de tool que no son JSON válido se devuelven al modelo como error, sin romper el turno', async () => {
      const chatClient = new FakeChatClient([
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'call-1', type: 'function' as const, function: { name: 'roll_dice', arguments: '{"notation":"1d2' } }],
          },
        },
        { message: { role: 'assistant', content: 'Tiras el dado y sale un 2.' } },
      ]);
      const toolCaller = new FakeToolCaller();

      const result = await runDmTurn(chatClient, toolCaller, ongoingGameHistory('Tiro un dado'), 'g1');

      expect(toolCaller.calls.map((c) => c.name)).not.toContain('roll_dice');
      const toolMessage = chatClient.receivedCalls[1].messages.find((m) => m.role === 'tool');
      expect(toolMessage?.content).toContain('JSON');
      expect(result.narrative).toContain('sale un 2');
    });

    it('unos argumentos JSON que no son un objeto (null, número...) también se tratan como inválidos', async () => {
      const chatClient = new FakeChatClient([
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'call-1', type: 'function' as const, function: { name: 'get_game_state', arguments: 'null' } }],
          },
        },
        { message: { role: 'assistant', content: 'Continúa la escena.' } },
      ]);
      const toolCaller = new FakeToolCaller();

      await expect(runDmTurn(chatClient, toolCaller, ongoingGameHistory('Miro alrededor'), 'g1')).resolves.toBeDefined();
      const toolMessage = chatClient.receivedCalls[1].messages.find((m) => m.role === 'tool' && m.tool_call_id === 'call-1');
      expect(toolMessage?.content).toContain('no son un objeto JSON válido');
    });

    it('si una tool de mapas falla y el modelo la reintenta con éxito, no se le sigue avisando del fallo', async () => {
      class FlakyMapToolCaller extends FakeToolCaller {
        private failedOnce = false;
        async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
          if (name === 'set_battle_map' && !this.failedOnce) {
            this.failedOnce = true;
            this.calls.push({ name, args });
            throw new Error('mapId inválido');
          }
          return super.callTool(name, args);
        }
      }
      const setMap = (id: string) => ({
        message: {
          role: 'assistant' as const,
          content: null,
          tool_calls: [{ id, type: 'function' as const, function: { name: 'set_battle_map', arguments: '{"gameId":"g1","mapId":"ruinas-bosque"}' } }],
        },
      });
      const chatClient = new FakeChatClient([
        setMap('call-1'),
        setMap('call-2'),
        { message: { role: 'assistant', content: 'Llegáis a unas ruinas cubiertas de musgo.' } },
      ]);

      const result = await runDmTurn(chatClient, new FlakyMapToolCaller(), ongoingGameHistory('Seguimos el sendero'), 'g1');

      const nudges = chatClient.receivedCalls.flatMap((c) => c.messages).filter((m) => m.role === 'system' && /ha fallado de verdad/.test(m.content ?? ''));
      expect(nudges).toHaveLength(0);
      expect(result.narrative).toContain('ruinas');
    });

    // Regresión de la depuración anterior: el seguro de arranque se saltaba
    // en cuanto mapHistory tenía CUALQUIER mapa, así que pasar del tablón a
    // la taberna ya no cambiaba el tablero (se quedaba el tablón).
    it('el seguro de arranque SÍ aplica la taberna si el mapa anterior era el tablón', async () => {
      const history: ChatMessage[] = [
        { role: 'user', content: 'La partida ha comenzado. Describe la escena inicial.' },
        { role: 'assistant', content: 'Estáis en el pueblo. ¿Taberna o tablón de anuncios?' },
        { role: 'user', content: 'Vamos al tablón' },
        { role: 'assistant', content: 'Os acercáis al tablón. Hay tres contratos.' },
        { role: 'user', content: 'Vale, ahora vamos a la taberna a hablar con la tabernera' },
      ];
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: 'El calor del hogar os recibe. La tabernera levanta la vista.' } },
      ]);
      const toolCaller = new FakeToolCaller([], {
        get_game_state: { players: [{ characterId: 'char-1' }], mapHistory: ['tablonAnuncios'], activeEncounter: null },
      });

      await runDmTurn(chatClient, toolCaller, history, 'g1');

      const setMap = toolCaller.calls.find((c) => c.name === 'set_battle_map');
      expect(setMap?.args.mapId).toBe('tabernaMercenarios');
    });

    it('si el jugador nombra los dos destinos, cuenta el último ("salimos del tablón y vamos a la taberna")', async () => {
      const history: ChatMessage[] = [
        { role: 'user', content: 'La partida ha comenzado. Describe la escena inicial.' },
        { role: 'assistant', content: 'Estáis en el pueblo. ¿Taberna o tablón de anuncios?' },
        { role: 'user', content: 'Vamos al tablón' },
        { role: 'assistant', content: 'Os acercáis al tablón. Hay tres contratos.' },
        { role: 'user', content: 'Salimos del tablón y vamos a la taberna' },
      ];
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: 'Cruzáis la plaza hasta la puerta de la posada.' } },
      ]);
      const toolCaller = new FakeToolCaller([], {
        get_game_state: { players: [{ characterId: 'char-1' }], mapHistory: ['tablonAnuncios'], activeEncounter: null },
      });

      await runDmTurn(chatClient, toolCaller, history, 'g1');

      const setMap = toolCaller.calls.find((c) => c.name === 'set_battle_map');
      expect(setMap?.args.mapId).toBe('tabernaMercenarios');
    });

    // Caso real: "Bajamos al sotano" -> el DM narra "El grupo desciende las
    // escaleras... hasta un sótano" sin tocar ninguna tool de mapa, y el
    // tablero se queda con el mapa anterior. El chequeo de cambio de sitio
    // exigía un verbo de SALIDA y otro de ENTRADA en la narración; aquí solo
    // hay de entrada.
    it('avisa al DM si el jugador va a un lugar nuevo (sótano) y la narración lo lleva allí sin tocar el mapa', async () => {
      const chatClient = new FakeChatClient([
        {
          message: {
            role: 'assistant',
            content: 'El grupo desciende las escaleras, que se estrechan hasta desembocar en un sótano de paredes de piedra.',
          },
        },
      ]);

      await runDmTurn(chatClient, new FakeToolCaller(), ongoingGameHistory('Bajamos al sotano'), 'g1');

      const nudges = chatClient.receivedCalls
        .flatMap((c) => c.messages)
        .filter((m) => m.role === 'system' && /^Nota interna de corrección/.test(m.content ?? '') && /get_battle_maps/.test(m.content ?? ''));
      expect(nudges.length).toBeGreaterThan(0);
    });

    it('no confunde moverse a otra sala del mismo mapa con cambiar de lugar', async () => {
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: 'Entráis en la sala del fondo, llena de polvo y telarañas.' } },
      ]);

      await runDmTurn(chatClient, new FakeToolCaller(), ongoingGameHistory('Entramos en la sala del fondo'), 'g1');

      const locationNudges = chatClient.receivedCalls
        .flatMap((c) => c.messages)
        .filter((m) => m.role === 'system' && /^Nota interna de corrección/.test(m.content ?? '') && /get_battle_maps/.test(m.content ?? ''));
      expect(locationNudges).toHaveLength(0);
    });

    it('no avisa si el mapa aplicado ya es de ese lugar (ya estáis en el sótano)', async () => {
      const chatClient = new FakeChatClient([
        { message: { role: 'assistant', content: 'Avanzáis hacia el fondo del sótano, entre barriles.' } },
      ]);
      const toolCaller = new FakeToolCaller([], { get_game_state: { mapHistory: ['tabernaMercenarios', 'sotanoTaberna'] } });

      await runDmTurn(chatClient, toolCaller, ongoingGameHistory('Vamos al fondo del sótano'), 'g1');

      const locationNudges = chatClient.receivedCalls
        .flatMap((c) => c.messages)
        .filter((m) => m.role === 'system' && /^Nota interna de corrección/.test(m.content ?? '') && /get_battle_maps/.test(m.content ?? ''));
      expect(locationNudges).toHaveLength(0);
    });
  });
});
