import { GameRepository } from '../../domain/ports/game.repository.port';
import { DmEngineClient, DmEngineChatMessage, DmEngineResult } from '../../domain/ports/dm-engine.port';
import { Game } from '../../domain/entities/game.entity';
import { SendMessageUseCase } from './send-message.use-case';
import { SendPlayerActionUseCase } from './send-player-action.use-case';

class FakeGameRepository implements GameRepository {
  private readonly games = new Map<string, Game>();
  seed(game: Game): void {
    this.games.set(game.id, game);
  }
  async findById(id: string): Promise<Game | null> {
    return this.games.get(id) ?? null;
  }
  async findByUserId(_userId: string): Promise<Game[]> { return []; }

  async save(game: Game): Promise<void> {
    this.games.set(game.id, game);
  }
}

class FakeDmEngineClient implements DmEngineClient {
  public receivedMessages: DmEngineChatMessage[] = [];
  constructor(private readonly narrative = 'El DM responde.') {}
  async sendTurn(_gameId: string, messages: DmEngineChatMessage[]): Promise<DmEngineResult> {
    this.receivedMessages = messages;
    return { narrative: this.narrative, events: [] };
  }
}

function buildGameInCombat(): { game: Game; games: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 14 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
  game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
  game.launch('host-1');
  game.startEncounter({
    enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
  });
  const games = new FakeGameRepository();
  games.seed(game);
  return { game, games };
}

