import { Enemy } from './enemy.entity';
import { DomainError } from '../errors/domain-error';

function buildEnemy(overrides: Partial<Parameters<typeof Enemy.create>[0]> = {}) {
  return Enemy.create({
    name: 'Goblin explorador',
    description: 'Pequeño humanoide huraño que ataca en grupo y huye si está herido.',
    tags: ['goblinoide', 'bosque', 'nivel_bajo'],
    challengeRating: 0.25,
    attributes: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    hp: 7,
    ac: 15,
    attacks: [{ name: 'Cimitarra', toHitBonus: 4, damageDice: '1d6+2', damageType: 'cortante' }],
    resistances: [],
    ...overrides,
  });
}

describe('Enemy', () => {
  describe('attributeModifier', () => {
    it('calcula el modificador igual que un personaje', () => {
      const goblin = buildEnemy();
      expect(goblin.attributeModifier('dex')).toBe(2); // (14-10)/2 = 2
      expect(goblin.attributeModifier('str')).toBe(-1);
    });
  });

  describe('primaryAttack', () => {
    it('devuelve el ataque con mayor bonificador de golpe', () => {
      const enemy = buildEnemy({
        attacks: [
          { name: 'Mordisco', toHitBonus: 2, damageDice: '1d4', damageType: 'perforante' },
          { name: 'Garra', toHitBonus: 5, damageDice: '1d6', damageType: 'cortante' },
        ],
      });
      expect(enemy.primaryAttack().name).toBe('Garra');
    });

    it('lanza DomainError si el enemigo no tiene ataques definidos', () => {
      const enemy = buildEnemy({ attacks: [] });
      expect(() => enemy.primaryAttack()).toThrow(DomainError);
    });
  });
});
