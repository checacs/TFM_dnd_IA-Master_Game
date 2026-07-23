import { mapSpell, Dnd5eApiSpell } from './spell-mapper';

// JSON real devuelto por GET https://www.dnd5eapi.co/api/2014/spells/fireball
const FIREBALL_FIXTURE: Dnd5eApiSpell = {
  index: 'fireball',
  name: 'Fireball',
  desc: [
    'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.',
    "The fire spreads around corners. It ignites flammable objects in the area that aren't being worn or carried.",
  ],
  higher_level: [
    'When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.',
  ],
  range: '150 feet',
  components: ['V', 'S', 'M'],
  material: 'A tiny ball of bat guano and sulfur.',
  ritual: false,
  duration: 'Instantaneous',
  concentration: false,
  casting_time: '1 action',
  level: 3,
  damage: {
    damage_type: { name: 'Fire' },
    damage_at_slot_level: { '3': '8d6', '4': '9d6', '5': '10d6', '6': '11d6', '7': '12d6', '8': '13d6', '9': '14d6' },
  },
  dc: { dc_type: { index: 'dex', name: 'DEX' }, dc_success: 'half' },
  area_of_effect: { type: 'sphere', size: 20 },
  school: { index: 'evocation', name: 'Evocation' },
  classes: [
    { index: 'sorcerer', name: 'Sorcerer' },
    { index: 'wizard', name: 'Wizard' },
  ],
};

describe('mapSpell', () => {
  it('mapea el Fireball real de dnd5eapi.co al formato de nuestro catálogo', () => {
    const result = mapSpell(FIREBALL_FIXTURE);

    expect(result).toEqual({
      _id: 'fireball',
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
      description:
        "A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one. The fire spreads around corners. It ignites flammable objects in the area that aren't being worn or carried. When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.",
      classes: ['sorcerer', 'wizard'],
      damageType: 'fire',
      damageAtSlotLevel: { '3': '8d6', '4': '9d6', '5': '10d6', '6': '11d6', '7': '12d6', '8': '13d6', '9': '14d6' },
      savingThrowAbility: 'dex',
      savingThrowSuccess: 'half',
      areaOfEffectType: 'sphere',
      areaOfEffectSize: 20,
    });
  });

  it('devuelve null en los campos opcionales para un hechizo sin daño, salvación ni área (ej. utilitario)', () => {
    const result = mapSpell({
      index: 'mage-armor',
      name: 'Mage Armor',
      desc: ['You touch a willing creature who isn\u0027t wearing armor.'],
      range: 'Touch',
      components: ['V', 'S', 'M'],
      material: 'A piece of cured leather.',
      ritual: false,
      duration: '8 hours',
      concentration: false,
      casting_time: '1 action',
      level: 1,
      school: { index: 'abjuration', name: 'Abjuration' },
      classes: [{ index: 'sorcerer', name: 'Sorcerer' }, { index: 'wizard', name: 'Wizard' }],
    });

    expect(result.damageType).toBeNull();
    expect(result.damageAtSlotLevel).toBeNull();
    expect(result.savingThrowAbility).toBeNull();
    expect(result.savingThrowSuccess).toBeNull();
    expect(result.areaOfEffectType).toBeNull();
    expect(result.areaOfEffectSize).toBeNull();
    expect(result.description).toBe("You touch a willing creature who isn't wearing armor.");
  });

  it('quita los espacios del daño por nivel de ranura (dnd5eapi.co real: Magic Missile trae "3d4 + 3")', () => {
    // CASO REAL detectado en partida: RandomDiceRoller rechazaba "3d4 + 3"
    // (con espacios) al lanzar Misiles Mágicos, y como cast-spell.use-case.ts
    // gastaba la ranura antes de tirar el daño, el mago perdía sus ranuras
    // sin llegar a lanzar el hechizo. El fix real está en cast-spell.use-case
    // (reordenar) + aquí (normalizar en el punto de entrada del catálogo).
    const result = mapSpell({
      index: 'magic-missile',
      name: 'Magic Missile',
      desc: ['You create three glowing darts of magical force.'],
      range: '120 feet',
      components: ['V', 'S'],
      ritual: false,
      duration: 'Instantaneous',
      concentration: false,
      casting_time: '1 action',
      level: 1,
      damage: {
        damage_type: { name: 'Force' },
        damage_at_slot_level: { '1': '3d4 + 3', '2': '4d4 + 4', '3': '5d4 + 5' },
      },
      school: { index: 'evocation', name: 'Evocation' },
      classes: [{ index: 'sorcerer', name: 'Sorcerer' }, { index: 'wizard', name: 'Wizard' }],
    });

    expect(result.damageAtSlotLevel).toEqual({ '1': '3d4+3', '2': '4d4+4', '3': '5d4+5' });
  });
});
