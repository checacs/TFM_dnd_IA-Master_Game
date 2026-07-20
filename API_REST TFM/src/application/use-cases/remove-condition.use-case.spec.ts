import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { RemoveConditionUseCase } from './remove-condition.use-case';

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

describe('RemoveConditionUseCase', () => {
  it('quita una condición ya aplicada a un participante', async () => {
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
    game.applyCondition('char-1', 'frightened');
    const games = new FakeGameRepository();
    games.seed(game);

    const useCase = new RemoveConditionUseCase(games);
    await useCase.execute({ gameId: game.id, participantId: 'char-1', conditionIndex: 'frightened' });

    const saved = await games.findById(game.id);
    expect(saved?.getConditions('char-1')).toEqual([]);
  });

  it('lanza DomainError si la partida no existe', async () => {
    const games = new FakeGameRepository();
    const useCase = new RemoveConditionUseCase(games);

    await expect(
      useCase.execute({ gameId: 'no-existe', participantId: 'char-1', conditionIndex: 'frightened' }),
    ).rejects.toThrow();
  });
});
