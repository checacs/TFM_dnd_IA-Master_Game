import { InMemoryCharacterRepository } from './in-memory-character.repository';
import { Character } from '../../../domain/entities/character.entity';

describe('InMemoryCharacterRepository', () => {
  it('devuelve exactamente el estado guardado al recuperarlo (ida y vuelta)', async () => {
    const repo = new InMemoryCharacterRepository();
    const character = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago' });

    await repo.save(character);
    const recovered = await repo.findById(character.id);

    expect(recovered?.toSnapshot()).toEqual(character.toSnapshot());
  });

  it('devuelve null si el personaje no existe', async () => {
    const repo = new InMemoryCharacterRepository();
    expect(await repo.findById('no-existe')).toBeNull();
  });
});
