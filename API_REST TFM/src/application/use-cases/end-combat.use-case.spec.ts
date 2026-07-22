import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { EndCombatUseCase } from './end-combat.use-case';

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

function buildGameWithDefeatedEnemy(): { game: Game; repo: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
  game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
  game.launch('host-1');
  game.startEncounter({
    enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 0, ac: 15 }],
  });
  const repo = new FakeGameRepository();
  repo.seed(game);
  return { game, repo };
}

describe('EndCombatUseCase', () => {
  it('cierra el combate activo (tool MCP end_combat del DM) -- antes no había forma de hacer esto, ' +
      'y un combate ganado se quedaba anclado para siempre en la partida', async () => {
    const { game, repo } = buildGameWithDefeatedEnemy();
    const useCase = new EndCombatUseCase(repo);

    await useCase.execute({ gameId: game.id });

    const saved = await repo.findById(game.id);
    expect(saved?.toSnapshot().activeEncounter).toBeNull();
  });

  it('lanza DomainError si la partida no existe', async () => {
    const repo = new FakeGameRepository();
    const useCase = new EndCombatUseCase(repo);

    await expect(useCase.execute({ gameId: 'no-existe' })).rejects.toThrow();
  });

  it('lanza DomainError si no hay combate activo que cerrar', async () => {
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    const repo = new FakeGameRepository();
    repo.seed(game);
    const useCase = new EndCombatUseCase(repo);

    await expect(useCase.execute({ gameId: game.id })).rejects.toThrow();
  });
});
