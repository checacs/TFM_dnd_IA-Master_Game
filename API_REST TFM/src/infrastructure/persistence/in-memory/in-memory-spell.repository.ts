import { Injectable } from '@nestjs/common';
import { SpellRepository, SpellSearchCriteria } from '../../../domain/ports/spell.repository.port';
import { Spell } from '../../../domain/entities/spell.entity';

@Injectable()
export class InMemorySpellRepository implements SpellRepository {
  private readonly spells = new Map<string, Spell>();

  async findById(id: string): Promise<Spell | null> {
    return this.spells.get(id) ?? null;
  }

  async search(criteria: SpellSearchCriteria): Promise<Spell[]> {
    return Array.from(this.spells.values()).filter((spell) => {
      const snapshot = spell.toSnapshot();
      const matchesClass = !criteria.classIndex || snapshot.classes.includes(criteria.classIndex);
      const matchesLevel = criteria.maxLevel === undefined || snapshot.level <= criteria.maxLevel;
      return matchesClass && matchesLevel;
    });
  }

  async save(spell: Spell): Promise<void> {
    this.spells.set(spell.id, spell);
  }
}
