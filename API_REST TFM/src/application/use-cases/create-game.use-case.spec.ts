import { GameRepository } from '../../domain/ports/game.repository.port';
import { GameCodeGenerator } from '../../domain/ports/game-code-generator.port';
import { Game } from '../../domain/entities/game.entity';
import { CreateGameUseCase } from './create-game.use-case';

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

/** Igual que FakeDiceRoller: una secuencia fija de códigos, repite el último
 * si se agota (útil para forzar colisiones consecutivas en los tests). */
class FakeGameCodeGenerator implements GameCodeGenerator {
  private i = 0;
  constructor(private readonly codes: string[]) {}
  generate(): string {
    const code = this.codes[Math.min(this.i, this.codes.length - 1)];
    this.i++;
    return code;
  }
}

describe('CreateGameUseCase', () => {
  it('crea y persiste una partida nueva en estado de configuración', async () => {
    const games = new FakeGameRepository();
    const codeGenerator = new FakeGameCodeGenerator(['ABCD23']);
    const useCase = new CreateGameUseCase(games, codeGenerator);

    const result = await useCase.execute({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });

    const saved = await games.findById(result.gameId);
    expect(saved?.toSnapshot().status).toBe('configuracion');
    expect(saved?.toSnapshot().name).toBe('La torre olvidada');
  });

  it('usa como gameId el código corto del generador (identificador público de la partida)', async () => {
    const games = new FakeGameRepository();
    const codeGenerator = new FakeGameCodeGenerator(['XY78KM']);
    const useCase = new CreateGameUseCase(games, codeGenerator);

    const result = await useCase.execute({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });

    expect(result.gameId).toBe('XY78KM');
    expect(result.gameId).toHaveLength(6);
  });

  it('si el código generado ya está en uso por otra partida, reintenta con el siguiente del generador', async () => {
    const games = new FakeGameRepository();
    const existing = Game.create(
      { name: 'Otra partida', hostUserId: 'host-2', maxPlayers: 2 },
      'DUPLIC',
    );
    games.seed(existing);
    const codeGenerator = new FakeGameCodeGenerator(['DUPLIC', 'LIBRE2']);
    const useCase = new CreateGameUseCase(games, codeGenerator);

    const result = await useCase.execute({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });

    expect(result.gameId).toBe('LIBRE2');
    // La partida que ya existía con ese código no debe haberse tocado.
    const untouched = await games.findById('DUPLIC');
    expect(untouched?.toSnapshot().name).toBe('Otra partida');
  });

  it('lanza DomainError si el generador solo produce códigos ya en uso tras varios intentos', async () => {
    const games = new FakeGameRepository();
    const existing = Game.create(
      { name: 'Otra partida', hostUserId: 'host-2', maxPlayers: 2 },
      'SIEMPR',
    );
    games.seed(existing);
    // Repite el mismo código colisionado indefinidamente.
    const codeGenerator = new FakeGameCodeGenerator(['SIEMPR']);
    const useCase = new CreateGameUseCase(games, codeGenerator);

    await expect(
      useCase.execute({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 }),
    ).rejects.toThrow();
  });

  it('propaga el error de dominio si maxPlayers está fuera de rango', async () => {
    const games = new FakeGameRepository();
    const codeGenerator = new FakeGameCodeGenerator(['ABCD23']);
    const useCase = new CreateGameUseCase(games, codeGenerator);

    await expect(useCase.execute({ name: 'X', hostUserId: 'host-1', maxPlayers: 9 })).rejects.toThrow();
  });
});
