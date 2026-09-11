import { DiceRoller } from '../../domain/ports/dice-roller.port';
import { GameRepository } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { RollDiceUseCase } from './roll-dice.use-case';

class FakeDiceRoller implements DiceRoller {
  constructor(private readonly fixedValue: number) {}
  rollD20(): number {
    return this.fixedValue;
  }
  roll(): number {
    return this.fixedValue;
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

  async deleteById(id: string): Promise<void> {
    this.games.delete(id);
  }
}

function buildGame(repo: FakeGameRepository): Game {
  const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
  repo.seed(game);
  return game;
}

describe('RollDiceUseCase', () => {
  it('delega en el DiceRoller y devuelve el resultado junto a la notación pedida', async () => {
    const games = new FakeGameRepository();
    const game = buildGame(games);
    const useCase = new RollDiceUseCase(new FakeDiceRoller(14), games);

    const result = await useCase.execute({ gameId: game.id, notation: '1d20+3', reason: 'Intento de fuga del Dust Mephit' });

    expect(result).toEqual({ notation: '1d20+3', result: 14 });
  });

  it(
      'añade un mensaje de sistema garantizado al narrativeLog con la tirada y el motivo -- antes las ' +
      'tiradas ad-hoc del DM-IA (fuera de un ataque estructurado) eran completamente invisibles para el ' +
      'jugador, que no tenía forma de saber que se había tirado nada ni para qué',
      async () => {
        const games = new FakeGameRepository();
        const game = buildGame(games);
        const useCase = new RollDiceUseCase(new FakeDiceRoller(2), games);

        await useCase.execute({ gameId: game.id, notation: '1d20', reason: 'Intento de fuga del Dust Mephit' });

        const saved = await games.findById(game.id);
        const log = saved!.toSnapshot().narrativeLog;
        const rollEntry = log.find((e) => e.content.includes('🎲'));

        expect(rollEntry).toBeDefined();
        expect(rollEntry?.role).toBe('assistant');
        expect(rollEntry?.content).toContain('Intento de fuga del Dust Mephit');
        expect(rollEntry?.content).toContain('1d20');
        expect(rollEntry?.content).toContain('2');
      },
  );

  it('no revienta si la partida no existe -- el resultado ya calculado no debe perderse', async () => {
    const games = new FakeGameRepository();
    const useCase = new RollDiceUseCase(new FakeDiceRoller(9), games);

    const result = await useCase.execute({ gameId: 'no-existe', notation: '1d6', reason: 'Prueba de percepción' });

    expect(result).toEqual({ notation: '1d6', result: 9 });
  });
});
