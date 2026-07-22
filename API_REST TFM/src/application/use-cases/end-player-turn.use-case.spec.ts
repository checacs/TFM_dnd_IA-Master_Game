import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { EndPlayerTurnUseCase } from './end-player-turn.use-case';

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

function buildGameWithClaimedTurn(): { game: Game; repo: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
  game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
  game.launch('host-1');
  game.startEncounter({
    enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
  });
  game.claimTurn('char-1');
  const repo = new FakeGameRepository();
  repo.seed(game);
  return { game, repo };
}

describe('EndPlayerTurnUseCase', () => {
  it('libera el turno del personaje y lo marca como actuado (tool MCP end_player_turn del DM)', async () => {
    const { game, repo } = buildGameWithClaimedTurn();
    const useCase = new EndPlayerTurnUseCase(repo);

    await useCase.execute({ gameId: game.id, characterId: 'char-1' });

    const saved = await repo.findById(game.id);
    const encounter = saved?.toSnapshot().activeEncounter;
    expect(encounter?.turnClaims).toEqual([]);
    expect(encounter?.actedThisRound).toEqual(['char-1']);
    // único jugador vivo del combate -> al actuar, la fase pasa a 'enemigos'
    expect(encounter?.roundPhase).toBe('enemigos');
  });

  it('lanza DomainError si la partida no existe', async () => {
    const repo = new FakeGameRepository();
    const useCase = new EndPlayerTurnUseCase(repo);

    await expect(useCase.execute({ gameId: 'no-existe', characterId: 'char-1' })).rejects.toThrow();
  });

  it('lanza DomainError si el personaje no tiene el turno reclamado (no evita el bloqueo, ' +
      'pero sí que el DM cierre el turno de quien no lo tiene)', async () => {
    const { game, repo } = buildGameWithClaimedTurn();
    const useCase = new EndPlayerTurnUseCase(repo);

    await expect(useCase.execute({ gameId: game.id, characterId: 'char-inexistente' })).rejects.toThrow();
  });
});
