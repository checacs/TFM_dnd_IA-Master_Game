import { InMemoryGameRepository } from './in-memory-game.repository';
import { Game } from '../../../domain/entities/game.entity';

describe('InMemoryGameRepository', () => {
  it('devuelve exactamente el estado guardado al recuperarlo (ida y vuelta)', async () => {
    const repo = new InMemoryGameRepository();
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });

    await repo.save(game);
    const recovered = await repo.findById(game.id);

    expect(recovered?.toSnapshot()).toEqual(game.toSnapshot());
  });

  it('devuelve null si la partida no existe', async () => {
    const repo = new InMemoryGameRepository();
    expect(await repo.findById('no-existe')).toBeNull();
  });
});