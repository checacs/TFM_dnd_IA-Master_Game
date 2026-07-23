export interface Dnd5eApiSpellClassRef {
  index: string;
  name: string;
}

export interface Dnd5eApiSpellDamage {
  damage_type: { name: string };
  damage_at_slot_level?: Record<string, string>;
}

export interface Dnd5eApiSpellDc {
  dc_type: { index: string; name: string };
  dc_success: string;
}

export interface Dnd5eApiSpellAreaOfEffect {
  type: string;
  size: number;
}

export interface Dnd5eApiSpell {
  index: string;
  name: string;
  desc: string[];
  higher_level?: string[];
  range: string;
  components: string[];
  material?: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: string;
  level: number;
  damage?: Dnd5eApiSpellDamage;
  dc?: Dnd5eApiSpellDc;
  area_of_effect?: Dnd5eApiSpellAreaOfEffect;
  school: { index: string; name: string };
  classes: Dnd5eApiSpellClassRef[];
}

/**
 * Traduce un hechizo real de dnd5eapi.co (SRD 2014) a nuestro catálogo.
 * Verificado contra la respuesta real de /api/2014/spells/fireball.
 */
export function mapSpell(spell: Dnd5eApiSpell): {
  _id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  components: string[];
  material: string | null;
  description: string;
  classes: string[];
  damageType: string | null;
  damageAtSlotLevel: Record<string, string> | null;
  savingThrowAbility: string | null;
  savingThrowSuccess: string | null;
  areaOfEffectType: string | null;
  areaOfEffectSize: number | null;
} {
  return {
    _id: spell.index,
    name: spell.name,
    level: spell.level,
    school: spell.school.name,
    castingTime: spell.casting_time,
    range: spell.range,
    duration: spell.duration,
    concentration: spell.concentration,
    ritual: spell.ritual,
    components: spell.components,
    material: spell.material ?? null,
    description: buildDescription(spell),
    classes: spell.classes.map((c) => c.index),
    damageType: spell.damage?.damage_type?.name?.toLowerCase() ?? null,
    damageAtSlotLevel: normalizeDamageAtSlotLevel(spell.damage?.damage_at_slot_level),
    savingThrowAbility: spell.dc?.dc_type?.index ?? null,
    savingThrowSuccess: spell.dc?.dc_success ?? null,
    areaOfEffectType: spell.area_of_effect?.type ?? null,
    areaOfEffectSize: spell.area_of_effect?.size ?? null,
  };
}

function buildDescription(spell: Dnd5eApiSpell): string {
  const base = spell.desc.join(' ');
  const higher = spell.higher_level?.join(' ') ?? '';
  return higher ? `${base} ${higher}` : base;
}

/**
 * dnd5eapi.co escribe el daño de algunos hechizos CON espacios alrededor del
 * modificador -- ej. Magic Missile: damage_at_slot_level["1"] = "3d4 + 3"
 * (a diferencia de damage_dice de monstruos/equipo, que suele venir sin
 * espacios, ej. "1d6+2"). RandomDiceRoller nunca aceptó esos espacios.
 *
 * CASO REAL detectado en partida: cast_spell fallaba con "Notación de dado
 * inválida: 3d4 + 3" al lanzar Misiles Mágicos -- y como el gasto de la
 * ranura ocurría ANTES de tirar el daño (ver cast-spell.use-case.ts), el
 * mago perdía sus ranuras de nivel 1 sin llegar a lanzar el hechizo ni una
 * sola vez. Se normaliza aquí, en el punto donde el formato externo entra al
 * catálogo, en vez de en cada sitio que luego lee damageAtSlotLevel.
 */
function normalizeDamageAtSlotLevel(raw: Record<string, string> | undefined): Record<string, string> | null {
  if (!raw) return null;
  return Object.fromEntries(Object.entries(raw).map(([level, notation]) => [level, notation.replace(/\s+/g, '')]));
}
