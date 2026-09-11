import { RulesReference } from './rules-reference.entity';

describe('RulesReference', () => {
  it('expone sus datos a través de toSnapshot', () => {
    const ref = RulesReference.create({
      kind: 'condition',
      name: 'Blinded',
      description: "A blinded creature can't see...",
      abilityScore: null,
      relatedSkills: null,
    });

    expect(ref.toSnapshot().kind).toBe('condition');
    expect(ref.toSnapshot().name).toBe('Blinded');
  });

  it('guarda abilityScore solo cuando aplica (skill)', () => {
    const ref = RulesReference.create({
      kind: 'skill',
      name: 'Acrobatics',
      description: 'Your Dexterity (Acrobatics) check...',
      abilityScore: 'dex',
      relatedSkills: null,
    });

    expect(ref.toSnapshot().abilityScore).toBe('dex');
  });

  it('guarda relatedSkills solo cuando aplica (ability-score)', () => {
    const ref = RulesReference.create({
      kind: 'ability-score',
      name: 'Charisma',
      description: 'Charisma measures your ability to interact effectively with others...',
      abilityScore: null,
      relatedSkills: ['Deception', 'Intimidation', 'Performance', 'Persuasion'],
    });

    expect(ref.toSnapshot().relatedSkills).toEqual(['Deception', 'Intimidation', 'Performance', 'Persuasion']);
  });

  it('toSnapshot devuelve copia, no la referencia interna de relatedSkills', () => {
    const ref = RulesReference.create({
      kind: 'ability-score', name: 'Charisma', description: '...', abilityScore: null,
      relatedSkills: ['Deception'],
    });
    const snapshot = ref.toSnapshot();
    snapshot.relatedSkills?.push('otra');

    expect(ref.toSnapshot().relatedSkills).toEqual(['Deception']);
  });
});
