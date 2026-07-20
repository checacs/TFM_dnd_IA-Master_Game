export interface MagicItemProps {
  name: string;
  category: string; // equipment_category.name, ej. "Armor", "Wondrous Items"
  rarity: string; // ej. "Uncommon", "Rare"
  description: string;
  isVariant: boolean;
  variantNames: string[]; // nombres de sus variantes, si las tiene
}

/**
 * Catálogo maestro de objetos mágicos — mismo patrón que Enemy/Spell/Equipment.
 * Menos estructurado mecánicamente que Equipment (casi todo es texto de
 * descripción + rareza), pero el DM-IA lo necesita para no inventar el
 * efecto de un objeto mágico que aparezca en la narración.
 */
export class MagicItem {
  private constructor(
    public readonly id: string,
    private readonly props: MagicItemProps,
  ) {}

  static create(props: MagicItemProps, id: string = crypto.randomUUID()): MagicItem {
    return new MagicItem(id, props);
  }

  toSnapshot(): MagicItemProps {
    return { ...this.props, variantNames: [...this.props.variantNames] };
  }
}
