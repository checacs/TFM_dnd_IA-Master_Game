import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { ClaimTurnUseCase } from './claim-turn.use-case';

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

function buildGameInCombat(): { game: Game; repo: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 14 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
  game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
  game.launch('host-1');
  game.startEncounter({
    enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
  });
  const repo = new FakeGameRepository();
  repo.seed(game);
  return { game, repo };
}

describe('ClaimTurnUseCase', () => {
  it('reclama el turno para el jugador dueño del personaje', async () => {
    const { game, repo } = buildGameInCombat();
    const useCase = new ClaimTurnUseCase(repo);

    await useCase.execute({ gameId: game.id, requestingUserId: 'user-1', characterId: 'char-1' });

    const saved = await repo.findById(game.id);
    expect(saved?.toSnapshot().activeEncounter?.turnClaims).toEqual(['char-1']);
  });

  it('lanza DomainError si el characterId no pertenece al requestingUserId', async () => {
    const { game, repo } = buildGameInCombat();
    const useCase = new ClaimTurnUseCase(repo);

    await expect(
      useCase.execute({ gameId: game.id, requestingUserId: 'user-1', characterId: 'char-2' }),
    ).rejects.toThrow();

    const saved = await repo.findById(game.id);
    expect(saved?.toSnapshot().activeEncounter?.turnClaims).toEqual([]);
  });

  it(
      'un jugador puede reclamar el turno aunque otro ya lo tenga reclamado -- ya no es un candado ' +
      'exclusivo (bug real: bloqueaba a un jugador si la IA se dirigía a él sin haber liberado antes ' +
      'el turno de otro jugador con end_player_turn)',
      async () => {
        const { game, repo } = buildGameInCombat();
        const useCase = new ClaimTurnUseCase(repo);
        await useCase.execute({ gameId: game.id, requestingUserId: 'user-1', characterId: 'char-1' });

        await expect(
          useCase.execute({ gameId: game.id, requestingUserId: 'user-2', characterId: 'char-2' }),
        ).resolves.not.toThrow();

        const saved = await repo.findById(game.id);
        expect(saved?.toSnapshot().activeEncounter?.turnClaims).toEqual(['char-1', 'char-2']);
      },
  );

  it('lanza DomainError si la partida no existe', async () => {
    const repo = new FakeGameRepository();
    const useCase = new ClaimTurnUseCase(repo);

    await expect(
      useCase.execute({ gameId: 'no-existe', requestingUserId: 'user-1', characterId: 'char-1' }),
    ).rejects.toThrow();
  });
});
