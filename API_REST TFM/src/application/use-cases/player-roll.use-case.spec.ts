import { GameRepository } from '../../domain/ports/game.repository.port';
import { DiceRoller } from '../../domain/ports/dice-roller.port';
import { Game } from '../../domain/entities/game.entity';
import { PlayerRollUseCase } from './player-roll.use-case';

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

class FakeDiceRoller implements DiceRoller {
  constructor(private readonly fixedValue: number) {}
  rollD20(): number {
    return this.fixedValue;
  }
  roll(): number {
    return this.fixedValue;
  }
}

describe('PlayerRollUseCase', () => {
  function buildGame() {
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
    game.launch('host-1');
    return game;
  }

  it('tira los dados y añade el resultado al narrativeLog atribuido al jugador (visible en el chat de ui-web)', async () => {
    const games = new FakeGameRepository();
    const game = buildGame();
    games.seed(game);
    const useCase = new PlayerRollUseCase(games, new FakeDiceRoller(17));

    const result = await useCase.execute({
      gameId: game.id,
      requestingUserId: 'user-1',
      characterId: 'char-1',
      notation: '1d20',
    });

    expect(result).toEqual({ notation: '1d20', result: 17 });

    const saved = await games.findById(game.id);
    const log = saved!.toSnapshot().narrativeLog;
    expect(log).toHaveLength(1);
    expect(log[0].role).toBe('user');
    // El nombre va en negrita Markdown (**Nombre**) para distinguirlo del
    // resto del mensaje en el chat -- se comprobó que con varios jugadores
    // escribiendo era difícil distinguir de un vistazo quién tiró qué.
    expect(log[0].content).toContain('**Elyndra**');
    expect(log[0].content).toContain('1d20');
    expect(log[0].content).toContain('17');
  });

  it('usa "1d20" como notación por defecto si no se especifica', async () => {
    const games = new FakeGameRepository();
    const game = buildGame();
    games.seed(game);
    const useCase = new PlayerRollUseCase(games, new FakeDiceRoller(5));

    const result = await useCase.execute({ gameId: game.id, requestingUserId: 'user-1', characterId: 'char-1' });

    expect(result).toEqual({ notation: '1d20', result: 5 });
  });

  it('lanza DomainError si la partida no existe', async () => {
    const games = new FakeGameRepository();
    const useCase = new PlayerRollUseCase(games, new FakeDiceRoller(10));

    await expect(
      useCase.execute({ gameId: 'no-existe', requestingUserId: 'user-1', characterId: 'char-1' }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si el characterId no pertenece al usuario que pide la tirada', async () => {
    const games = new FakeGameRepository();
    const game = buildGame();
    games.seed(game);
    const useCase = new PlayerRollUseCase(games, new FakeDiceRoller(10));

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'otro-user', characterId: 'char-1' }),
    ).rejects.toThrow();
  });
});
