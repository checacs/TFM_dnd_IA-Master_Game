import {
  mapCondition, mapSkill, mapDamageType, mapAbilityScore, mapRuleSection,
  Dnd5eApiCondition, Dnd5eApiSkill, Dnd5eApiDamageType, Dnd5eApiAbilityScore, Dnd5eApiRuleSection,
} from './rules-reference-mapper';

// JSON reales de dnd5eapi.co
const BLINDED_FIXTURE: Dnd5eApiCondition = {
  index: 'blinded',
  name: 'Blinded',
  desc: [
    "A blinded creature can't see and automatically fails any ability check that requires sight.",
    "Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage.",
  ],
};

const FRIGHTENED_FIXTURE: Dnd5eApiCondition = {
  index: 'frightened',
  name: 'Frightened',
  desc: [
    'A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.',
    "The creature can't willingly move closer to the source of its fear.",
  ],
};

const ACROBATICS_FIXTURE: Dnd5eApiSkill = {
  index: 'acrobatics',
  name: 'Acrobatics',
  desc: [
    "Your Dexterity (Acrobatics) check covers your attempt to stay on your feet in a tricky situation, such as when you're trying to run across a sheet of ice, balance on a tightrope, or stay upright on a rocking ship's deck.",
  ],
  ability_score: { index: 'dex', name: 'DEX' },
};

const ACID_FIXTURE: Dnd5eApiDamageType = {
  index: 'acid',
  name: 'Acid',
  desc: ["The corrosive spray of a black dragon's breath and the dissolving enzymes secreted by a black pudding deal acid damage."],
};

// JSON real de GET https://www.dnd5eapi.co/api/2014/ability-scores/cha
const CHA_FIXTURE: Dnd5eApiAbilityScore = {
  index: 'cha',
  name: 'CHA',
  full_name: 'Charisma',
  desc: [
    'Charisma measures your ability to interact effectively with others. It includes such factors as confidence and eloquence, and it can represent a charming or commanding personality.',
    'A Charisma check might arise when you try to influence or entertain others, when you try to make an impression or tell a convincing lie, or when you are navigating a tricky social situation. The Deception, Intimidation, Performance, and Persuasion skills reflect aptitude in certain kinds of Charisma checks.',
  ],
  skills: [
    { index: 'deception', name: 'Deception' },
    { index: 'intimidation', name: 'Intimidation' },
    { index: 'performance', name: 'Performance' },
    { index: 'persuasion', name: 'Persuasion' },
  ],
};

// Excerpt real (primer párrafo) de GET https://www.dnd5eapi.co/api/2014/rule-sections/ability-checks
// — recortado por brevedad, mapRuleSection no procesa el texto, solo lo traslada tal cual.
const ABILITY_CHECKS_FIXTURE: Dnd5eApiRuleSection = {
  index: 'ability-checks',
  name: 'Ability Checks',
  desc:
    "## Ability Checks\n\nAn ability check tests a character's or monster's innate talent and training in an effort to overcome a challenge. The GM calls for an ability check when a character or monster attempts an action (other than an attack) that has a chance of failure. When the outcome is uncertain, the dice determine the results.",
};

describe('mapCondition', () => {
  it('mapea blinded al formato RulesReferenceProps', () => {
    expect(mapCondition(BLINDED_FIXTURE)).toEqual({
      _id: 'condition:blinded',
      kind: 'condition',
      name: 'Blinded',
      description:
        "A blinded creature can't see and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage.",
      abilityScore: null,
      relatedSkills: null,
    });
  });

  it('mapea frightened igual de bien', () => {
    expect(mapCondition(FRIGHTENED_FIXTURE).name).toBe('Frightened');
  });
});

describe('mapSkill', () => {
  it('mapea acrobatics, incluyendo su ability_score', () => {
    expect(mapSkill(ACROBATICS_FIXTURE)).toEqual({
      _id: 'skill:acrobatics',
      kind: 'skill',
      name: 'Acrobatics',
      description:
        "Your Dexterity (Acrobatics) check covers your attempt to stay on your feet in a tricky situation, such as when you're trying to run across a sheet of ice, balance on a tightrope, or stay upright on a rocking ship's deck.",
      abilityScore: 'dex',
      relatedSkills: null,
    });
  });
});

describe('mapDamageType', () => {
  it('mapea acid', () => {
    expect(mapDamageType(ACID_FIXTURE)).toEqual({
      _id: 'damage-type:acid',
      kind: 'damage-type',
      name: 'Acid',
      description: "The corrosive spray of a black dragon's breath and the dissolving enzymes secreted by a black pudding deal acid damage.",
      abilityScore: null,
      relatedSkills: null,
    });
  });
});

describe('mapAbilityScore', () => {
  it('mapea Charisma, usando full_name (no el código corto CHA) y sus skills asociadas', () => {
    expect(mapAbilityScore(CHA_FIXTURE)).toEqual({
      _id: 'ability-score:cha',
      kind: 'ability-score',
      name: 'Charisma',
      description:
        'Charisma measures your ability to interact effectively with others. It includes such factors as confidence and eloquence, and it can represent a charming or commanding personality. A Charisma check might arise when you try to influence or entertain others, when you try to make an impression or tell a convincing lie, or when you are navigating a tricky social situation. The Deception, Intimidation, Performance, and Persuasion skills reflect aptitude in certain kinds of Charisma checks.',
      abilityScore: null,
      relatedSkills: ['Deception', 'Intimidation', 'Performance', 'Persuasion'],
    });
  });
});

describe('mapRuleSection', () => {
  it('mapea ability-checks, usando desc tal cual (ya es un único string, no un array)', () => {
    expect(mapRuleSection(ABILITY_CHECKS_FIXTURE)).toEqual({
      _id: 'rule-section:ability-checks',
      kind: 'rule-section',
      name: 'Ability Checks',
      description: ABILITY_CHECKS_FIXTURE.desc,
      abilityScore: null,
      relatedSkills: null,
    });
  });
});
