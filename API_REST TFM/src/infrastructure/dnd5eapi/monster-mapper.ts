export interface Dnd5eApiArmorClassEntry {
  type: string;
  value: number;
}

export interface Dnd5eApiDamage {
  damage_type: { name: string };
  damage_dice: string;
}

export interface Dnd5eApiAction {
  name: string;
  attack_bonus?: number;
  damage?: Dnd5eApiDamage[];
}

export interface Dnd5eApiSpecialAbility {
  name: string;
  desc: string;
}

export interface Dnd5eApiMonster {
  index: string;
  name: string;
  size: string;
  type: string;
  subtype?: string;
  alignment: string;
  armor_class: Dnd5eApiArmorClassEntry[];
  hit_points: number;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  challenge_rating: number;
  damage_resistances: string[];
  special_abilities?: Dnd5eApiSpecialAbility[];
  actions?: Dnd5eApiAction[];
  /** Ruta relativa (ej. "/api/images/monsters/aboleth.png") -- no todos los
   * monstruos del SRD tienen arte oficial, este campo puede faltar. */
  image?: string;
}

const DEFAULT_AC = 10;
const SOURCE_LABEL = 'dnd5eapi.co (SRD 2014)';
const DND5EAPI_ORIGIN = 'https://www.dnd5eapi.co';

/**
 * Traduce un monstruo real de dnd5eapi.co (SRD 2014) a nuestro EnemyProps.
 * Verificado contra la respuesta real de /api/2014/monsters/goblin, no contra
 * documentación — los nombres de campo de la API real mandan sobre cualquier
 * suposición previa.
 */
export function mapMonster(monster: Dnd5eApiMonster): {
  _id: string;
  name: string;
  description: string;
  tags: string[];
  challengeRating: number;
  attributes: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  hp: number;
  ac: number;
  attacks: { name: string; toHitBonus: number; damageDice: string; damageType: string }[];
  resistances: string[];
  source: string;
  imageUrl: string | null;
} {
  return {
    _id: monster.index,
    name: monster.name,
    description: buildDescription(monster),
    tags: buildTags(monster),
    challengeRating: monster.challenge_rating,
    attributes: {
      str: monster.strength,
      dex: monster.dexterity,
      con: monster.constitution,
      int: monster.intelligence,
      wis: monster.wisdom,
      cha: monster.charisma,
    },
    hp: monster.hit_points,
    ac: monster.armor_class?.[0]?.value ?? DEFAULT_AC,
    attacks: buildAttacks(monster),
    resistances: monster.damage_resistances ?? [],
    source: SOURCE_LABEL,
    imageUrl: monster.image ? `${DND5EAPI_ORIGIN}${monster.image}` : null,
  };
}

function buildTags(monster: Dnd5eApiMonster): string[] {
  return [monster.type, monster.subtype].filter((tag): tag is string => Boolean(tag)).map((tag) => tag.toLowerCase());
}

function buildDescription(monster: Dnd5eApiMonster): string {
  const subtypePart = monster.subtype ? ` (${monster.subtype})` : '';
  const base = `${monster.size} ${monster.type}${subtypePart}, ${monster.alignment}.`;

  const abilitiesText = (monster.special_abilities ?? [])
      .map((ability) => `${ability.name}: ${ability.desc}`)
      .join(' ');

  return abilitiesText ? `${base} ${abilitiesText}` : base;
}

function buildAttacks(monster: Dnd5eApiMonster) {
  return (monster.actions ?? [])
      .map((action) => {
        const firstDamage = action.damage?.[0];
        const damageType = firstDamage?.damage_type?.name;
        if (action.attack_bonus === undefined || !damageType || !firstDamage?.damage_dice) {
          return null;
        }
        return {
          name: action.name,
          toHitBonus: action.attack_bonus,
          damageDice: firstDamage.damage_dice,
          damageType: damageType.toLowerCase(),
        };
      })
      .filter((attack): attack is NonNullable<typeof attack> => attack !== null);
}