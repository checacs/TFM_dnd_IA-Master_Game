import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { ClearBattleMapUseCase } from './clear-battle-map.use-case';

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

describe('ClearBattleMapUseCase', () => {
  it('quita el mapa aplicado y persiste el cambio', async () => {
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.setBattleMap({ rows: 10, cols: 14, imageUrl: '/maps/taberna-jabali.png' });
    const games = new FakeGameRepository();
    games.seed(game);

    const useCase = new ClearBattleMapUseCase(games);
    await useCase.execute({ gameId: game.id });

    const saved = await games.findById(game.id);
    expect(saved?.toSnapshot().board).toEqual({ rows: 8, cols: 8, imageUrl: null, combatPoint: null, zones: [] });
  });

  it('lanza DomainError si la partida no existe', async () => {
    const games = new FakeGameRepository();
    const useCase = new ClearBattleMapUseCase(games);

    await expect(useCase.execute({ gameId: 'no-existe' })).rejects.toThrow();
  });
});
