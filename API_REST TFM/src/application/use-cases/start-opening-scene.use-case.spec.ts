import { GameRepository } from '../../domain/ports/game.repository.port';
import { DmEngineClient, DmEngineChatMessage, DmEngineResult } from '../../domain/ports/dm-engine.port';
import { Game } from '../../domain/entities/game.entity';
import { DomainError } from '../../domain/errors/domain-error';
import { SendMessageUseCase } from './send-message.use-case';
import { StartOpeningSceneUseCase, OPENING_SCENE_PROMPT } from './start-opening-scene.use-case';

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
  async deleteById(id: string): Promise<void> {
    this.snapshots.delete(id);
  }
}

class FakeDmEngineClient implements DmEngineClient {
  public receivedMessages: DmEngineChatMessage[] | null = null;
  async sendTurn(_gameId: string, messages: DmEngineChatMessage[]): Promise<DmEngineResult> {
    this.receivedMessages = messages;
    return { narrative: 'Llegáis a un pueblo tranquilo.', events: [] };
  }
}

function buildLaunchedGame(): Game {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 14 });
  game.assignCaptain('host-1', 'user-1');
  game.launch('host-1');
  return game;
}

function setup(game: Game) {
  const games = new FakeGameRepository();
  games.seed(game);
  const dmEngine = new FakeDmEngineClient();
  const useCase = new StartOpeningSceneUseCase(games, new SendMessageUseCase(games, dmEngine));
  return { games, dmEngine, useCase };
}

/**
 * POST /games/:id/message aceptaba un historial arbitrario del cliente (con
 * turnos 'assistant' inventados) sin comprobar quién llamaba: cualquier
 * usuario logueado podía hablar con el DM de cualquier partida, saltándose
 * las reglas de capitán/turno, e incluso "inyectar" respuestas del DM. El
 * único uso legítimo (ui-web) es arrancar la escena inicial -- ahora eso es
 * lo único que hace el endpoint, y el mensaje lo construye el servidor.
 */
describe('StartOpeningSceneUseCase', () => {
  it('el host arranca la escena inicial: el mensaje lo construye el servidor y queda narrada', async () => {
    const launched = buildLaunchedGame();
    const { games, dmEngine, useCase } = setup(launched);

    const result = await useCase.execute({ gameId: launched.id, requestingUserId: 'host-1' });

    expect(result.narrative).toBe('Llegáis a un pueblo tranquilo.');
    expect(dmEngine.receivedMessages).toEqual([{ role: 'user', content: OPENING_SCENE_PROMPT }]);
    const log = (await games.findById(launched.id))!.toSnapshot().narrativeLog;
    expect(log).toHaveLength(2);
  });

  it('un jugador de la partida también puede arrancarla', async () => {
    const launched = buildLaunchedGame();
    const { useCase } = setup(launched);
    await expect(useCase.execute({ gameId: launched.id, requestingUserId: 'user-2' })).resolves.not.toThrow();
  });

  it('rechaza a un usuario ajeno a la partida', async () => {
    const launched = buildLaunchedGame();
    const { dmEngine, useCase } = setup(launched);
    await expect(useCase.execute({ gameId: launched.id, requestingUserId: 'intruso' })).rejects.toThrow(DomainError);
    expect(dmEngine.receivedMessages).toBeNull();
  });

  it('rechaza si la partida no está en curso', async () => {
    const game = Game.create({ name: 'Sala de espera', hostUserId: 'host-1', maxPlayers: 4 });
    const { dmEngine, useCase } = setup(game);
    await expect(useCase.execute({ gameId: game.id, requestingUserId: 'host-1' })).rejects.toThrow(DomainError);
    expect(dmEngine.receivedMessages).toBeNull();
  });

  it('rechaza si la escena inicial ya se narró (el log no está vacío)', async () => {
    const launched = buildLaunchedGame();
    launched.appendNarrativeEntry({ role: 'assistant', content: 'Ya empezó.' });
    const { dmEngine, useCase } = setup(launched);
    await expect(useCase.execute({ gameId: launched.id, requestingUserId: 'host-1' })).rejects.toThrow(DomainError);
    expect(dmEngine.receivedMessages).toBeNull();
  });

  it('lanza DomainError si la partida no existe', async () => {
    const { useCase } = setup(buildLaunchedGame());
    await expect(useCase.execute({ gameId: 'no-existe', requestingUserId: 'host-1' })).rejects.toThrow(DomainError);
  });
});
