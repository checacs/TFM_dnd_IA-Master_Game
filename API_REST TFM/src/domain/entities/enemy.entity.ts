import { DomainError } from '../errors/domain-error';
import { AttributeKey } from './character.entity';

export interface Attack {
  name: string;
  toHitBonus: number;
  damageDice: string;
  damageType: string;
}

export interface EnemyProps {
  name: string;
  description: string;
  tags: string[];
  challengeRating: number;
  attributes: Record<AttributeKey, number>;
  hp: number;
  ac: number;
  attacks: Attack[];
  resistances: string[];
  source?: string;
  /** URL absoluta a la imagen del monstruo (ej. dnd5eapi.co/api/images/monsters/...).
   * No todos los monstruos del SRD tienen arte oficial — null/ausente si no hay. */
  imageUrl?: string | null;
}

/**
 * Enemigo del catálogo maestro (docs/02-modelo-datos-mongodb.md).
 * Es catálogo de solo lectura reutilizado entre partidas — sus estadísticas
 * nunca las inventa el motor de IA, siempre se consultan aquí.
 */
export class Enemy {
  private constructor(
    public readonly id: string,
    private readonly props: EnemyProps,
  ) {}

  static create(props: EnemyProps, id: string = crypto.randomUUID()): Enemy {
    return new Enemy(id, props);
  }

  attributeModifier(attribute: AttributeKey): number {
    return Math.floor((this.props.attributes[attribute] - 10) / 2);
  }

  primaryAttack(): Attack {
    if (this.props.attacks.length === 0) {
      throw new DomainError('El enemigo no tiene ataques definidos');
    }
    return this.props.attacks.reduce((best, attack) =>
      attack.toHitBonus > best.toHitBonus ? attack : best,
    );
  }

  toSnapshot(): EnemyProps {
    return { ...this.props, attributes: { ...this.props.attributes }, attacks: [...this.props.attacks] };
  }
}
