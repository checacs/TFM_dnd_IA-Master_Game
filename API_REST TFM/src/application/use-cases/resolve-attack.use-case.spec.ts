import { DiceRoller } from '../../domain/ports/dice-roller.port';
import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { ResolveAttackUseCase } from './resolve-attack.use-case';

class FakeDiceRoller implements DiceRoller {
  private i = 0;
  constructor(private readonly fixedValues: number[]) {}
  rollD20(): number {
    return this.fixedValues[this.i++];
  }
  roll(): number {
    return this.fixedValues[this.i++];
  }
}

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

function buildGameWithActiveEnemy(): { game: Game; repo: FakeGameRepository } {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
  game.launch('host-1');
  game.startEncounter({
    enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
  });

  const repo = new FakeGameRepository();
  repo.seed(game);
  return { game, repo };
}

describe('ResolveAttackUseCase', () => {
  it('impacta, aplica la tirada de daño y persiste el HP resultante en la partida', async () => {
    const { game, repo } = buildGameWithActiveEnemy();
    const diceRoller = new FakeDiceRoller([15, 5]); // 1d20 = 15, daño = 5
    const useCase = new ResolveAttackUseCase(diceRoller, repo);

    const result = await useCase.execute({
      gameId: game.id,
      targetId: 'enc-1-goblin-a',
      attackerModifier: 2,
      targetArmorClass: 17,
      damageDice: '1d6+2',
    });

    expect(result.hit).toBe(true);
    expect(result.damage).toBe(5);

    const saved = await repo.findById(game.id);
    const enemy = saved?.toSnapshot().activeEncounter?.enemies.find((e) => e.instanceId === 'enc-1-goblin-a');
    expect(enemy?.currentHp).toBe(2); // 7 - 5
  });

  it('falla cuando la tirada no alcanza la CA y no modifica el HP del objetivo', async () => {
    const { game, repo } = buildGameWithActiveEnemy();
    const diceRoller = new FakeDiceRoller([5]); // 1d20 = 5, no debería consumir una segunda tirada
    const useCase = new ResolveAttackUseCase(diceRoller, repo);

    const result = await useCase.execute({
      gameId: game.id,
      targetId: 'enc-1-goblin-a',
      attackerModifier: 2,
      targetArmorClass: 17,
      damageDice: '1d6+2',
    });

    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);

    const saved = await repo.findById(game.id);
    const enemy = saved?.toSnapshot().activeEncounter?.enemies.find((e) => e.instanceId === 'enc-1-goblin-a');
    expect(enemy?.currentHp).toBe(7); // sin cambios
  });

  it('lanza DomainError si la partida no existe', async () => {
    const repo = new FakeGameRepository();
    const diceRoller = new FakeDiceRoller([15, 5]);
    const useCase = new ResolveAttackUseCase(diceRoller, repo);

    await expect(
        useCase.execute({
          gameId: 'no-existe',
          targetId: 'enc-1-goblin-a',
          attackerModifier: 2,
          targetArmorClass: 17,
          damageDice: '1d6+2',
        }),
    ).rejects.toThrow();
  });
});