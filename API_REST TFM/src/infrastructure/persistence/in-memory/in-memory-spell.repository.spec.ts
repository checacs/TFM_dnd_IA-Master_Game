import { InMemorySpellRepository } from './in-memory-spell.repository';
import { Spell } from '../../../domain/entities/spell.entity';

function buildFireball() {
  return Spell.create({
    name: 'Fireball', level: 3, school: 'Evocation', castingTime: '1 action', range: '150 feet',
    duration: 'Instantaneous', concentration: false, ritual: false, components: ['V', 'S', 'M'],
    material: null, description: '...', classes: ['sorcerer', 'wizard'], damageType: 'fire',
    damageAtSlotLevel: { '3': '8d6' }, savingThrowAbility: 'dex', savingThrowSuccess: 'half',
    areaOfEffectType: 'sphere', areaOfEffectSize: 20,
  });
}

describe('InMemorySpellRepository', () => {
  it('devuelve exactamente el estado guardado al recuperarlo (ida y vuelta)', async () => {
    const repo = new InMemorySpellRepository();
    const fireball = buildFireball();

    await repo.save(fireball);
    const recovered = await repo.findById(fireball.id);

    expect(recovered?.toSnapshot()).toEqual(fireball.toSnapshot());
  });

  it('search filtra por clase y nivel máximo', async () => {
    const repo = new InMemorySpellRepository();
    await repo.save(buildFireball());

    expect(await repo.search({ classIndex: 'wizard' })).toHaveLength(1);
    expect(await repo.search({ classIndex: 'cleric' })).toHaveLength(0);
    expect(await repo.search({ maxLevel: 2 })).toHaveLength(0);
  });
});
