export interface Dnd5eApiMagicItem {
  index: string;
  name: string;
  equipment_category: { index: string; name: string };
  rarity: { name: string };
  variants: { index: string; name: string; url: string }[];
  variant: boolean;
  desc: string[];
}

interface MappedMagicItem {
  _id: string;
  name: string;
  category: string;
  rarity: string;
  description: string;
  isVariant: boolean;
  variantNames: string[];
}

/**
 * Traduce un objeto mágico real de dnd5eapi.co (SRD 2014) a nuestro catálogo.
 * Verificado contra /api/2014/magic-items/adamantine-armor.
 */
export function mapMagicItem(item: Dnd5eApiMagicItem): MappedMagicItem {
  return {
    _id: item.index,
    name: item.name,
    category: item.equipment_category.name,
    rarity: item.rarity.name,
    description: item.desc.join(' '),
    isVariant: item.variant,
    variantNames: item.variants.map((v) => v.name),
  };
}
