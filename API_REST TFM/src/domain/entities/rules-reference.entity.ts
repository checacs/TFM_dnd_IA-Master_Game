export type RulesReferenceKind = 'condition' | 'skill' | 'damage-type' | 'ability-score' | 'rule-section';

export interface RulesReferenceProps {
  kind: RulesReferenceKind;
  name: string;
  description: string;
  /** Solo para kind === 'skill'. */
  abilityScore: string | null;
  /** Solo para kind === 'ability-score'. */
  relatedSkills: string[] | null;
}

/**
 * Catálogo unificado de referencias de reglas cortas — condiciones, habilidades,
 * tipos de daño, puntuaciones de característica y secciones de reglas. Se
 * unifican en una sola entidad porque comparten forma (índice + nombre +
 * descripción); separarlas en catálogos casi idénticos no aportaría nada.
 */
export class RulesReference {
  private constructor(
    public readonly id: string,
    private readonly props: RulesReferenceProps,
  ) {}

  static create(props: RulesReferenceProps, id: string = crypto.randomUUID()): RulesReference {
    return new RulesReference(id, props);
  }

  toSnapshot(): RulesReferenceProps {
    return { ...this.props, relatedSkills: this.props.relatedSkills ? [...this.props.relatedSkills] : null };
  }
}
