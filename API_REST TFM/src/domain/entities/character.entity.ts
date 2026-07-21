import { DomainError } from '../errors/domain-error';

export type CharacterClass = 'guerrero' | 'picaro' | 'mago' | 'clerigo';
export type AttributeKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface SpellSlots {
  level1: { max: number; used: number };
  level2: { max: number; used: number };
}

export interface InventoryItem {
  // Normalmente Equipment._id del catálogo de equipo (arma/armadura/objeto de
  // aventurero). GrantMagicItemUseCase reutiliza este mismo campo para el id
  // de un objeto del catálogo de objetos mágicos (MagicItem._id) en vez de
  // introducir un tipo de inventario paralelo -- ningún caso de uso revalida
  // este id contra la colección `equipment` después de guardarlo, así que no
  // hay colisión funcional real. equipWeapon sigue exigiendo que el id
  // corresponda a un arma real del catálogo de equipo (un objeto mágico
  // nunca se "equipa" como arma por esta vía).
  equipmentId: string;
  name: string; // copia ligera, para no ir al catálogo solo por el nombre
}

export interface CharacterProps {
  ownerId: string;
  gameId: string;
  name: string;
  class: CharacterClass;
  level: number;
  xp: number;
  attributes: Record<AttributeKey, number>;
  hp: { current: number; max: number };
  ac: number;
  unassignedSkillPoints: number;
  spellcaster: boolean;
  spells: { known: string[]; slots: SpellSlots } | null;
  inventory: InventoryItem[];
  equippedWeaponId: string | null;
}

export type CreateCharacterInput = Omit<
  CharacterProps,
  'level' | 'xp' | 'spellcaster' | 'spells' | 'inventory' | 'equippedWeaponId'
> &
  Partial<Pick<CharacterProps, 'level' | 'xp' | 'spellcaster' | 'spells' | 'inventory' | 'equippedWeaponId'>>;

const SPELLCASTER_CLASSES: CharacterClass[] = ['mago', 'clerigo'];

/**
 * Conjuros conocidos de nivel 1 al crear el personaje (docs/01, tabla de
 * progresión: nivel 1 = "2 conjuros conocidos"). Antes esto se dejaba
 * siempre vacío ([]) -- se detectó en partida real que un mago entraba en
 * combate sin ningún hechizo ni forma de lanzarlo. IDs reales del catálogo
 * dnd5eapi (ver cast-spell.use-case.ts): un hechizo de ataque automático (sin
 * tirada de salvación, encaja con la simplificación de "impacto automático"
 * del motor) y uno utilitario, para que el jugador tenga tanto una opción de
 * combate como una de utilidad desde el primer momento.
 */
const STARTING_SPELLS_BY_CLASS: Partial<Record<CharacterClass, string[]>> = {
  mago: ['magic-missile', 'mage-armor'],
  clerigo: ['guiding-bolt', 'bless'],
};

/**
 * Matriz de atributos iniciales por clase. No estaba definida en
 * docs/01-especificacion-funcional.md — se fija aquí, de forma simplificada
 * (sin point-buy ni tirada de creación), para que unirse a una partida
 * (JoinGameUseCase) tenga un personaje jugable desde el primer momento.
 */
const STARTING_ATTRIBUTES: Record<CharacterClass, Record<AttributeKey, number>> = {
  guerrero: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 8 },
  picaro: { str: 10, dex: 16, con: 12, int: 10, wis: 8, cha: 12 },
  mago: { str: 8, dex: 12, con: 12, int: 16, wis: 10, cha: 10 },
  clerigo: { str: 12, dex: 8, con: 14, int: 8, wis: 16, cha: 10 },
};

const BASE_HP_BY_CLASS: Record<CharacterClass, number> = {
  guerrero: 12,
  picaro: 10,
  mago: 8,
  clerigo: 10,
};

const BASE_AC = 10; // sin armadura equipada — CA = 10 + mod. destreza

const MAX_LEVEL = 5;
const SKILL_POINTS_PER_LEVEL = 2;

/** Umbral de XP para alcanzar cada nivel (docs/01-especificacion-funcional.md, tabla de progresión). */
const LEVEL_XP_THRESHOLDS: Record<number, number> = { 2: 300, 3: 900, 4: 2700, 5: 6500 };

/**
 * Incremento de slots de conjuro al alcanzar cada nivel. El "+1 conjuro conocido"
 * de la tabla del paso 1 se deja fuera a propósito: elegir qué conjuro nuevo se
 * aprende es una decisión del jugador, no algo que GrantXpUseCase pueda resolver
 * por su cuenta — queda pendiente de una futura LearnSpellUseCase.
 */
const SPELL_SLOT_INCREASES: Partial<Record<number, Partial<Record<'level1' | 'level2', number>>>> = {
  2: { level1: 1 },
  3: { level2: 1 },
  5: { level2: 1 },
};

