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
  game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
  const repo = new FakeGameRepository();
  repo.seed(game);
  return { game, repo };
}

describe('LaunchGameUseCase', () => {
  it('pasa la partida a en_curso cuando la pide el host y ya hay un capitán válido asignado', async () => {
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

  it(
      'lanza DomainError si nadie asignó capitán y el host no es jugador de la partida -- bug real: la partida ' +
      'lanzaba con un capitán "fantasma" (el host) que ningún usuario real podía encarnar, y nadie podía hablar ' +
      'nunca con el DM fuera de combate',
      async () => {
        const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
        game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
        const repo = new FakeGameRepository();
        repo.seed(game);
        const useCase = new LaunchGameUseCase(repo);

        await expect(useCase.execute({ gameId: game.id, requestingUserId: 'host-1' })).rejects.toThrow(/capitán/i);

        const saved = await repo.findById(game.id);
        expect(saved?.toSnapshot().status).toBe('configuracion'); // no se lanzó
      },
  );

  it('pasa la partida a en_curso si el host también es jugador de la partida (capitán por defecto)', async () => {
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'host-1', characterId: 'char-host', name: 'Grommash', class: 'guerrero', currentHp: 14 });
    const repo = new FakeGameRepository();
    repo.seed(game);
    const useCase = new LaunchGameUseCase(repo);

    await useCase.execute({ gameId: game.id, requestingUserId: 'host-1' });

    const saved = await repo.findById(game.id);
    expect(saved?.toSnapshot().status).toBe('en_curso');
    expect(saved?.toSnapshot().captainUserId).toBe('host-1');
  });
});