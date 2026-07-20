export interface EquipmentProps {
  name: string;
  category: string; // ej. "Weapon", "Armor", "Adventuring Gear"
  cost: { quantity: number; unit: string } | null;
  weight: number | null;
  description: string;
  // Campos específicos de arma — null si el equipo no es un arma.
  weaponCategory: string | null; // "Simple" | "Martial"
  weaponRange: string | null; // "Melee" | "Ranged"
  damageDice: string | null;
  damageType: string | null;
  properties: string[];
}

/**
 * Catálogo maestro de equipo (armas, armadura, objetos de aventurero) —
 * mismo patrón que Enemy/Spell. Validado primero contra un arma (Dagger);
 * otras categorías de equipo (armadura, herramientas) pueden traer campos
 * propios que este modelo todavía no captura explícitamente.
 */
export class Equipment {
  private constructor(
    public readonly id: string,
    private readonly props: EquipmentProps,
  ) {}

  static create(props: EquipmentProps, id: string = crypto.randomUUID()): Equipment {
    return new Equipment(id, props);
  }

  toSnapshot(): EquipmentProps {
    return { ...this.props, properties: [...this.props.properties] };
  }
}
