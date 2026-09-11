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
  // A diferencia del fake usado en otros specs (que siempre devuelve []), aquí
  // sí hace falta simular de verdad findByUserId para poder testear el límite
  // de partidas por host — devuelve las partidas donde el usuario es host O
  // jugador, igual que hace el repositorio Mongoose real.
  async findByUserId(userId: string): Promise<Game[]> {
    return [...this.games.values()].filter(
      (g) => g.toSnapshot().hostUserId === userId || g.toSnapshot().players.some((p) => p.userId === userId),
    );
  }

  async save(game: Game): Promise<void> {
    this.games.set(game.id, game);
  }

  async deleteById(id: string): Promise<void> {
    this.games.delete(id);
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

  describe('límite de partidas por host', () => {
    it('lanza DomainError si el host ya tiene 3 partidas activas y no crea una cuarta', async () => {
      const games = new FakeGameRepository();
      games.seed(Game.create({ name: 'Partida 1', hostUserId: 'host-1', maxPlayers: 2 }, 'GAME01'));
      games.seed(Game.create({ name: 'Partida 2', hostUserId: 'host-1', maxPlayers: 2 }, 'GAME02'));
      games.seed(Game.create({ name: 'Partida 3', hostUserId: 'host-1', maxPlayers: 2 }, 'GAME03'));
      const codeGenerator = new FakeGameCodeGenerator(['GAME04']);
      const useCase = new CreateGameUseCase(games, codeGenerator);

      await expect(
        useCase.execute({ name: 'Partida 4', hostUserId: 'host-1', maxPlayers: 2 }),
      ).rejects.toThrow(/3 partidas/);

      const fourth = await games.findById('GAME04');
      expect(fourth).toBeNull(); // no se ha creado ni persistido
    });

    it('permite crear la partida si el host tiene menos de 3', async () => {
      const games = new FakeGameRepository();
      games.seed(Game.create({ name: 'Partida 1', hostUserId: 'host-1', maxPlayers: 2 }, 'GAME01'));
      games.seed(Game.create({ name: 'Partida 2', hostUserId: 'host-1', maxPlayers: 2 }, 'GAME02'));
      const codeGenerator = new FakeGameCodeGenerator(['GAME03']);
      const useCase = new CreateGameUseCase(games, codeGenerator);

      const result = await useCase.execute({ name: 'Partida 3', hostUserId: 'host-1', maxPlayers: 2 });

      expect(result.gameId).toBe('GAME03');
    });

    it('el límite es por host: las partidas de otros usuarios no cuentan', async () => {
      const games = new FakeGameRepository();
      games.seed(Game.create({ name: 'Partida 1', hostUserId: 'host-2', maxPlayers: 2 }, 'GAME01'));
      games.seed(Game.create({ name: 'Partida 2', hostUserId: 'host-2', maxPlayers: 2 }, 'GAME02'));
      games.seed(Game.create({ name: 'Partida 3', hostUserId: 'host-2', maxPlayers: 2 }, 'GAME03'));
      const codeGenerator = new FakeGameCodeGenerator(['GAME04']);
      const useCase = new CreateGameUseCase(games, codeGenerator);

      const result = await useCase.execute({ name: 'Partida de host-1', hostUserId: 'host-1', maxPlayers: 2 });

      expect(result.gameId).toBe('GAME04');
    });

    it('ser jugador (no host) en 3 partidas de otros no bloquea crear una propia', async () => {
      const games = new FakeGameRepository();
      const g1 = Game.create({ name: 'Partida 1', hostUserId: 'host-2', maxPlayers: 2 }, 'GAME01');
      g1.addPlayer({ userId: 'host-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 9 });
      games.seed(g1);
      const g2 = Game.create({ name: 'Partida 2', hostUserId: 'host-2', maxPlayers: 2 }, 'GAME02');
      g2.addPlayer({ userId: 'host-1', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 14 });
      games.seed(g2);
      const codeGenerator = new FakeGameCodeGenerator(['GAME03']);
      const useCase = new CreateGameUseCase(games, codeGenerator);

      const result = await useCase.execute({ name: 'Mi propia partida', hostUserId: 'host-1', maxPlayers: 2 });

      expect(result.gameId).toBe('GAME03');
    });
  });
});
