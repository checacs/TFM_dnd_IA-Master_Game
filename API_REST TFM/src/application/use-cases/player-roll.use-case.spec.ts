import { GameRepository } from '../../domain/ports/game.repository.port';
import { DiceRoller } from '../../domain/ports/dice-roller.port';
import { DmEngineClient, DmEngineChatMessage, DmEngineResult } from '../../domain/ports/dm-engine.port';
import { Game } from '../../domain/entities/game.entity';
import { SendMessageUseCase } from './send-message.use-case';
import { PlayerRollUseCase } from './player-roll.use-case';

/**
 * findById/save reconstruyen la entidad desde su snapshot (no la misma
 * referencia en memoria) -- igual que en send-message.use-case.spec.ts,
 * imprescindible porque SendMessageUseCase relee la partida a mitad de
 * ejecución (findById tras el turno del dm-engine) y necesitamos que sea una
 * copia realista, no el mismo objeto que ya tenía PlayerRollUseCase.
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

class FakeDiceRoller implements DiceRoller {
  constructor(private readonly fixedValue: number) {}
  rollD20(): number {
    return this.fixedValue;
  }
  roll(): number {
    return this.fixedValue;
  }
}

class FakeDmEngineClient implements DmEngineClient {
  public receivedMessages: DmEngineChatMessage[] | null = null;
  constructor(private readonly result: DmEngineResult) {}
  async sendTurn(_gameId: string, messages: DmEngineChatMessage[]): Promise<DmEngineResult> {
    this.receivedMessages = messages;
    return this.result;
  }
}

describe('PlayerRollUseCase', () => {
  function buildGame() {
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
    game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
    game.launch('host-1');
    return game;
  }

  it('tira los dados, publica el resultado en el chat y dispara el turno del DM-IA con ese resultado (para que resuelva el ataque con playerD20)', async () => {
    const games = new FakeGameRepository();
    const game = buildGame();
    games.seed(game);
    const dmEngine = new FakeDmEngineClient({
      narrative: '🎲 Ataque contra **Goblin** (1d20+2 (tirada del jugador)): **19** vs CA 15 → ¡IMPACTA!',
      events: [],
    });
    const sendMessage = new SendMessageUseCase(games, dmEngine);
    const useCase = new PlayerRollUseCase(games, new FakeDiceRoller(17), sendMessage);

    const result = await useCase.execute({
      gameId: game.id,
      requestingUserId: 'user-1',
      characterId: 'char-1',
      notation: '1d20',
    });

    expect(result.notation).toBe('1d20');
    expect(result.result).toBe(17);
    // El DM-IA ya ha respondido en la misma llamada -- el jugador no tiene
    // que escribir nada más tras pulsar "Tirar Dados" para que la IA
    // reaccione (se detectó que, si no, la tirada se quedaba "colgada" en el
    // chat sin que nadie la resolviera hasta el siguiente mensaje escrito).
    expect(result.narrative).toContain('¡IMPACTA!');

    // El dm-engine debe recibir en su historial el mensaje de la tirada, para
    // que pueda leer el número tal cual aparece en el chat.
    expect(dmEngine.receivedMessages).not.toBeNull();
    const lastMessage = dmEngine.receivedMessages![dmEngine.receivedMessages!.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content).toContain('**Elyndra**');
    expect(lastMessage.content).toContain('17');

    const saved = await games.findById(game.id);
    const log = saved!.toSnapshot().narrativeLog;
    // Un mensaje con la tirada + un mensaje con la respuesta del DM -- nunca
    // duplicado (SendMessageUseCase es quien persiste el mensaje de la
    // tirada, PlayerRollUseCase ya NO lo guarda por su cuenta antes).
    expect(log).toHaveLength(2);
    expect(log[0].role).toBe('user');
    expect(log[0].content).toContain('**Elyndra**');
    expect(log[0].content).toContain('1d20');
    expect(log[0].content).toContain('17');
    expect(log[1].role).toBe('assistant');
    expect(log[1].content).toContain('¡IMPACTA!');
  });

  it('usa "1d20" como notación por defecto si no se especifica', async () => {
    const games = new FakeGameRepository();
    const game = buildGame();
    games.seed(game);
    const dmEngine = new FakeDmEngineClient({ narrative: 'Ok.', events: [] });
    const sendMessage = new SendMessageUseCase(games, dmEngine);
    const useCase = new PlayerRollUseCase(games, new FakeDiceRoller(5), sendMessage);

    const result = await useCase.execute({ gameId: game.id, requestingUserId: 'user-1', characterId: 'char-1' });

    expect(result.notation).toBe('1d20');
    expect(result.result).toBe(5);
  });

  it('lanza DomainError si la partida no existe', async () => {
    const games = new FakeGameRepository();
    const dmEngine = new FakeDmEngineClient({ narrative: 'Ok.', events: [] });
    const sendMessage = new SendMessageUseCase(games, dmEngine);
    const useCase = new PlayerRollUseCase(games, new FakeDiceRoller(10), sendMessage);

    await expect(
      useCase.execute({ gameId: 'no-existe', requestingUserId: 'user-1', characterId: 'char-1' }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si el characterId no pertenece al usuario que pide la tirada', async () => {
    const games = new FakeGameRepository();
    const game = buildGame();
    games.seed(game);
    const dmEngine = new FakeDmEngineClient({ narrative: 'Ok.', events: [] });
    const sendMessage = new SendMessageUseCase(games, dmEngine);
    const useCase = new PlayerRollUseCase(games, new FakeDiceRoller(10), sendMessage);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'otro-user', characterId: 'char-1' }),
    ).rejects.toThrow();
  });

  it('fuera de combate, lanza DomainError si quien tira no es el capitán del grupo', async () => {
    const games = new FakeGameRepository();
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
    game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
    game.assignCaptain('host-1', 'user-1'); // user-1 es capitán, user-2 no
    game.launch('host-1');
    games.seed(game);
    const dmEngine = new FakeDmEngineClient({ narrative: 'Ok.', events: [] });
    const sendMessage = new SendMessageUseCase(games, dmEngine);
    const useCase = new PlayerRollUseCase(games, new FakeDiceRoller(10), sendMessage);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-2', characterId: 'char-2' }),
    ).rejects.toThrow();
    expect(dmEngine.receivedMessages).toBeNull();
  });

  it('en combate, lanza DomainError si quien tira no tiene el turno reclamado', async () => {
    const games = new FakeGameRepository();
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
    game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
    game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
    game.launch('host-1');
    game.startEncounter({
      enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin', currentHp: 7, ac: 15 }],
    });
    game.claimTurn('char-1'); // solo char-1 tiene el turno
    games.seed(game);
    const dmEngine = new FakeDmEngineClient({ narrative: 'Ok.', events: [] });
    const sendMessage = new SendMessageUseCase(games, dmEngine);
    const useCase = new PlayerRollUseCase(games, new FakeDiceRoller(10), sendMessage);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-2', characterId: 'char-2' }),
    ).rejects.toThrow();
    expect(dmEngine.receivedMessages).toBeNull();
  });
});