function buildGameOutsideCombat(): { game: Game; games: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  // El host también juega con un personaje propio (caso realista) — así
  // "capitán por defecto" (= host) tiene un characterId con el que escribir.
  game.addPlayer({ userId: 'host-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 14 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
  game.launch('host-1'); // host-1 es capitán por defecto
  const games = new FakeGameRepository();
  games.seed(game);
  return { game, games };
}

describe('SendPlayerActionUseCase', () => {
  describe('en combate', () => {
    it('envía la acción al DM cuando el jugador tiene el turno reclamado', async () => {
      const { game, games } = buildGameInCombat();
      game.claimTurn('char-1');
      await games.save(game);
      const dmEngine = new FakeDmEngineClient('El goblin retrocede.');
      const sendMessage = new SendMessageUseCase(games, dmEngine);
      const useCase = new SendPlayerActionUseCase(games, sendMessage);

      const result = await useCase.execute({
        gameId: game.id,
        requestingUserId: 'user-1',
        characterId: 'char-1',
        content: 'Ataco al goblin con mi daga',
      });

      expect(result.narrative).toBe('El goblin retrocede.');
    });

    it(
        'NO libera el turno automáticamente tras enviar la acción — antes lo hacía ' +
        'incondicionalmente (Game.releaseTurnAfterAction en cada mensaje), lo que en partidas ' +
        'de 1 jugador bloqueaba para siempre al único jugador en cuanto el DM respondía con una ' +
        'simple pregunta aclaratoria ("¿la empuñas a una o dos manos?"), sin haber resuelto nada ' +
        'todavía. Ahora el cierre del turno depende de que el DM llame explícitamente a la tool ' +
        'end_player_turn (ver EndPlayerTurnUseCase) cuando de verdad haya resuelto la acción.',
        async () => {
          const { game, games } = buildGameInCombat();
          game.claimTurn('char-1');
          await games.save(game);
          const dmEngine = new FakeDmEngineClient('¿La empuñas a una o dos manos?');
          const sendMessage = new SendMessageUseCase(games, dmEngine);
          const useCase = new SendPlayerActionUseCase(games, sendMessage);

          await useCase.execute({
            gameId: game.id,
            requestingUserId: 'user-1',
            characterId: 'char-1',
            content: 'Voy a atacar con mi espada larga',
          });

          const saved = await games.findById(game.id);
          const encounter = saved?.toSnapshot().activeEncounter;
          // El turno sigue reclamado por char-1: puede responder la pregunta del
          // DM en un segundo mensaje sin que nadie más pueda colarse ni quedarse
          // bloqueado esperando "a los demás" (que ni siquiera existen, en solo).
          expect(encounter?.turnClaim).toBe('char-1');
          expect(encounter?.actedThisRound).toEqual([]);
          expect(encounter?.roundPhase).toBe('jugadores');

          // Puede seguir enviando mensajes (responder la pregunta) sin que el
          // candado se lo impida.
          const second = await useCase.execute({
            gameId: game.id,
            requestingUserId: 'user-1',
            characterId: 'char-1',
            content: 'A dos manos',
          });
          expect(second.narrative).toBe('¿La empuñas a una o dos manos?');
        },
    );

    it('lanza DomainError si el jugador no tiene el turno reclamado', async () => {
      const { game, games } = buildGameInCombat();
      const dmEngine = new FakeDmEngineClient();
      const sendMessage = new SendMessageUseCase(games, dmEngine);
      const useCase = new SendPlayerActionUseCase(games, sendMessage);

      await expect(
        useCase.execute({
          gameId: game.id,
          requestingUserId: 'user-1',
          characterId: 'char-1',
          content: 'Ataco al goblin',
        }),
      ).rejects.toThrow();
    });

    it('lanza DomainError si el turno reclamado es de otro personaje', async () => {
      const { game, games } = buildGameInCombat();
      game.claimTurn('char-2');
      await games.save(game);
      const dmEngine = new FakeDmEngineClient();
      const sendMessage = new SendMessageUseCase(games, dmEngine);
      const useCase = new SendPlayerActionUseCase(games, sendMessage);

      await expect(
        useCase.execute({
          gameId: game.id,
          requestingUserId: 'user-1',
          characterId: 'char-1',
          content: 'Ataco al goblin',
        }),
      ).rejects.toThrow();
    });
  });

  describe('fuera de combate', () => {
    it('permite al capitán enviar la acción al DM', async () => {
      const { game, games } = buildGameOutsideCombat();
      const dmEngine = new FakeDmEngineClient('El posadero os saluda.');
      const sendMessage = new SendMessageUseCase(games, dmEngine);
      const useCase = new SendPlayerActionUseCase(games, sendMessage);

      const result = await useCase.execute({
        gameId: game.id,
        requestingUserId: 'host-1',
        characterId: 'char-1',
        content: 'Preguntamos por el camino a la torre',
      });

      expect(result.narrative).toBe('El posadero os saluda.');
    });

    it('lanza DomainError si quien escribe no es el capitán', async () => {
      const { game, games } = buildGameOutsideCombat();
      const dmEngine = new FakeDmEngineClient();
      const sendMessage = new SendMessageUseCase(games, dmEngine);
      const useCase = new SendPlayerActionUseCase(games, sendMessage);

      await expect(
        useCase.execute({
          gameId: game.id,
          requestingUserId: 'user-2',
          characterId: 'char-2',
          content: 'Preguntamos por el camino',
        }),
      ).rejects.toThrow();
    });
  });

  it('lanza DomainError si la partida no existe', async () => {
    const games = new FakeGameRepository();
    const dmEngine = new FakeDmEngineClient();
    const sendMessage = new SendMessageUseCase(games, dmEngine);
    const useCase = new SendPlayerActionUseCase(games, sendMessage);

    await expect(
      useCase.execute({ gameId: 'no-existe', requestingUserId: 'user-1', characterId: 'char-1', content: 'Hola' }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si el characterId no pertenece al requestingUserId', async () => {
    const { game, games } = buildGameInCombat();
    game.claimTurn('char-1');
    await games.save(game);
    const dmEngine = new FakeDmEngineClient();
    const sendMessage = new SendMessageUseCase(games, dmEngine);
    const useCase = new SendPlayerActionUseCase(games, sendMessage);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-2', characterId: 'char-1', content: 'Hola' }),
    ).rejects.toThrow();
  });
});
