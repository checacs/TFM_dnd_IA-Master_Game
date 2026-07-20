import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { LaunchGameUseCase } from './launch-game.use-case';

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

function buildGameWithTwoPlayers(): { game: Game; repo: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
  const repo = new FakeGameRepository();
  repo.seed(game);
  return { game, repo };
}

describe('LaunchGameUseCase', () => {
  it('pasa la partida a en_curso cuando la pide el host', async () => {
    const { game, repo } = buildGameWithTwoPlayers();
    const useCase = new LaunchGameUseCase(repo);

    await useCase.execute({ gameId: game.id, requestingUserId: 'host-1' });

    const saved = await repo.findById(game.id);
    expect(saved?.toSnapshot().status).toBe('en_curso');
  });

  it('lanza DomainError si quien la pide no es el host', async () => {
    const { game, repo } = buildGameWithTwoPlayers();
    const useCase = new LaunchGameUseCase(repo);

    await expect(useCase.execute({ gameId: game.id, requestingUserId: 'user-1' })).rejects.toThrow();

    const saved = await repo.findById(game.id);
    expect(saved?.toSnapshot().status).toBe('configuracion'); // sin cambios
  });

  it('lanza DomainError si la partida no existe', async () => {
    const repo = new FakeGameRepository();
    const useCase = new LaunchGameUseCase(repo);

    await expect(useCase.execute({ gameId: 'no-existe', requestingUserId: 'host-1' })).rejects.toThrow();
  });
});