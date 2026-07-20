import { Spell } from '../../../../domain/entities/spell.entity';
import { SpellMapper } from './spell.mapper';

describe('SpellMapper', () => {
  it('convierte de dominio a persistencia y de vuelta sin perder datos', () => {
    const spell = Spell.create({
      name: 'Fireball', level: 3, school: 'Evocation', castingTime: '1 action', range: '150 feet',
      duration: 'Instantaneous', concentration: false, ritual: false, components: ['V', 'S', 'M'],
      material: 'A tiny ball of bat guano and sulfur.', description: '...', classes: ['sorcerer', 'wizard'],
      damageType: 'fire', damageAtSlotLevel: { '3': '8d6' }, savingThrowAbility: 'dex',
      savingThrowSuccess: 'half', areaOfEffectType: 'sphere', areaOfEffectSize: 20,
    });

    const persisted = SpellMapper.toPersistence(spell);
    const recovered = SpellMapper.toDomain(persisted);

    expect(recovered.id).toBe(spell.id);
    expect(recovered.toSnapshot()).toEqual(spell.toSnapshot());
  });
});
