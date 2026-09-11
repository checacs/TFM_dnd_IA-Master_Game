import { mapEquipment } from './equipment-mapper';

describe('mapEquipment (traducción de dnd5eapi.co)', () => {
  it('mapea un arma sin armor_class a armorClass: null', () => {
    const mapped = mapEquipment({
      index: 'dagger',
      name: 'Dagger',
      equipment_category: { index: 'weapon', name: 'Weapon' },
      weapon_category: 'Simple',
      weapon_range: 'Melee',
      cost: { quantity: 2, unit: 'gp' },
      damage: { damage_dice: '1d4', damage_type: { index: 'piercing', name: 'Piercing' } },
      properties: [{ index: 'finesse', name: 'Finesse' }],
    });

    expect(mapped.armorClass).toBeNull();
  });

  it('mapea armadura ligera real (leather armor: base 11, dex_bonus true, sin max_bonus)', () => {
    const mapped = mapEquipment({
      index: 'leather-armor',
      name: 'Leather Armor',
      equipment_category: { index: 'armor', name: 'Armor' },
      cost: { quantity: 10, unit: 'gp' },
      armor_class: { base: 11, dex_bonus: true },
    });

    expect(mapped.armorClass).toEqual({ base: 11, dexBonus: true, maxBonus: null });
  });

  it('mapea armadura media real (scale mail: base 14, dex_bonus true, max_bonus 2)', () => {
    const mapped = mapEquipment({
      index: 'scale-mail',
      name: 'Scale Mail',
      equipment_category: { index: 'armor', name: 'Armor' },
      cost: { quantity: 50, unit: 'gp' },
      armor_class: { base: 14, dex_bonus: true, max_bonus: 2 },
    });

    expect(mapped.armorClass).toEqual({ base: 14, dexBonus: true, maxBonus: 2 });
  });

  it('mapea armadura pesada real (plate: base 18, sin bonificador de destreza)', () => {
    const mapped = mapEquipment({
      index: 'plate',
      name: 'Plate',
      equipment_category: { index: 'armor', name: 'Armor' },
      cost: { quantity: 1500, unit: 'gp' },
      armor_class: { base: 18, dex_bonus: false },
    });

    expect(mapped.armorClass).toEqual({ base: 18, dexBonus: false, maxBonus: null });
  });
});
