import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { PlaceParticipantUseCase } from './place-participant.use-case';

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

describe('PlaceParticipantUseCase', () => {
  it('coloca a un jugador en el tablero y persiste el cambio', async () => {
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
    const games = new FakeGameRepository();
    games.seed(game);

    const useCase = new PlaceParticipantUseCase(games);
    await useCase.execute({ gameId: game.id, participantId: 'char-1', row: 2, col: 3 });

    const saved = await games.findById(game.id);
    expect(saved?.toSnapshot().players[0].position).toEqual({ row: 2, col: 3 });
  });

  it('lanza DomainError si la partida no existe', async () => {
    const games = new FakeGameRepository();
    const useCase = new PlaceParticipantUseCase(games);

    await expect(
      useCase.execute({ gameId: 'no-existe', participantId: 'char-1', row: 0, col: 0 }),
    ).rejects.toThrow();
  });

  it('propaga el DomainError del dominio si la posición cae fuera del tablero', async () => {
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4, board: { rows: 4, cols: 4 } });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
    const games = new FakeGameRepository();
    games.seed(game);

    const useCase = new PlaceParticipantUseCase(games);

    await expect(
      useCase.execute({ gameId: game.id, participantId: 'char-1', row: 9, col: 0 }),
    ).rejects.toThrow();
  });
});
