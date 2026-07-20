export interface Dnd5eApiCondition {
  index: string;
  name: string;
  desc: string[];
}

export interface Dnd5eApiSkill {
  index: string;
  name: string;
  desc: string[];
  ability_score: { index: string; name: string };
}

export interface Dnd5eApiDamageType {
  index: string;
  name: string;
  desc: string[];
}

export interface Dnd5eApiAbilityScore {
  index: string;
  name: string;
  full_name: string;
  desc: string[];
  skills: { index: string; name: string }[];
}

export interface Dnd5eApiRuleSection {
  index: string;
  name: string;
  /** A diferencia de condition/skill/damage-type, aquí desc ya es un único string en markdown, no un array. */
  desc: string;
}

interface MappedRulesReference {
  _id: string;
  kind: 'condition' | 'skill' | 'damage-type' | 'ability-score' | 'rule-section';
  name: string;
  description: string;
  abilityScore: string | null;
  relatedSkills: string[] | null;
}

export function mapCondition(condition: Dnd5eApiCondition): MappedRulesReference {
  return {
    _id: `condition:${condition.index}`,
    kind: 'condition',
    name: condition.name,
    description: condition.desc.join(' '),
    abilityScore: null,
    relatedSkills: null,
  };
}

export function mapSkill(skill: Dnd5eApiSkill): MappedRulesReference {
  return {
    _id: `skill:${skill.index}`,
    kind: 'skill',
    name: skill.name,
    description: skill.desc.join(' '),
    abilityScore: skill.ability_score.index,
    relatedSkills: null,
  };
}

export function mapDamageType(damageType: Dnd5eApiDamageType): MappedRulesReference {
  return {
    _id: `damage-type:${damageType.index}`,
    kind: 'damage-type',
    name: damageType.name,
    description: damageType.desc.join(' '),
    abilityScore: null,
    relatedSkills: null,
  };
}

/** Usa full_name ("Charisma"), no el código corto (name: "CHA") — más útil para narrar. */
export function mapAbilityScore(abilityScore: Dnd5eApiAbilityScore): MappedRulesReference {
  return {
    _id: `ability-score:${abilityScore.index}`,
    kind: 'ability-score',
    name: abilityScore.full_name,
    description: abilityScore.desc.join(' '),
    abilityScore: null,
    relatedSkills: abilityScore.skills.map((s) => s.name),
  };
}

export function mapRuleSection(ruleSection: Dnd5eApiRuleSection): MappedRulesReference {
  return {
    _id: `rule-section:${ruleSection.index}`,
    kind: 'rule-section',
    name: ruleSection.name,
    description: ruleSection.desc,
    abilityScore: null,
    relatedSkills: null,
  };
}
