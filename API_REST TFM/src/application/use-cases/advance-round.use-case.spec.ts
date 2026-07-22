import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { AdvanceRoundUseCase } from './advance-round.use-case';

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

function buildGameInEnemyPhase(): { game: Game; repo: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 14 });
  game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
  game.launch('host-1');
  game.startEncounter({
    enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
  });
  game.claimTurn('char-1');
  game.releaseTurnAfterAction('char-1'); // único jugador vivo → fase pasa a 'enemigos'
  const repo = new FakeGameRepository();
  repo.seed(game);
  return { game, repo };
}

describe('AdvanceRoundUseCase', () => {
  it('reabre la ronda de jugadores tras la fase de enemigos', async () => {
    const { game, repo } = buildGameInEnemyPhase();
    expect(game.toSnapshot().activeEncounter?.roundPhase).toBe('enemigos');
    const useCase = new AdvanceRoundUseCase(repo);

    await useCase.execute({ gameId: game.id });

    const saved = await repo.findById(game.id);
    const encounter = saved?.toSnapshot().activeEncounter;
    expect(encounter?.roundPhase).toBe('jugadores');
    expect(encounter?.turnClaims).toEqual([]);
    expect(encounter?.actedThisRound).toEqual([]);
  });

  it('lanza DomainError si la partida no existe', async () => {
    const repo = new FakeGameRepository();
    const useCase = new AdvanceRoundUseCase(repo);

    await expect(useCase.execute({ gameId: 'no-existe' })).rejects.toThrow();
  });

  it('lanza DomainError si no hay combate activo', async () => {
    const game = Game.create({ name: 'Otra partida', hostUserId: 'host-1', maxPlayers: 2 });
    const repo = new FakeGameRepository();
    repo.seed(game);
    const useCase = new AdvanceRoundUseCase(repo);

    await expect(useCase.execute({ gameId: game.id })).rejects.toThrow();
  });
});
