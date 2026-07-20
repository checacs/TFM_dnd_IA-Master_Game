import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { AssignCaptainUseCase } from './assign-captain.use-case';

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

function buildLaunchedGame(): { game: Game; repo: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 14 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
  game.launch('host-1');
  const repo = new FakeGameRepository();
  repo.seed(game);
  return { game, repo };
}

describe('AssignCaptainUseCase', () => {
  it('reasigna el capitán cuando lo pide el host', async () => {
    const { game, repo } = buildLaunchedGame();
    const useCase = new AssignCaptainUseCase(repo);

    await useCase.execute({ gameId: game.id, requestingUserId: 'host-1', targetUserId: 'user-2' });

    const saved = await repo.findById(game.id);
    expect(saved?.toSnapshot().captainUserId).toBe('user-2');
  });

  it('lanza DomainError si quien lo pide no es el host', async () => {
    const { game, repo } = buildLaunchedGame();
    const useCase = new AssignCaptainUseCase(repo);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-1', targetUserId: 'user-2' }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si la partida no existe', async () => {
    const repo = new FakeGameRepository();
    const useCase = new AssignCaptainUseCase(repo);

    await expect(
      useCase.execute({ gameId: 'no-existe', requestingUserId: 'host-1', targetUserId: 'user-2' }),
    ).rejects.toThrow();
  });
});
