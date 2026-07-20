import { SpellRepository, SpellSearchCriteria } from '../../domain/ports/spell.repository.port';
import { Spell } from '../../domain/entities/spell.entity';
import { SearchSpellsUseCase } from './search-spells.use-case';

class FakeSpellRepository implements SpellRepository {
  constructor(private readonly spells: Spell[] = []) {}
  async findById(id: string): Promise<Spell | null> {
    return this.spells.find((s) => s.id === id) ?? null;
  }
  async search(criteria: SpellSearchCriteria): Promise<Spell[]> {
    return this.spells.filter((s) => {
      const snapshot = s.toSnapshot();
      const matchesClass = !criteria.classIndex || snapshot.classes.includes(criteria.classIndex);
      const matchesLevel = criteria.maxLevel === undefined || snapshot.level <= criteria.maxLevel;
      return matchesClass && matchesLevel;
    });
  }
}

function buildFireball() {
  return Spell.create({
    name: 'Fireball', level: 3, school: 'Evocation', castingTime: '1 action', range: '150 feet',
    duration: 'Instantaneous', concentration: false, ritual: false, components: ['V', 'S', 'M'],
    material: null, description: '...', classes: ['sorcerer', 'wizard'], damageType: 'fire',
    damageAtSlotLevel: { '3': '8d6' }, savingThrowAbility: 'dex', savingThrowSuccess: 'half',
    areaOfEffectType: 'sphere', areaOfEffectSize: 20,
  });
}

function buildMageArmor() {
  return Spell.create({
    name: 'Mage Armor', level: 1, school: 'Abjuration', castingTime: '1 action', range: 'Touch',
    duration: '8 hours', concentration: false, ritual: false, components: ['V', 'S', 'M'],
    material: null, description: '...', classes: ['sorcerer', 'wizard'], damageType: null,
    damageAtSlotLevel: null, savingThrowAbility: null, savingThrowSuccess: null,
    areaOfEffectType: null, areaOfEffectSize: null,
  });
}

describe('SearchSpellsUseCase', () => {
  it('filtra por clase', async () => {
    const repo = new FakeSpellRepository([buildFireball(), buildMageArmor()]);
    const useCase = new SearchSpellsUseCase(repo);

    const results = await useCase.execute({ classIndex: 'wizard' });
    expect(results).toHaveLength(2);
  });

  it('filtra por nivel máximo', async () => {
    const repo = new FakeSpellRepository([buildFireball(), buildMageArmor()]);
    const useCase = new SearchSpellsUseCase(repo);

    const results = await useCase.execute({ maxLevel: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Mage Armor');
  });

  it('devuelve solo los campos relevantes para elegir, no la ficha completa', async () => {
    const repo = new FakeSpellRepository([buildFireball()]);
    const useCase = new SearchSpellsUseCase(repo);

    const [result] = await useCase.execute({});
    expect(result).toEqual({ id: expect.any(String), name: 'Fireball', level: 3, school: 'Evocation' });
  });
});
