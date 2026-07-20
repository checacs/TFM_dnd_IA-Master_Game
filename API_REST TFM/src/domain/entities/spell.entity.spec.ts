import { Spell } from './spell.entity';

function buildSpell(overrides: Partial<Parameters<typeof Spell.create>[0]> = {}) {
  return Spell.create({
    name: 'Fireball',
    level: 3,
    school: 'Evocation',
    castingTime: '1 action',
    range: '150 feet',
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    components: ['V', 'S', 'M'],
    material: 'A tiny ball of bat guano and sulfur.',
    description: 'Una bola de fuego explota...',
    classes: ['sorcerer', 'wizard'],
    damageType: 'fire',
    damageAtSlotLevel: { '3': '8d6' },
    savingThrowAbility: 'dex',
    savingThrowSuccess: 'half',
    areaOfEffectType: 'sphere',
    areaOfEffectSize: 20,
    ...overrides,
  });
}

describe('Spell', () => {
  it('expone sus datos a través de toSnapshot', () => {
    const spell = buildSpell();
    expect(spell.toSnapshot().name).toBe('Fireball');
    expect(spell.toSnapshot().classes).toEqual(['sorcerer', 'wizard']);
  });

  it('toSnapshot devuelve copias, no las referencias internas de components/classes', () => {
    const spell = buildSpell();
    const snapshot = spell.toSnapshot();
    snapshot.components.push('otro');
    snapshot.classes.push('otra-clase');

    expect(spell.toSnapshot().components).toEqual(['V', 'S', 'M']);
    expect(spell.toSnapshot().classes).toEqual(['sorcerer', 'wizard']);
  });
});
