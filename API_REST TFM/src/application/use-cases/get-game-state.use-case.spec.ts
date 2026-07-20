import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { GetGameStateUseCase } from './get-game-state.use-case';

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

describe('GetGameStateUseCase', () => {
  it('devuelve el tablero, los jugadores y el combate activo de la partida', async () => {
    const games = new FakeGameRepository();
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', currentHp: 14, class: 'mago' });
    games.seed(game);

    const useCase = new GetGameStateUseCase(games);
    const state = await useCase.execute({ gameId: game.id });

    expect(state.name).toBe('La torre olvidada');
    expect(state.board).toEqual({ rows: 8, cols: 8, imageUrl: null, combatPoint: null, zones: [] });
    expect(state.players).toHaveLength(1);
    expect(state.players[0].class).toBe('mago'); // la UI necesita la clase para pintar la partida
    expect(state.activeEncounter).toBeNull();
  });

  it('lanza DomainError si la partida no existe', async () => {
    const games = new FakeGameRepository();
    const useCase = new GetGameStateUseCase(games);

    await expect(useCase.execute({ gameId: 'no-existe' })).rejects.toThrow();
  });
});
