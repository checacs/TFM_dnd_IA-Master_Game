export interface SpellProps {
  name: string;
  level: number; // 0 = truco (cantrip)
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  components: string[];
  material: string | null;
  description: string;
  /** Índices de clase de la API (ej. "sorcerer", "wizard") — no necesariamente coinciden con nuestras 4 clases simplificadas todavía. */
  classes: string[];
  damageType: string | null;
  damageAtSlotLevel: Record<string, string> | null;
  savingThrowAbility: string | null;
  savingThrowSuccess: string | null;
  areaOfEffectType: string | null;
  areaOfEffectSize: number | null;
}

/**
 * Catálogo maestro de hechizos — mismo patrón que Enemy y BattleMap: datos
 * ya importados (no en tiempo real), reutilizables entre partidas. El DM-IA
 * los consulta por nombre o clase, nunca inventa sus efectos.
 */
export class Spell {
  private constructor(
    public readonly id: string,
    private readonly props: SpellProps,
  ) {}

  static create(props: SpellProps, id: string = crypto.randomUUID()): Spell {
    return new Spell(id, props);
  }

  toSnapshot(): SpellProps {
    return { ...this.props, components: [...this.props.components], classes: [...this.props.classes] };
  }
}
