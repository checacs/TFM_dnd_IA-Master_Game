import { GameRepository } from '../../domain/ports/game.repository.port';
import { DmEngineClient, DmEngineChatMessage, DmEngineResult, DmEngineRespondedError } from '../../domain/ports/dm-engine.port';
import { Game } from '../../domain/entities/game.entity';
import { withGameLock } from '../../domain/services/game-lock';
import { SendMessageUseCase } from './send-message.use-case';

/**
 * findById/save reconstruyen la entidad desde su snapshot en vez de guardar la
 * misma referencia en memoria — igual que un repositorio real (Mongo
 * deserializa un documento nuevo en cada lectura). structuredClone en
 * findById es imprescindible: Game.reconstitute() envuelve el `props` que
 * recibe sin clonarlo, así que dos findById() entre saves que compartieran el
 * mismo snapshot por referencia producirían entidades que comparten
 * props.board — y el bug de copia obsoleta que este test busca detectar
 * quedaría enmascarado.
 */
class FakeGameRepository implements GameRepository {
  private readonly snapshots = new Map<string, ReturnType<Game['toSnapshot']>>();
  seed(game: Game): void {
    this.snapshots.set(game.id, game.toSnapshot());
  }
  async findById(id: string): Promise<Game | null> {
    const snapshot = this.snapshots.get(id);
    return snapshot ? Game.reconstitute(id, structuredClone(snapshot)) : null;
  }
  async findByUserId(_userId: string): Promise<Game[]> { return []; }

  async save(game: Game): Promise<void> {
    this.snapshots.set(game.id, game.toSnapshot());
  }
}

class FakeDmEngineClient implements DmEngineClient {
  public receivedGameId: string | null = null;
  public receivedMessages: DmEngineChatMessage[] | null = null;
  constructor(
    private readonly result: DmEngineResult,
    /** Simula lo que hacen las tools MCP durante el turno real: mutan y guardan
     * la partida directamente en el repositorio mientras el use case todavía
     * tiene en memoria la copia leída al principio del turno. */
    private readonly duringTurn?: () => Promise<void>,
  ) {}
  async sendTurn(gameId: string, messages: DmEngineChatMessage[]): Promise<DmEngineResult> {
    this.receivedGameId = gameId;
    this.receivedMessages = messages;
    if (this.duringTurn) {
      await this.duringTurn();
    }
    return this.result;
  }
}

class FailingDmEngineClient implements DmEngineClient {
  public attempts = 0;
  constructor(private readonly error: Error) {}
  async sendTurn(): Promise<DmEngineResult> {
    this.attempts++;
    throw this.error;
  }
}

/** Falla las primeras `failTimes` llamadas y luego responde con éxito -- simula
 * un cold-start que se resuelve solo si se le da un par de intentos más. */
class RecoveringDmEngineClient implements DmEngineClient {
  public attempts = 0;
  constructor(
    private readonly failTimes: number,
    private readonly error: Error,
    private readonly result: DmEngineResult,
  ) {}
  async sendTurn(): Promise<DmEngineResult> {
    this.attempts++;
    if (this.attempts <= this.failTimes) {
      throw this.error;
    }
    return this.result;
  }
}

