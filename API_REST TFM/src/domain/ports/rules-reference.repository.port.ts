import { RulesReference, RulesReferenceKind } from '../entities/rules-reference.entity';

export interface RulesReferenceSearchCriteria {
  kind?: RulesReferenceKind;
}

export interface RulesReferenceRepository {
  findById(id: string): Promise<RulesReference | null>;
  search(criteria: RulesReferenceSearchCriteria): Promise<RulesReference[]>;
}

export const RULES_REFERENCE_REPOSITORY = Symbol('RulesReferenceRepository');
