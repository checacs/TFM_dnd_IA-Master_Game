import { GameRepository } from '../../domain/ports/game.repository.port';
import { DmEngineClient, DmEngineChatMessage, DmEngineResult } from '../../domain/ports/dm-engine.port';
import { Game } from '../../domain/entities/game.entity';
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
