import { Enemy } from '../../../../domain/entities/enemy.entity';
import { EnemyMapper } from './enemy.mapper';

describe('EnemyMapper', () => {
  it('convierte de dominio a persistencia y de vuelta sin perder datos', () => {
    const goblin = Enemy.create({
      name: 'Goblin explorador',
      description: 'Pequeño y huraño.',
      tags: ['goblinoide', 'bosque'],
      challengeRating: 0.25,
      attributes: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      hp: 7,
      ac: 15,
      attacks: [{ name: 'Cimitarra', toHitBonus: 4, damageDice: '1d6+2', damageType: 'cortante' }],
      resistances: [],
      imageUrl: 'https://www.dnd5eapi.co/api/images/monsters/goblin.png',
    });

    const persisted = EnemyMapper.toPersistence(goblin);
    const recovered = EnemyMapper.toDomain(persisted);

    expect(recovered.id).toBe(goblin.id);
    expect(recovered.toSnapshot()).toEqual(goblin.toSnapshot());
    expect(recovered.toSnapshot().imageUrl).toBe('https://www.dnd5eapi.co/api/images/monsters/goblin.png');
  });
});
