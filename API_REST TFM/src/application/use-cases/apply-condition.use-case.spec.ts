import { GameRepository } from '../../domain/ports/game.repository.port';
import { RulesReferenceRepository, RulesReferenceSearchCriteria } from '../../domain/ports/rules-reference.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { RulesReference } from '../../domain/entities/rules-reference.entity';
import { ApplyConditionUseCase } from './apply-condition.use-case';

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

class FakeRulesReferenceRepository implements RulesReferenceRepository {
  constructor(private readonly refs: RulesReference[] = []) {}
  async findById(id: string): Promise<RulesReference | null> {
    return this.refs.find((r) => r.id === id) ?? null;
  }
  async search(_c: RulesReferenceSearchCriteria): Promise<RulesReference[]> {
    return this.refs;
  }
}

function buildFrightenedCondition() {
  return RulesReference.create(
    { kind: 'condition', name: 'Frightened', description: '...', abilityScore: null, relatedSkills: null },
    'condition:frightened',
  );
}

describe('ApplyConditionUseCase', () => {
  it('aplica la condición a un participante si existe en el catálogo', async () => {
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
    const games = new FakeGameRepository();
    games.seed(game);
    const rulesReference = new FakeRulesReferenceRepository([buildFrightenedCondition()]);

    const useCase = new ApplyConditionUseCase(games, rulesReference);
    await useCase.execute({ gameId: game.id, participantId: 'char-1', conditionIndex: 'frightened' });

    const saved = await games.findById(game.id);
    expect(saved?.getConditions('char-1')).toEqual(['frightened']);
  });

  it('lanza DomainError si la condición no existe en el catálogo', async () => {
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
    const games = new FakeGameRepository();
    games.seed(game);
    const rulesReference = new FakeRulesReferenceRepository([]);

    const useCase = new ApplyConditionUseCase(games, rulesReference);
    await expect(
      useCase.execute({ gameId: game.id, participantId: 'char-1', conditionIndex: 'no-existe' }),
    ).rejects.toThrow();
  });

  it('lanza DomainError si la partida no existe', async () => {
    const games = new FakeGameRepository();
    const rulesReference = new FakeRulesReferenceRepository([buildFrightenedCondition()]);
    const useCase = new ApplyConditionUseCase(games, rulesReference);

    await expect(
      useCase.execute({ gameId: 'no-existe', participantId: 'char-1', conditionIndex: 'frightened' }),
    ).rejects.toThrow();
  });
});
