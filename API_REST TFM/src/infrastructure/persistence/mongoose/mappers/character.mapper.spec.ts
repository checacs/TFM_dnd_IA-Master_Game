import { Character } from '../../../../domain/entities/character.entity';
import { CharacterMapper } from './character.mapper';

describe('CharacterMapper', () => {
  it('convierte de dominio a persistencia y de vuelta sin perder datos', () => {
    const character = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago' });

    const persisted = CharacterMapper.toPersistence(character);
    const recovered = CharacterMapper.toDomain(persisted);

    expect(recovered.id).toBe(character.id);
    expect(recovered.toSnapshot()).toEqual(character.toSnapshot());
  });

  it('conserva null en spells para clases no conjuradoras', () => {
    const guerrero = Character.createNew({ ownerId: 'user-1', gameId: 'game-1', name: 'Thane', class: 'guerrero' });

    const persisted = CharacterMapper.toPersistence(guerrero);
    expect(persisted.spells).toBeNull();

    const recovered = CharacterMapper.toDomain(persisted);
    expect(recovered.toSnapshot().spells).toBeNull();
  });
});
