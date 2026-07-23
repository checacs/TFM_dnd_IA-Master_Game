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
    expect(toolCaller.calls).toHaveLength(0);
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

    expect(toolCaller.calls).toEqual([{ name: 'roll_dice', args: { notation: '1d20' } }]);
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

    expect(toolCaller.calls).toHaveLength(1);
    expect(result.events).toEqual([]);
  });

  it('lanza un error si se supera el límite de iteraciones de tool-calling', async () => {
    const infiniteToolCall = {
      message: {
        role: 'assistant' as const,
        content: null,
        tool_calls: [{ id: 'call-x', type: 'function' as const, function: { name: 'roll_dice', arguments: '{"notation":"1d20"}' } }],
      },
    };
    const chatClient = new FakeChatClient([infiniteToolCall]); // siempre pide otra tool, nunca termina
    const toolCaller = new FakeToolCaller([], { roll_dice: { result: 1 } });

    await expect(runDmTurn(chatClient, toolCaller, [], 'game-1')).rejects.toThrow(/límite/i);
  });

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

    expect(toolCaller.calls.map((c) => c.name)).toEqual(['describe_map', 'set_battle_map']);
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

    expect(toolCaller.calls.map((c) => c.name)).toEqual(['get_battle_maps', 'clear_battle_map']);
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

    expect(toolCaller.calls.map((c) => c.name)).toEqual(['set_battle_map', 'place_participant']);
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

  it('si resuelve ataques de enemigos pero no llama a advance_to_player_round, se le pide antes de narrar', async () => {
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
    const toolCaller = new FakeToolCaller([], {
      resolve_attack: { hit: true, damage: 3 },
      advance_to_player_round: { advanced: true },
    });

    const result = await runDmTurn(chatClient, toolCaller, [], 'g1');

    expect(toolCaller.calls.map((c) => c.name)).toEqual(['resolve_attack', 'advance_to_player_round']);
    expect(result.narrative).toBe('Ronda de jugadores reabierta.');
    const correctionCall = chatClient.receivedCalls[2];
    const lastMessage = correctionCall.messages[correctionCall.messages.length - 1];
    expect(lastMessage.content).toMatch(/advance_to_player_round/);
  });

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

  it('solo corrige una vez: si el modelo insiste en no llamar a set_battle_map, se acepta su narrativa sin bucle infinito', async () => {
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
    expect(chatClient.receivedCalls).toHaveLength(3); // no una cuarta llamada de corrección adicional
  });

  it('si el turno no toca mapas para nada, no se generan avisos ni iteraciones extra', async () => {
    const chatClient = new FakeChatClient([
      { message: { role: 'assistant', content: 'Miras alrededor, todo en calma.' } },
    ]);
    const toolCaller = new FakeToolCaller();

    const result = await runDmTurn(chatClient, toolCaller, [{ role: 'user', content: 'Miro alrededor' }], 'g1');

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
        expect(toolCaller.calls.map((c) => c.name)).toEqual(['resolve_attack', 'grant_xp', 'get_game_state']);
        const correctionCall = chatClient.receivedCalls[1];
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
      'si TODOS los enemigos del combate están a 0 HP real pero no se llamó a end_combat, se avisa antes de ' +
      'aceptar la narrativa -- caso real detectado en partida: el panel "Combate" y el marcador del Brown Bear ' +
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
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'c4', type: 'function' as const, function: { name: 'end_combat', arguments: '{"gameId":"g1"}' } }],
            },
          },
          { message: { role: 'assistant', content: 'El combate ha terminado. El cadáver del oso yace a tus pies.' } },
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

        expect(result.narrative).toBe('El combate ha terminado. El cadáver del oso yace a tus pies.');
        expect(toolCaller.calls.map((c) => c.name)).toEqual([
          'resolve_attack', 'grant_xp', 'advance_to_player_round', 'get_game_state', 'end_combat',
        ]);
        const correctionCall = chatClient.receivedCalls[1];
        const lastMessage = correctionCall.messages[correctionCall.messages.length - 1];
        expect(lastMessage.content).toMatch(/end_combat/);
      },
  );

  it('si se llama a grant_xp sin haber resuelto ningún ataque este turno (ej. XP por completar una misión), no se comprueba nada ni se llama a get_game_state', async () => {
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
    expect(toolCaller.calls.map((c) => c.name)).toEqual(['grant_xp']); // sin get_game_state
  });

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

      const result = await runDmTurn(chatClient, toolCaller, [{ role: 'user', content: 'Lanzo misil magico' }], 'g1');

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

      const result = await runDmTurn(chatClient, toolCaller, [{ role: 'user', content: 'Ataco' }], 'g1');

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

          const result = await runDmTurn(chatClient, toolCaller, [{ role: 'user', content: 'Ataco' }], 'g1');

          // Este texto no menciona ninguna muerte/derrota, así que tampoco debería
          // disparar combatWithoutToolsNudge -- ningún aviso en absoluto.
          expect(result.narrative).toBe('Sigo narrando pese al fallo, sin combate real.');
          expect(chatClient.receivedCalls).toHaveLength(2);
        });
      },
  );
});
