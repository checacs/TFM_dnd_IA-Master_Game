import { Injectable } from '@nestjs/common';
import { CharacterRepository } from '../../../domain/ports/character.repository.port';
import { Character } from '../../../domain/entities/character.entity';

@Injectable()
export class InMemoryCharacterRepository implements CharacterRepository {
  private readonly characters = new Map<string, Character>();

  async findById(id: string): Promise<Character | null> {
    return this.characters.get(id) ?? null;
  }

  async save(character: Character): Promise<void> {
    this.characters.set(character.id, character);
  }
}
