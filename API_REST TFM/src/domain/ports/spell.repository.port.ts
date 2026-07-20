import { Spell } from '../entities/spell.entity';

export interface SpellSearchCriteria {
  classIndex?: string;
  maxLevel?: number;
}

export interface SpellRepository {
  findById(id: string): Promise<Spell | null>;
  search(criteria: SpellSearchCriteria): Promise<Spell[]>;
}

export const SPELL_REPOSITORY = Symbol('SpellRepository');
