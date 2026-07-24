import { EquipmentRepository, EquipmentSearchCriteria } from '../../domain/ports/equipment.repository.port';
import { Equipment } from '../../domain/entities/equipment.entity';
import { SearchEquipmentUseCase } from './search-equipment.use-case';

class FakeEquipmentRepository implements EquipmentRepository {
  constructor(private readonly items: Equipment[] = []) {}
  async findById(id: string): Promise<Equipment | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }
  async search(criteria: EquipmentSearchCriteria): Promise<Equipment[]> {
    return this.items.filter((item) => !criteria.category || item.toSnapshot().category === criteria.category);
  }
}

function buildDagger() {
  return Equipment.create(
    {
      name: 'Dagger', category: 'Weapon', cost: { quantity: 2, unit: 'gp' }, weight: 1, description: '',
      weaponCategory: 'Simple', weaponRange: 'Melee', damageDice: '1d4', damageType: 'piercing',
      properties: ['finesse'], armorClass: null,
    },
    'dagger',
  );
}

function buildLeatherArmor() {
  return Equipment.create(
    {
      name: 'Leather Armor', category: 'Armor', cost: { quantity: 10, unit: 'gp' }, weight: 10, description: '',
      weaponCategory: null, weaponRange: null, damageDice: null, damageType: null,
      properties: [], armorClass: { base: 11, dexBonus: true, maxBonus: null },
    },
    'leather-armor',
  );
}

describe('SearchEquipmentUseCase', () => {
  it(
      'devuelve cost, damageDice y armorClass reales -- antes solo devolvía id/name/category, y el DM-IA ' +
      'no tenía forma de conocer el precio real de un objeto para narrar una compra (buy_item) sin inventárselo',
      async () => {
        const useCase = new SearchEquipmentUseCase(new FakeEquipmentRepository([buildDagger(), buildLeatherArmor()]));

        const results = await useCase.execute({});

        expect(results).toEqual([
          { id: 'dagger', name: 'Dagger', category: 'Weapon', cost: { quantity: 2, unit: 'gp' }, damageDice: '1d4', armorClass: null },
          { id: 'leather-armor', name: 'Leather Armor', category: 'Armor', cost: { quantity: 10, unit: 'gp' }, damageDice: null, armorClass: { base: 11, dexBonus: true, maxBonus: null } },
        ]);
      },
  );

  it('filtra por categoría', async () => {
    const useCase = new SearchEquipmentUseCase(new FakeEquipmentRepository([buildDagger(), buildLeatherArmor()]));

    const results = await useCase.execute({ category: 'Armor' });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Leather Armor');
  });
});