describe('SendMessageUseCase', () => {
  it('reenvía los mensajes al dm-engine y devuelve su resultado', async () => {
    const games = new FakeGameRepository();
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    games.seed(game);

    const dmEngine = new FakeDmEngineClient({
      narrative: 'La puerta cruje al abrirse.',
      events: [{ type: 'tirada_realizada', payload: { result: 12 } }],
    });
    const useCase = new SendMessageUseCase(games, dmEngine);

    const messages: DmEngineChatMessage[] = [{ role: 'user', content: 'Abro la puerta' }];
    const result = await useCase.execute({ gameId: game.id, messages });

    expect(dmEngine.receivedGameId).toBe(game.id);
    expect(dmEngine.receivedMessages).toEqual(messages);
    expect(result.narrative).toBe('La puerta cruje al abrirse.');
    expect(result.events).toHaveLength(1);
  });

  it('conserva los cambios que las tools del DM (set_battle_map, place_participant...) escriben en la partida durante el turno', async () => {
    const games = new FakeGameRepository();
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    games.seed(game);

    const dmEngine = new FakeDmEngineClient(
      { narrative: 'El mapa está fijado.', events: [] },
      async () => {
        const duringTurn = await games.findById(game.id);
        duringTurn!.setBattleMap({ rows: 10, cols: 12, imageUrl: '/maps/ruinas-bosque.png' });
        await games.save(duringTurn!);
      },
    );
    const useCase = new SendMessageUseCase(games, dmEngine);

    await useCase.execute({ gameId: game.id, messages: [{ role: 'user', content: 'Miro alrededor' }] });

    const saved = await games.findById(game.id);
    expect(saved!.toSnapshot().board).toEqual(
      expect.objectContaining({ rows: 10, cols: 12, imageUrl: '/maps/ruinas-bosque.png' }),
    );
  });

  it('si el dm-engine falla SIEMPRE, reintenta el turno completo varias veces y solo entonces guarda el mensaje de fallback', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const games = new FakeGameRepository();
      const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
      games.seed(game);

      const dmEngine = new FailingDmEngineClient(new Error('dm-engine no respondió en 45000ms'));
      const useCase = new SendMessageUseCase(games, dmEngine);

      const result = await useCase.execute({
        gameId: game.id,
        messages: [{ role: 'user', content: 'Abro la puerta' }],
      });

      // No debe rechazar: el jugador tiene que recibir SIEMPRE algo en el chat.
      expect(result.narrative).toMatch(/no ha podido responder/i);
      expect(result.events).toEqual([]);
      // Se reintentó el turno completo (no se rindió al primer fallo).
      expect(dmEngine.attempts).toBe(3);

      const saved = await games.findById(game.id);
      const log = saved!.toSnapshot().narrativeLog;
      expect(log).toHaveLength(2);
      expect(log[0]).toEqual(expect.objectContaining({ role: 'user', content: 'Abro la puerta' }));
      expect(log[1].role).toBe('assistant');
      expect(log[1].content).toMatch(/no ha podido responder/i);
    } finally {
      jest.useRealTimers();
    }
    // Timeout explícito: los 2 sleeps de reintento (5s cada uno) avanzados con
    // advanceTimers pueden superar los 5s por defecto de jest según la máquina.
  }, 30_000);

  it('NO reintenta el turno si dm-engine RESPONDIÓ con error (DmEngineRespondedError): pudo haber mutado la partida y reintentar duplica escenas', async () => {
    // Bug real de producción: un turno superó el límite de iteraciones de
    // tools DESPUÉS de haber iniciado un combate de verdad (start_combat ya
    // ejecutado) y dm-engine devolvió 500. La capa de reintentos reenviaba el
    // turno COMPLETO: cada reintento ejecuta otro turno entero del LLM (no
    // determinista) sobre una partida ya mutada -- duplicando combates y
    // escenas. Si el error dice "dm-engine sí procesó el turno" hay que
    // rendirse a la primera y mostrar el fallback.
    const games = new FakeGameRepository();
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    games.seed(game);

    const dmEngine = new FailingDmEngineClient(new DmEngineRespondedError('dm-engine respondió con estado 500'));
    const useCase = new SendMessageUseCase(games, dmEngine);

    const result = await useCase.execute({
      gameId: game.id,
      messages: [{ role: 'user', content: 'Entramos al pantano' }],
    });

    expect(dmEngine.attempts).toBe(1); // ni un solo reintento
    expect(result.narrative).toMatch(/no ha podido responder/i);
  });

  it('si el dm-engine falla las primeras veces pero se recupera (cold-start doble), el jugador nunca ve el mensaje de fallback', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const games = new FakeGameRepository();
      const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
      games.seed(game);

      const dmEngine = new RecoveringDmEngineClient(2, new Error('dm-engine no respondió en 45000ms'), {
        narrative: 'La puerta cruje al abrirse, por fin.',
        events: [],
      });
      const useCase = new SendMessageUseCase(games, dmEngine);

      const result = await useCase.execute({
        gameId: game.id,
        messages: [{ role: 'user', content: 'Abro la puerta' }],
      });

      expect(dmEngine.attempts).toBe(3);
      expect(result.narrative).toBe('La puerta cruje al abrirse, por fin.');
      expect(result.narrative).not.toMatch(/no ha podido responder/i);

      const saved = await games.findById(game.id);
      const log = saved!.toSnapshot().narrativeLog;
      expect(log[1].content).toBe('La puerta cruje al abrirse, por fin.');
    } finally {
      jest.useRealTimers();
    }
    // Timeout explícito: los 2 sleeps de reintento (5s cada uno) avanzados con
    // advanceTimers pueden superar los 5s por defecto de jest según la máquina.
  }, 30_000);

  it('las tools MCP serializadas con withGameLock no se bloquean durante el turno (regresión del deadlock del candado)', async () => {
    // Bug real observado en producción: el controller envolvía TODO
    // execute() (turno del DM incluido) en withGameLock(gameId), y las tools
    // MCP que el propio turno invoca (set_battle_map, place_participant...)
    // también piden ese MISMO candado en mcp.server.ts -- la tool se quedaba
    // encolada detrás del turno que la estaba esperando (deadlock circular),
    // rota solo por el timeout de 15s del cliente MCP. Síntoma en partida:
    // "set_battle_map: Tiempo de espera agotado (15000ms)" tres veces
    // seguidas, y el mapa apareciendo tarde (las llamadas encoladas se
    // ejecutaban al soltarse el candado, después de acabar el turno).
    // Este test fija el contrato correcto: el use case NUNCA debe retener el
    // candado de la partida mientras dmEngine.sendTurn está en marcha, así
    // que una tool que pida withGameLock del mismo gameId durante el turno
    // debe poder completarse al momento.
    const games = new FakeGameRepository();
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    games.seed(game);

    const dmEngine = new FakeDmEngineClient(
      { narrative: 'El mapa está fijado.', events: [] },
      async () => {
        // Simula exactamente lo que hace mcp.server.ts con set_battle_map.
        await withGameLock(game.id, async () => {
          const duringTurn = await games.findById(game.id);
          duringTurn!.setBattleMap({ rows: 10, cols: 12, imageUrl: '/maps/ruinas-bosque.png' });
          await games.save(duringTurn!);
        });
      },
    );
    const useCase = new SendMessageUseCase(games, dmEngine);

    // Si el use case retiene el candado durante sendTurn, esta promesa no se
    // resuelve nunca (deadlock) -- el guard de 3s la convierte en fallo visible.
    // El timer se limpia SIEMPRE al terminar la carrera: sin el clearTimeout,
    // el setTimeout de 3s quedaba vivo tras acabar el test (el camino feliz
    // termina en milisegundos) y jest avisaba de "worker process has failed
    // to exit gracefully" por el handle abierto.
    let guardTimer: NodeJS.Timeout | undefined;
    const guard = new Promise<never>((_, reject) => {
      guardTimer = setTimeout(
        () => reject(new Error('DEADLOCK: la tool MCP no pudo coger el candado durante el turno')),
        3_000,
      );
    });
    try {
      await Promise.race([
        useCase.execute({ gameId: game.id, messages: [{ role: 'user', content: 'Miro alrededor' }] }),
        guard,
      ]);
    } finally {
      clearTimeout(guardTimer);
    }

    const saved = await games.findById(game.id);
    expect(saved!.toSnapshot().board).toEqual(
      expect.objectContaining({ rows: 10, cols: 12, imageUrl: '/maps/ruinas-bosque.png' }),
    );
  });

  it('una mutación concurrente (ej. claim-turn) que llega mientras el DM está pensando no se pierde al guardar la narrativa', async () => {
    // La otra mitad del rediseño del candado: al NO envolver ya el turno
    // entero, la protección contra lost-updates debe vivir DENTRO del use
    // case, en sus dos secciones críticas (guardar el mensaje del jugador al
    // principio, y releer+guardar la narrativa al final). Este test simula
    // una mutación concurrente con withGameLock (como claim-turn desde el
    // móvil) que se está ejecutando -- lenta -- justo cuando el turno del DM
    // termina: sin candado interno, la relectura final leería el estado
    // ANTERIOR a esa mutación y el save de la narrativa la pisaría (o al
    // revés). Con el candado interno, la sección final espera su turno en la
    // cola y AMBOS cambios sobreviven.
    const games = new FakeGameRepository();
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    games.seed(game);

    let concurrentMutation: Promise<void> | null = null;
    const dmEngine = new FakeDmEngineClient(
      { narrative: 'La puerta cruje al abrirse.', events: [] },
      async () => {
        // Arranca la mutación concurrente SIN esperarla: sigue en marcha
        // (dentro de su withGameLock, con una escritura lenta) cuando
        // sendTurn devuelve y el use case pasa a su sección final.
        concurrentMutation = withGameLock(game.id, async () => {
          const other = await games.findById(game.id);
          other!.setBattleMap({ rows: 30, cols: 20, imageUrl: '/maps/battleMap17-sotanoTaberna.png' });
          await new Promise((resolve) => setTimeout(resolve, 80));
          await games.save(other!);
        });
      },
    );
    const useCase = new SendMessageUseCase(games, dmEngine);

    const result = await useCase.execute({
      gameId: game.id,
      messages: [{ role: 'user', content: 'Abro la puerta' }],
    });
    await concurrentMutation!;

    expect(result.narrative).toBe('La puerta cruje al abrirse.');
    const saved = await games.findById(game.id);
    const snapshot = saved!.toSnapshot();
    // La mutación concurrente sobrevive...
    expect(snapshot.board).toEqual(
      expect.objectContaining({ rows: 30, cols: 20, imageUrl: '/maps/battleMap17-sotanoTaberna.png' }),
    );
    // ...y la narrativa del DM también.
    expect(snapshot.narrativeLog).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'assistant', content: 'La puerta cruje al abrirse.' })]),
    );
  });

  it('lanza DomainError si la partida no existe, sin llegar a llamar al dm-engine', async () => {
    const games = new FakeGameRepository();
    const dmEngine = new FakeDmEngineClient({ narrative: '', events: [] });
    const useCase = new SendMessageUseCase(games, dmEngine);

    await expect(
      useCase.execute({ gameId: 'no-existe', messages: [{ role: 'user', content: 'hola' }] }),
    ).rejects.toThrow();

    expect(dmEngine.receivedMessages).toBeNull();
  });
});