export class Character {
  private constructor(
    public readonly id: string,
    private props: CharacterProps,
  ) {}

  static create(input: CreateCharacterInput, id: string = crypto.randomUUID()): Character {
    const spellcaster = input.spellcaster ?? SPELLCASTER_CLASSES.includes(input.class);
    return new Character(id, {
      ...input,
      level: input.level ?? 1,
      xp: input.xp ?? 0,
      spellcaster,
      spells: input.spells ?? (spellcaster ? { known: STARTING_SPELLS_BY_CLASS[input.class] ?? [], slots: startingSpellSlots() } : null),
      inventory: input.inventory ?? [],
      equippedWeaponId: input.equippedWeaponId ?? null,
    });
  }

  /** Crea un personaje nuevo de nivel 1 al unirse a una partida (JoinGameUseCase). */
  static createNew(
    input: { ownerId: string; gameId: string; name: string; class: CharacterClass },
    id: string = crypto.randomUUID(),
  ): Character {
    const attributes = { ...STARTING_ATTRIBUTES[input.class] };
    const conModifier = Math.floor((attributes.con - 10) / 2);
    const dexModifier = Math.floor((attributes.dex - 10) / 2);
    const maxHp = BASE_HP_BY_CLASS[input.class] + conModifier;

    return Character.create(
      {
        ownerId: input.ownerId,
        gameId: input.gameId,
        name: input.name,
        class: input.class,
        attributes,
        hp: { current: maxHp, max: maxHp },
        ac: BASE_AC + dexModifier,
        unassignedSkillPoints: 0,
      },
      id,
    );
  }

  attributeModifier(attribute: AttributeKey): number {
    return Math.floor((this.props.attributes[attribute] - 10) / 2);
  }

  assignSkillPoint(attribute: AttributeKey): void {
    if (this.props.unassignedSkillPoints <= 0) {
      throw new DomainError('No hay puntos de habilidad disponibles');
    }
    this.props.attributes[attribute] += 1;
    this.props.unassignedSkillPoints -= 1;
  }

  receiveDamage(amount: number): void {
    this.props.hp.current = Math.max(0, this.props.hp.current - amount);
  }

  /** Otorga XP (GrantXpUseCase, invocado por el DM-IA) y sube de nivel tantas veces como corresponda. */
  gainXp(amount: number): void {
    this.props.xp += amount;
    while (this.props.level < MAX_LEVEL && this.props.xp >= LEVEL_XP_THRESHOLDS[this.props.level + 1]) {
      this.levelUp();
    }
  }

  private levelUp(): void {
    this.props.level += 1;
    this.props.unassignedSkillPoints += SKILL_POINTS_PER_LEVEL;

    const slotIncrease = SPELL_SLOT_INCREASES[this.props.level];
    if (this.props.spellcaster && this.props.spells && slotIncrease) {
      if (slotIncrease.level1) this.props.spells.slots.level1.max += slotIncrease.level1;
      if (slotIncrease.level2) this.props.spells.slots.level2.max += slotIncrease.level2;
    }
  }

  isDefeated(): boolean {
    return this.props.hp.current === 0;
  }

  /** Añade un objeto del catálogo de equipo a la mochila del personaje. */
  addToInventory(item: InventoryItem): void {
    this.props.inventory.push(item);
  }

  /** Fija el arma activa — debe estar ya en el inventario. */
  equipWeapon(equipmentId: string): void {
    const owns = this.props.inventory.some((item) => item.equipmentId === equipmentId);
    if (!owns) {
      throw new DomainError('No puedes equipar un objeto que no está en tu inventario');
    }
    this.props.equippedWeaponId = equipmentId;
  }

  /** ¿Este personaje conoce este hechizo del catálogo? */
  knowsSpell(spellId: string): boolean {
    return this.props.spells?.known.includes(spellId) ?? false;
  }

  /** Consume una ranura de conjuro del nivel indicado — CastSpellUseCase. */
  consumeSpellSlot(level: 1 | 2): void {
    if (!this.props.spellcaster || !this.props.spells) {
      throw new DomainError('Este personaje no es conjurador');
    }
    const slot = level === 1 ? this.props.spells.slots.level1 : this.props.spells.slots.level2;
    if (slot.used >= slot.max) {
      throw new DomainError(`No quedan ranuras de nivel ${level} disponibles`);
    }
    slot.used += 1;
  }

  toSnapshot(): CharacterProps {
    return {
      ...this.props,
      attributes: { ...this.props.attributes },
      hp: { ...this.props.hp },
      inventory: this.props.inventory.map((item) => ({ ...item })),
    };
  }
}

/** Slots de conjuro de nivel 1 (docs/01-especificacion-funcional.md, tabla de progresión). */
function startingSpellSlots(): SpellSlots {
  return { level1: { max: 2, used: 0 }, level2: { max: 0, used: 0 } };
}
