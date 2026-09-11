import { mapMonster, Dnd5eApiMonster } from './monster-mapper';

// JSON real devuelto por GET https://www.dnd5eapi.co/api/2014/monsters/goblin
// (capturado en pruebas manuales, no inventado) — recortado a los campos que usamos.
const GOBLIN_FIXTURE: Dnd5eApiMonster = {
  index: 'goblin',
  name: 'Goblin',
  size: 'Small',
  type: 'humanoid',
  subtype: 'goblinoid',
  alignment: 'neutral evil',
  armor_class: [{ type: 'armor', value: 15 }],
  hit_points: 7,
  strength: 8,
  dexterity: 14,
  constitution: 10,
  intelligence: 10,
  wisdom: 8,
  charisma: 8,
  challenge_rating: 0.25,
  damage_resistances: [],
  special_abilities: [
    {
      name: 'Nimble Escape',
      desc: 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.',
    },
  ],
  actions: [
    {
      name: 'Scimitar',
      attack_bonus: 4,
      damage: [{ damage_type: { name: 'Slashing' }, damage_dice: '1d6+2' }],
    },
    {
      name: 'Shortbow',
      attack_bonus: 4,
      damage: [{ damage_type: { name: 'Piercing' }, damage_dice: '1d6+2' }],
    },
  ],
  // El goblin real de dnd5eapi.co no trae campo `image` -- a propósito, para
  // cubrir el caso (frecuente en el SRD) de un monstruo sin arte oficial.
};

// JSON real devuelto por GET https://www.dnd5eapi.co/api/2014/monsters/aboleth
// (recortado a los campos que usamos) -- este sí trae `image`.
const ABOLETH_IMAGE_PATH = '/api/images/monsters/aboleth.png';

describe('mapMonster', () => {
  it('mapea el goblin real de dnd5eapi.co al formato EnemyProps', () => {
    const result = mapMonster(GOBLIN_FIXTURE);

    expect(result).toEqual({
      _id: 'goblin',
      name: 'Goblin',
      description:
          'Small humanoid (goblinoid), neutral evil. Nimble Escape: The goblin can take the Disengage or Hide action as a bonus action on each of its turns.',
      tags: ['humanoid', 'goblinoid'],
      challengeRating: 0.25,
      attributes: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      hp: 7,
      ac: 15,
      attacks: [
        { name: 'Scimitar', toHitBonus: 4, damageDice: '1d6+2', damageType: 'slashing' },
        { name: 'Shortbow', toHitBonus: 4, damageDice: '1d6+2', damageType: 'piercing' },
      ],
      resistances: [],
      source: 'dnd5eapi.co (SRD 2014)',
      imageUrl: null,
    });
  });

  it('construye la URL absoluta de la imagen cuando el monstruo trae `image` (ej. aboleth)', () => {
    const result = mapMonster({ ...GOBLIN_FIXTURE, image: ABOLETH_IMAGE_PATH });
    expect(result.imageUrl).toBe(`https://www.dnd5eapi.co${ABOLETH_IMAGE_PATH}`);
  });

  it('deja imageUrl en null si el monstruo no trae `image` (frecuente en el SRD)', () => {
    const result = mapMonster(GOBLIN_FIXTURE);
    expect(result.imageUrl).toBeNull();
  });

  it('descarta acciones con damage incompleto (sin damage_type o sin damage_dice), en vez de romper', () => {
    const result = mapMonster({
      ...GOBLIN_FIXTURE,
      actions: [
        { name: 'Ataque raro', attack_bonus: 3, damage: [{ damage_dice: '1d4' } as never] },
        { name: 'Otro ataque raro', attack_bonus: 3, damage: [{ damage_type: { name: 'Fire' } } as never] },
      ],
    });
    expect(result.attacks).toEqual([]);
  });

  it('usa CA 10 por defecto si el monstruo no trae armor_class', () => {
    const result = mapMonster({ ...GOBLIN_FIXTURE, armor_class: [] });
    expect(result.ac).toBe(10);
  });

  it('descarta acciones sin daño (utilitarias) en vez de romper el mapeo', () => {
    const result = mapMonster({
      ...GOBLIN_FIXTURE,
      actions: [{ name: 'Multiattack', desc: 'The goblin makes two attacks.' } as never],
    });
    expect(result.attacks).toEqual([]);
  });

  it('no incluye subtipo en tags ni en la descripción si el monstruo no tiene subtype', () => {
    const result = mapMonster({ ...GOBLIN_FIXTURE, subtype: undefined, special_abilities: [] });
    expect(result.tags).toEqual(['humanoid']);
    expect(result.description).toBe('Small humanoid, neutral evil.');
  });
});