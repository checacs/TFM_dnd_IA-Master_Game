export interface Dnd5eApiEquipment {
  index: string;
  name: string;
  desc?: string[];
  special?: string[];
  equipment_category: { index: string; name: string };
  weapon_category?: string;
  weapon_range?: string;
  cost?: { quantity: number; unit: string };
  damage?: { damage_dice: string; damage_type: { index: string; name: string } };
  weight?: number;
  properties?: { index: string; name: string }[];
  armor_class?: { base: number; dex_bonus: boolean; max_bonus?: number | null };
}

interface MappedEquipment {
  _id: string;
  name: string;
  category: string;
  cost: { quantity: number; unit: string } | null;
  weight: number | null;
  description: string;
  weaponCategory: string | null;
  weaponRange: string | null;
  damageDice: string | null;
  damageType: string | null;
  properties: string[];
  armorClass: { base: number; dexBonus: boolean; maxBonus: number | null } | null;
}

/**
 * Traduce equipo real de dnd5eapi.co (SRD 2014) a nuestro catálogo.
 * Verificado contra /api/2014/equipment/dagger para armas y contra
 * /api/2014/equipment/leather-armor y /api/2014/equipment/chain-mail para
 * armadura (armor_class: {base, dex_bonus, max_bonus} — max_bonus solo
 * aparece en armadura media, ausente del todo en ligera y en pesada).
 */
export function mapEquipment(equipment: Dnd5eApiEquipment): MappedEquipment {
  const descText = equipment.desc?.join(' ') ?? '';
  const specialText = equipment.special?.join(' ') ?? '';

  return {
    _id: equipment.index,
    name: equipment.name,
    category: equipment.equipment_category.name,
    cost: equipment.cost ?? null,
    weight: equipment.weight ?? null,
    description: descText || specialText,
    weaponCategory: equipment.weapon_category ?? null,
    weaponRange: equipment.weapon_range ?? null,
    damageDice: equipment.damage?.damage_dice ?? null,
    damageType: equipment.damage?.damage_type?.name?.toLowerCase() ?? null,
    properties: equipment.properties?.map((p) => p.index) ?? [],
    armorClass: equipment.armor_class
      ? {
          base: equipment.armor_class.base,
          dexBonus: equipment.armor_class.dex_bonus,
          maxBonus: equipment.armor_class.max_bonus ?? null,
        }
      : null,
  };
}
